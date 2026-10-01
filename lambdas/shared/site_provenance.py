"""
D-17: Site label provenance overlay.

One function, shared by the router, the classifier and the test/fixture
scripts (see data/site-label-provenance.json), that answers "which dataset
assigned this site's label, what did that dataset call it, and what does the
label mean" for every one of the 54 reference sites. Stdlib only.

Why this exists: four different upstream datasets (MARRS, CoralSoundExplorer,
Hurricane Irma, NOAA SanctSound) feed ReefRadar's 54 reference sites, and
only MARRS assigns anything that is actually a reef-health category. The
other three either describe a use/disturbance context (CoralSoundExplorer)
or assign no health status at all (Irma, SanctSound) -- see
.planning/audit/DATA-MODEL.md section 5 and section 6 ("Claims the UI may
and may not make"). apply_label_provenance() is the single place that turns
a bare Site record into one that honestly states provenance, so the router,
classifier and fixture builder can never drift apart on this again.
"""

from __future__ import annotations

import json
import os
from typing import Any, Optional

_MODULE_DIR = os.path.dirname(os.path.abspath(__file__))

# Bundled filename used when this module is deployed inside a Lambda zip
# alongside a copy of the provenance data (the layout plans 01-11/01-12
# produce). Deliberately an underscore-separated name, distinct from the
# hyphenated repository file (data/site-label-provenance.json) it mirrors.
_BUNDLED_FILENAME = "site_label_provenance.json"


def load_provenance(path: Optional[str] = None) -> dict:
    """Load the site-label-provenance document.

    When `path` is None: prefer `site_label_provenance.json` sitting next to
    this module (the Lambda package layout plans 01-11/01-12 produce), and
    fall back to the repository file resolved relative to this module
    (`../../data/site-label-provenance.json`). This means tests (which run
    against the repo checkout) and deployed Lambdas (which run against a
    bundled copy) share the exact same loading code path, with no
    environment variable required to distinguish the two.
    """
    if path is None:
        bundled_path = os.path.join(_MODULE_DIR, _BUNDLED_FILENAME)
        if os.path.exists(bundled_path):
            path = bundled_path
        else:
            path = os.path.join(_MODULE_DIR, "..", "..", "data", "site-label-provenance.json")

    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _resolve_source_key(site_id: str, sources: dict) -> str:
    for source_key, source in sources.items():
        for prefix in source.get("site_id_prefixes", ()):
            if site_id.startswith(prefix):
                return source_key
    raise KeyError(
        f"No label provenance source matches site_id {site_id!r} "
        f"(no site_id_prefixes entry in any source covers it)"
    )


def apply_label_provenance(site: dict, prov: dict) -> dict:
    """Return a new dict: `site` overlaid with its label provenance.

    Never mutates `site`. Preserves every key already on `site` and adds:
      - label_source (citation id, a key of data/site-label-provenance.json
        "sources", which is also a key of dashboard-next/src/data/citations.json)
      - label_source_name (human-readable dataset display name)
      - label_assigned_by (who assigned the label upstream)
      - label_original (the dataset's own term for this site's class, or the
        per-site override term; None where the dataset has no term)
      - label_definition (what that term means, or the per-site override
        definition; None where no definition applies)
      - status_basis (why `status` is what it is, for sites where that needs
        stating explicitly; None otherwise)
      - period (a free-text note about *when* this site's embedding/audio was
        recorded relative to some event, e.g. Hurricane Irma; None otherwise)
      - label_note (any other provenance caveat, e.g. the ken_D3/ken_D2
        naming mismatch; None otherwise)

    `status` is never changed to anything other than the site's existing
    MARRS-assigned status, or "unknown" via an explicit per-site
    `status_override` -- this function never invents a new status value.

    Raises KeyError if `site["site_id"]` matches no source's
    `site_id_prefixes` (an unknown/un-provisioned site id).
    """
    site_id = site["site_id"]
    sources = prov["sources"]
    source_key = _resolve_source_key(site_id, sources)
    source = sources[source_key]
    override = prov.get("sites", {}).get(site_id, {})

    original_status = site.get("status")

    result: dict[str, Any] = dict(site)
    result["status"] = override.get("status_override", original_status)

    result["label_source"] = source_key
    result["label_source_name"] = source["display_name"]
    result["label_assigned_by"] = source["assigned_by"]

    if "label_original" in override:
        result["label_original"] = override["label_original"]
    else:
        result["label_original"] = source.get("original_terms", {}).get(original_status)

    if "label_definition" in override:
        result["label_definition"] = override["label_definition"]
    else:
        result["label_definition"] = source.get("definitions", {}).get(original_status)

    result["status_basis"] = override.get("status_basis")
    result["period"] = override.get("period")
    result["label_note"] = override.get("label_note")

    return result
