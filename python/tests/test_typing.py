"""Run mypy over the positive and negative typing cases."""

import re
import subprocess
import sys
from pathlib import Path

import pytest

PYTHON_DIR = Path(__file__).resolve().parents[1]
TYPING_DIR = Path(__file__).resolve().parent / "typing"
ERROR_LINE = re.compile(r"negative\.py:(\d+): error:")

pytest.importorskip("mypy", reason="mypy is a development dependency")


def run_mypy(*targets: str) -> str:
    process = subprocess.run(
        [sys.executable, "-m", "mypy", *targets, "--no-error-summary", "--hide-error-context"],
        cwd=PYTHON_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    if process.returncode not in (0, 1):
        raise RuntimeError(f"mypy failed to run:\n{process.stdout}{process.stderr}")
    return process.stdout


def marked_lines() -> set[int]:
    source = (TYPING_DIR / "negative.py").read_text()
    return {
        number
        for number, line in enumerate(source.splitlines(), start=1)
        if "# expect-error" in line
    }


def test_positive_cases_type_check() -> None:
    output = run_mypy("tests/typing/positive.py")
    assert output.strip() == "", f"Unexpected mypy errors:\n{output}"


def test_negative_cases_report_exactly_the_marked_errors() -> None:
    output = run_mypy("tests/typing/negative.py")
    errors = {
        int(match.group(1))
        for match in (ERROR_LINE.search(line) for line in output.splitlines())
        if match
    }
    marked = marked_lines()
    assert marked, "No marked lines found in negative.py"
    missing = marked - errors
    unexpected = errors - marked
    assert not missing, f"Lines should report errors: {sorted(missing)}\nOutput:\n{output}"
    assert not unexpected, f"Unexpected errors: {sorted(unexpected)}\nOutput:\n{output}"
