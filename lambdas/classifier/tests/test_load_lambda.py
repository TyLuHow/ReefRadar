"""
Tests for the offline Lambda loader (lambdas/conftest.py::load_lambda).

Both lambdas/router/handler.py and lambdas/classifier/handler.py are
named `handler.py`. These tests confirm `load_lambda` resolves each to a
distinct module object, and that importing a handler never contacts real
AWS (fake credentials are forced in conftest.py before any handler
module-level `boto3.client(...)`/`boto3.resource(...)` call runs).
"""

import importlib.util
import os
from pathlib import Path

# Load lambdas/conftest.py by explicit file path rather than
# `from conftest import load_lambda`: a bare `import conftest` is cached
# in sys.modules by its literal filename, so once a second conftest.py
# exists anywhere else in the collected test tree (e.g.
# scripts/tests/conftest.py), whichever one pytest's own internal
# collection happens to import last silently wins the "conftest" cache
# slot for this statement too, regardless of sys.path order.
_LAMBDAS_DIR = Path(__file__).resolve().parent.parent.parent
_spec = importlib.util.spec_from_file_location("lambdas_conftest", _LAMBDAS_DIR / "conftest.py")
_lambdas_conftest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_lambdas_conftest)
load_lambda = _lambdas_conftest.load_lambda


def test_load_lambda_returns_distinct_modules_for_same_filename():
    router_handler = load_lambda("router")
    classifier_handler = load_lambda("classifier")

    assert router_handler is not classifier_handler
    assert router_handler.__name__ == "lambda_router_handler"
    assert classifier_handler.__name__ == "lambda_classifier_handler"


def test_load_lambda_rejects_unknown_function():
    import pytest

    with pytest.raises(ValueError):
        load_lambda("not_a_real_lambda")


def test_importing_handlers_never_contacts_real_aws():
    # conftest.py forces fake credentials and pops AWS_PROFILE at import
    # time, before this test module (or any handler) is imported.
    assert os.environ["AWS_ACCESS_KEY_ID"] == "testing"
    assert os.environ["AWS_SECRET_ACCESS_KEY"] == "testing"
    assert "AWS_PROFILE" not in os.environ

    # Loading both handlers must succeed without raising a credentials
    # or network error — module-level boto3 client/resource creation
    # does not itself make a network call, but validates credentials
    # are at least present.
    router_handler = load_lambda("router")
    classifier_handler = load_lambda("classifier")
    assert router_handler.AUDIO_BUCKET == "reefradar-2477-audio"
    assert classifier_handler.AUDIO_BUCKET == "reefradar-2477-audio"


def test_classifier_handler_resolves_sibling_region_detection_import():
    # classifier/handler.py does `from region_detection import detect_region,
    # adjust_classification` — this only resolves if lambdas/classifier was
    # temporarily placed on sys.path during the load.
    classifier_handler = load_lambda("classifier")
    assert hasattr(classifier_handler, "detect_region")
    assert hasattr(classifier_handler, "adjust_classification")
