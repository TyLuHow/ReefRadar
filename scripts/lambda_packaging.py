"""
D-03: Deterministic Lambda package builder and manifest-based drift
comparison. Stdlib only (json, zipfile, hashlib, io, pathlib, tarfile,
gzip, base64) -- shared by scripts/drift-check.py and
scripts/deploy-lambdas.py.

Why manifests, not zip-blob hashes: Lambda's CodeSha256 is
sha256(zip_bytes), and a plain `zip -r` (the command already documented
in CLAUDE.md's deploy section) embeds file mtimes and OS-dependent
permission bits in the archive, so two builds of byte-identical source
produce different zip bytes. build_package() below pins every piece of
non-content metadata (date_time, external_attr, create_system,
compression) so repeated builds from the same source are byte-identical
on any platform; manifest_from_zip()/compare_manifests() additionally
let drift-check compare an *already-deployed* archive (built by whatever
tool produced it) against a fresh local build by content hash alone.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import pathlib
import tarfile
import zipfile
from typing import Callable, Iterable, Optional

PACKAGE_DIR = pathlib.Path(__file__).resolve().parent.parent / "infrastructure" / "lambda-packages"

VALID_FUNCTIONS = ("router", "preprocessor", "classifier", "inference")

# Fixed per-entry ZipInfo metadata: makes build_package's output depend only
# on member bytes and archive paths, never on filesystem mtimes, host OS
# permission bits, or which platform (Windows vs. Linux CI) built it.
_FIXED_DATE_TIME = (1980, 1, 1, 0, 0, 0)
_FIXED_EXTERNAL_ATTR = 0o100644 << 16
_FIXED_CREATE_SYSTEM = 3  # Unix, so external_attr's permission bits are honored on every platform


class SpecError(ValueError):
    """Raised for an unknown function name, missing/invalid spec, or unreadable input."""


def load_spec(function_name: str) -> dict:
    """Load and parse infrastructure/lambda-packages/<function_name>.json.

    Only the four known function names are accepted -- this is also the
    allowlist drift-check.py and deploy-lambdas.py use to validate
    --function, so no script ever interpolates an arbitrary name into a
    filesystem path or shell command.
    """
    if function_name not in VALID_FUNCTIONS:
        raise SpecError(
            f"Unknown function {function_name!r}; expected one of {VALID_FUNCTIONS}"
        )
    spec_path = PACKAGE_DIR / f"{function_name}.json"
    if not spec_path.is_file():
        raise SpecError(f"Spec file not found: {spec_path}")
    try:
        with spec_path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        raise SpecError(f"Could not read spec {spec_path}: {e}") from e


def _default_reader(repo_root: pathlib.Path, source: str) -> bytes:
    path = pathlib.Path(repo_root) / source
    try:
        data = path.read_bytes()
    except OSError as e:
        raise SpecError(f"Could not read member source {path}: {e}") from e
    return normalize_text_bytes(data)


def normalize_text_bytes(data: bytes) -> bytes:
    """Normalize CRLF -> LF.

    Every member these specs ever reference is a text/source file
    (handler.py, region_detection.py, inference.py, Dockerfile,
    requirements.txt, buildspec.yml), never a binary asset, so this is
    always safe. Without it, build_package's output would depend on the
    local checkout's line-ending style: a Windows working tree with
    core.autocrlf=true checks files out with CRLF, while the git blob
    itself -- what a fresh Linux clone or `git show <ref>:<path>` both
    return -- is LF. That would silently break this module's core
    promise (building twice from the same git content yields
    byte-identical zips) across machines, exactly the kind of drift
    D-03/D-04 exist to prevent.
    """
    return data.replace(b"\r\n", b"\n")


def build_package(
    spec: dict,
    repo_root: "str | pathlib.Path",
    reader: Optional[Callable[[pathlib.Path, str], bytes]] = None,
) -> bytes:
    """Build a deterministic zip for a 'zip'-kind spec.

    Members are sorted by archive_path before writing (not source-file
    order), and every entry gets fixed ZipInfo metadata, so calling this
    twice on identical source content always returns byte-identical zip
    bytes -- the premise D-03's drift check depends on.

    `reader(repo_root, source) -> bytes` defaults to reading the file off
    disk; deploy-lambdas.py's --ref rollback path passes a reader backed
    by `git show <ref>:<source>` instead, to build from a past commit
    without touching the working tree.
    """
    if spec.get("kind") != "zip":
        raise SpecError(f"build_package only supports kind='zip', got {spec.get('kind')!r}")

    repo_root = pathlib.Path(repo_root)
    read = reader or _default_reader
    members = sorted(spec["members"], key=lambda m: m["archive_path"])

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for member in members:
            data = read(repo_root, member["source"])
            info = zipfile.ZipInfo(filename=member["archive_path"], date_time=_FIXED_DATE_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = _FIXED_EXTERNAL_ATTR
            info.create_system = _FIXED_CREATE_SYSTEM
            zf.writestr(info, data, compresslevel=9)
    return buf.getvalue()


def code_sha256(zip_bytes: bytes) -> str:
    """Base64 of the raw SHA-256 digest -- the exact format Lambda's CodeSha256 uses."""
    return base64.b64encode(hashlib.sha256(zip_bytes).digest()).decode("ascii")


