"""
Shared pytest fixtures for all Lambda tests.

Forces fake AWS credentials before any handler module is imported, so a
mis-written test can never read or write the real `reefradar-2477-*`
resources. Provides `load_lambda()` to import two different Lambda
modules that are both named `handler.py` as distinct Python module
objects, and an `aws` fixture that wraps moto's `mock_aws()` for tests
that need a fake S3/DynamoDB to talk to.
"""

import importlib.util
import os
import sys

import pytest
from moto import mock_aws

# --- Force fake AWS credentials at import time ---------------------------
# Any Lambda handler module creates boto3 clients/resources at import time
# (module-level `boto3.client(...)` calls). Setting these here, before any
# handler is imported, guarantees those clients can never reach real AWS.
os.environ["AWS_ACCESS_KEY_ID"] = "testing"
os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
os.environ["AWS_SESSION_TOKEN"] = "testing"
os.environ["AWS_DEFAULT_REGION"] = "us-east-1"
os.environ.pop("AWS_PROFILE", None)

# Mirror production resource names so fixtures/tests reflect real keys.
# moto's mock_aws() guarantees none of this ever leaves the machine.
os.environ.setdefault("AUDIO_BUCKET", "reefradar-2477-audio")
os.environ.setdefault("EMBEDDINGS_BUCKET", "reefradar-2477-embeddings")
os.environ.setdefault("METADATA_TABLE", "reefradar-2477-metadata")
os.environ.setdefault("PREPROCESSOR_FUNCTION", "reefradar-2477-preprocessor")
os.environ.setdefault("INFERENCE_FUNCTION", "reefradar-2477-inference")

LAMBDAS_DIR = os.path.dirname(os.path.abspath(__file__))
VALID_FUNCTIONS = {"router", "preprocessor", "classifier"}


def load_lambda(fn: str, module: str = "handler"):
    """
    Load lambdas/<fn>/<module>.py as a uniquely-named module object.

    Both lambdas/router/handler.py and lambdas/classifier/handler.py are
    named `handler.py` — loading them via a plain `import handler` would
    collide. This loads each under a unique module name
    (`lambda_<fn>_<module>`) via importlib, so two Lambda modules that
    share a filename coexist as distinct objects in sys.modules.

    lambdas/<fn> and lambdas/shared are temporarily placed first on
    sys.path for the duration of the import, so sibling imports inside
    the handler (e.g. `from region_detection import ...`) resolve.
    """
    if fn not in VALID_FUNCTIONS:
        raise ValueError(
            f"Unknown lambda function {fn!r}; expected one of {sorted(VALID_FUNCTIONS)}"
        )

    fn_dir = os.path.join(LAMBDAS_DIR, fn)
    shared_dir = os.path.join(LAMBDAS_DIR, "shared")
    module_path = os.path.join(fn_dir, f"{module}.py")

    unique_name = f"lambda_{fn}_{module}"

    added_paths = [p for p in (fn_dir, shared_dir) if p not in sys.path]
    sys.path[0:0] = added_paths
    try:
        spec = importlib.util.spec_from_file_location(unique_name, module_path)
        loaded_module = importlib.util.module_from_spec(spec)
        sys.modules[unique_name] = loaded_module
        spec.loader.exec_module(loaded_module)
        return loaded_module
    finally:
        for p in added_paths:
            if p in sys.path:
                sys.path.remove(p)


@pytest.fixture
def aws():
    """Yield inside a moto mock_aws() context (fake S3/DynamoDB/etc.)."""
    with mock_aws():
        yield
