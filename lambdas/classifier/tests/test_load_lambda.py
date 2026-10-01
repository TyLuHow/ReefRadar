"""
Tests for the offline Lambda loader (lambdas/conftest.py::load_lambda).

Both lambdas/router/handler.py and lambdas/classifier/handler.py are
named `handler.py`. These tests confirm `load_lambda` resolves each to a
distinct module object, and that importing a handler never contacts real
AWS (fake credentials are forced in conftest.py before any handler
module-level `boto3.client(...)`/`boto3.resource(...)` call runs).
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from conftest import load_lambda  # noqa: E402


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