def _is_ignored(archive_path: str) -> bool:
    parts = archive_path.split("/")
    if "__pycache__" in parts:
        return True
    if archive_path.endswith(".pyc"):
        return True
    return False


def manifest_from_zip(zip_bytes: bytes) -> dict:
    """{archive_path: sha256_hex} for every real file in a zip.

    Skips directory entries and __pycache__/*.pyc, so a deployed archive
    that happens to carry compiled bytecode never shows up as spurious
    drift against a source-only local build.
    """
    manifest: dict[str, str] = {}
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            if _is_ignored(info.filename):
                continue
            data = zf.read(info.filename)
            manifest[info.filename] = hashlib.sha256(data).hexdigest()
    return manifest


def manifest_from_spec(
    spec: dict,
    repo_root: "str | pathlib.Path",
    reader: Optional[Callable[[pathlib.Path, str], bytes]] = None,
) -> dict:
    """{archive_path: sha256_hex} computed directly from a spec's local
    member sources, without zipping -- used for container-kind specs,
    where there's no local zip to build (the image is built elsewhere by
    CodeBuild/Docker), only a manifest to compare against extracted
    image layers.
    """
    repo_root = pathlib.Path(repo_root)
    read = reader or _default_reader
    manifest: dict[str, str] = {}
    for member in spec["members"]:
        data = read(repo_root, member["source"])
        manifest[member["archive_path"]] = hashlib.sha256(data).hexdigest()
    return manifest


def compare_manifests(expected: dict, actual: dict) -> dict:
    """Diff two {archive_path: sha256_hex} manifests.

    Returns {"missing": [...], "extra": [...], "changed": [...]}, each a
    sorted list of archive paths. An empty report (all three lists empty)
    means the manifests match.
    """
    expected_paths = set(expected)
    actual_paths = set(actual)
    missing = sorted(expected_paths - actual_paths)
    extra = sorted(actual_paths - expected_paths)
    changed = sorted(p for p in expected_paths & actual_paths if expected[p] != actual[p])
    return {"missing": missing, "extra": extra, "changed": changed}


def manifest_matches(report: dict) -> bool:
    return not (report["missing"] or report["extra"] or report["changed"])


def manifest_from_layers(
    layer_blobs: Iterable[bytes],
    workdir: str = "var/task",
    wanted: Optional[set] = None,
) -> dict:
    """{archive_path: sha256_hex} for `wanted` files under `workdir`,
    extracted from a sequence of gzip-tar container image layers.

    Layers are applied in order (later layers override earlier ones,
    mirroring how a container image's filesystem is actually assembled)
    and OCI whiteout files (a `.wh.<name>` entry deletes `<name>` from
    the result built so far) are honored. Archives are read in memory
    and only hashed -- nothing is ever extracted to disk, so a crafted
    path-traversal member name in an untrusted layer can't write a file.
    """
    workdir = workdir.strip("/")
    manifest: dict[str, str] = {}
    for blob in layer_blobs:
        with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tf:
            for member in tf.getmembers():
                name = member.name.lstrip("./")
                if workdir and not (name == workdir or name.startswith(workdir + "/")):
                    continue
                rel = name[len(workdir):].lstrip("/") if workdir else name

                if "/" in rel:
                    rel_dir, base = rel.rsplit("/", 1)
                else:
                    rel_dir, base = "", rel

                if base.startswith(".wh."):
                    deleted_name = base[len(".wh."):]
                    deleted_rel = f"{rel_dir}/{deleted_name}" if rel_dir else deleted_name
                    manifest.pop(deleted_rel, None)
                    continue

                if not member.isfile():
                    continue
                if wanted is not None and rel not in wanted:
                    continue

                extracted = tf.extractfile(member)
                if extracted is None:
                    continue
                data = extracted.read()
                manifest[rel] = hashlib.sha256(data).hexdigest()
    return manifest
