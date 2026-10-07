"""Timing and memory measurements for enumeration near the world limit.

Run from the python/ directory:

    python benchmarks/enumeration.py

The numbers document observed behavior on one machine. They are not a
promised speed target.
"""

import tracemalloc
from time import perf_counter

from conjevture import and_, assume_independent, bernoulli, create_scope, evaluate, or_


def measure(label: str, expression, model) -> None:
    start = perf_counter()
    result = evaluate(expression, model)
    elapsed = perf_counter() - start
    assert result.worlds > 1
    print(f"{label}: {result.worlds} worlds, probability {result.probability:.6f}, {elapsed:.3f} s")


def independent_groups() -> None:
    """One independent group per variable: 16 Boolean variables, 65,536 worlds."""
    scope = create_scope(state_id="bench", revision="1")
    variables = [scope.boolean(f"v{index}") for index in range(16)]
    model = assume_independent(
        [bernoulli(variable, 0.5) for variable in variables],
        reason="Benchmark model.",
    )
    expression = variables[0]
    for variable in variables[1:]:
        expression = or_(expression, variable)
    measure("16 independent groups (or-chain)", expression, model)


def one_correlated_table() -> None:
    """One 8-variable joint table with 256 rows, queried with a shared circuit."""
    from itertools import product

    from conjevture import JointRow, joint

    scope = create_scope(state_id="bench", revision="1")
    variables = [scope.boolean(f"v{index}") for index in range(8)]
    rows = [
        JointRow(values=assignment, probability=1 / 256)
        for assignment in product((False, True), repeat=8)
    ]
    model = joint(variables, rows)
    expression = variables[0]
    for variable in variables[1:]:
        expression = or_(expression, variable)
    measure("one 256-row joint table (or-chain)", expression, model)


def shared_circuit() -> None:
    """A 300-gate shared chain evaluated across 65,536 worlds."""
    scope = create_scope(state_id="bench", revision="1")
    variables = [scope.boolean(f"v{index}") for index in range(16)]
    model = assume_independent(
        [bernoulli(variable, 0.5) for variable in variables],
        reason="Benchmark model.",
    )
    expression = and_(variables[0], variables[1])
    for _ in range(300):
        expression = and_(expression, expression)
    measure("300-gate shared chain", expression, model)


def memory_footprint() -> None:
    """Peak traced memory while enumerating 65,536 worlds."""
    scope = create_scope(state_id="bench", revision="1")
    variables = [scope.boolean(f"v{index}") for index in range(16)]
    model = assume_independent(
        [bernoulli(variable, 0.5) for variable in variables],
        reason="Benchmark model.",
    )
    expression = variables[0]
    for variable in variables[1:]:
        expression = or_(expression, variable)
    tracemalloc.start()
    result = evaluate(expression, model)
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    assert result.worlds == 65_536
    print(f"peak traced memory for one enumeration pass: {peak / 1024:.1f} KiB")


if __name__ == "__main__":
    independent_groups()
    one_correlated_table()
    shared_circuit()
    memory_footprint()
