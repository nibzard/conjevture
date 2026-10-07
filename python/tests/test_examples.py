"""The examples must return and print their documented decisions."""

import importlib.util
import subprocess
import sys
from pathlib import Path
from typing import Any

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"


def load_example(name: str) -> Any:
    path = EXAMPLES / name
    spec = importlib.util.spec_from_file_location(path.stem, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_example(name: str) -> str:
    process = subprocess.run(
        [sys.executable, str(EXAMPLES / name)],
        capture_output=True,
        text=True,
        check=True,
    )
    return process.stdout


def test_support_ticket_returns_081() -> None:
    module = load_example("support_ticket.py")
    assert abs(module.main() - 0.81) < 1e-12


def test_routing_returns_090_and_0() -> None:
    module = load_example("routing.py")
    handled, impossible = module.main()
    assert abs(handled - 0.90) < 1e-12
    assert impossible == 0


def test_support_ticket_output() -> None:
    output = run_example("support_ticket.py")
    assert "Probability of priority: 0.81" in output
    assert "Assumption: For this example, resolution is independent" in output


def test_routing_output() -> None:
    output = run_example("routing.py")
    assert "Probability of a supported route: 0.90" in output
    assert "Probability of both routes: 0" in output
