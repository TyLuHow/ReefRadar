"""
CONTRACT-04: version stamps for analysis results.

Every new analysis RESULT item pins the four versions it was produced with:
contract_version, dataset_version, model_version and preprocessing_spec_version
(see contracts/schema/analysis-result.schema.json). The values come from a
small JSON file committed at contracts/bucket/v2/stamp.json and bundled into
the classifier deployment package as contract_stamp.json -- never fetched at
runtime. Imports only the standard library and reef_audio (for SPEC_VERSION);
both ship flat in the classifier zip, so it runs unchanged there.
"""

from __future__ import annotations

import json
import os
from typing import Any, Optional

from reef_audio import SPEC_VERSION

_MODULE_DIR = os.path.dirname(os.path.abspath(__file__))

# Bundled filename used when this module is deployed inside a Lambda zip
# alongside a copy of the stamp (infrastructure/lambda-packages/classifier.json).
_BUNDLED_FILENAME = "contract_stamp.json"

# Repository file, resolved relative to this module in a checkout (tests,
# local runs). An absolute path here would win over _MODULE_DIR in os.path.join.
_REPO_STAMP_RELATIVE = os.path.join("..", "..", "contracts", "bucket", "v2", "stamp.json")

STAMP_KEYS = (
    "contract_version",
    "dataset_version",
    "model_version",
    "preprocessing_spec_version",
)


def load_stamp(path: Optional[str] = None) -> dict:
    """Load the version-stamp document.

    When `path` is None: prefer `contract_stamp.json` sitting next to this
    module (the Lambda package layout), and fall back to the repository file
    contracts/bucket/v2/stamp.json. Tests and deployed Lambdas therefore share
    one loading path with no environment variable.
    """
    if path is None:
        bundled_path = os.path.join(_MODULE_DIR, _BUNDLED_FILENAME)
        if os.path.exists(bundled_path):
            path = bundled_path
        else:
            path = os.path.join(_MODULE_DIR, _REPO_STAMP_RELATIVE)

    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def stamp_for_model(
    loaded_model_version: Optional[str],
    stamp: dict,
    windows_spec_version: Optional[str] = None,
) -> dict:
    """Return the four-key stamp for a result produced by `loaded_model_version`.

    Staleness guard (T-02-05-01): model_version is always the running model's
    own version (the truth from the loaded config). contract_version,
    dataset_version and preprocessing_spec_version describe what the bundled
    stamp was written for, so they are copied only when ALL of these hold:

      - the loaded model IS the stamp's model,
      - this code's reef_audio.SPEC_VERSION equals the stamp's
        preprocessing_spec_version (05-CONTEXT: stamp_for_model requires the
        preprocessing the code runs to be the one the stamp names), and
      - when `windows_spec_version` is given, the windows were prepared under
        that same spec.

    Otherwise they are null -- an honest "not covered by a published contract"
    rather than a stale claim. A model without a version is never covered.
    """
    covered = (
        loaded_model_version is not None
        and loaded_model_version == stamp.get("model_version")
        and SPEC_VERSION == stamp.get("preprocessing_spec_version")
        and (windows_spec_version is None or windows_spec_version == SPEC_VERSION)
    )
    out: dict[str, Any] = {
        "contract_version": stamp.get("contract_version") if covered else None,
        "dataset_version": stamp.get("dataset_version") if covered else None,
        "model_version": loaded_model_version,
        "preprocessing_spec_version": stamp.get("preprocessing_spec_version") if covered else None,
    }
    return out
