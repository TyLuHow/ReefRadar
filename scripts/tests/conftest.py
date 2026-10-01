"""
Shared pytest fixtures for scripts/ tests.

scripts/drift-check.py and scripts/deploy-lambdas.py use hyphenated
filenames (matching the CLI entry-point names documented in CLAUDE.md and
01-05-PLAN.md) and can't be `import`ed directly with a plain `import`
statement. load_script mirrors lambdas/conftest.py's load_lambda()
pattern: load a hyphenated script by file path as a uniquely-named
module object, so tests can call its functions directly instead of
shelling out to a subprocess for every assertion.
"""

import importlib.util
import pathlib
import sys

import pytest

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parent.parent


@pytest.fixture
def load_script():
    def _load(name: str):
        path = SCRIPTS_DIR / f"{name}.py"
        module_name = f"script_{name.replace('-', '_')}"
        spec = importlib.util.spec_from_file_location(module_name, path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        return module

    return _load
