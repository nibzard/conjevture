# Conjevture for Python

**Exact logic for uncertain answers.**

Conjevture combines uncertain judgments with Boolean rules. Supply
probabilities from Jev or your own data. Conjevture computes the probability
that your rule is satisfied, using the relationships you declare. This package
is the native Python version of the [TypeScript library](../README.md). Both
implementations pass the same shared conformance fixtures.

## Installation

The package has zero runtime dependencies and supports Python 3.11 or later:

```sh
pip install conjevture
```

The import name is `conjevture`. The package ships type annotations and a
`py.typed` marker, so mypy and other checkers see the full API.

## Quick start

```python
from conjevture import (
    JointRow,
    and_,
    assume_independent,
    bernoulli,
    create_scope,
    evaluate,
    joint,
    not_,
    or_,
)

scope = create_scope(state_id="ticket:42", revision="3")
urgent = scope.boolean("urgent")
repeat = scope.boolean("repeat")
resolved = scope.boolean("resolved")

urgency_and_repeat = joint(
    (urgent, repeat),
    (
        JointRow(values=(False, False), probability=0.10),
        JointRow(values=(True, False), probability=0.30),
        JointRow(values=(False, True), probability=0.10),
        JointRow(values=(True, True), probability=0.50),
    ),
)
model = assume_independent(
    (urgency_and_repeat, bernoulli(resolved, 0.10)),
    reason="For this example, resolution is independent of urgency and repetition.",
)
priority = and_(or_(urgent, repeat), not_(resolved))
result = evaluate(priority, model)

result.probability  # 0.81
result.worlds  # 8
```

Run the checked examples with no credentials:

```sh
python examples/support_ticket.py
python examples/routing.py
```

## API mapping from TypeScript

| TypeScript | Python | Notes |
| --- | --- | --- |
| `createScope({ stateId, revision })` | `create_scope(*, state_id, revision)` | One scope per state snapshot. |
| `scope.boolean(name)` | `scope.boolean(name)` | Returns `Variable[bool]`. |
| `scope.categorical(name, labels)` | `scope.categorical(name, labels)` | Returns a variable with a string domain. |
| `and`, `or`, `not`, `xor` | `and_`, `or_`, `not_`, `xor` | `xor` needs no underscore. |
| `eq`, `constant` | `eq`, `constant` | `eq(variable, value)` builds an expression. |
| `joint(variables, rows, provenance?)` | `joint(variables, rows, *, provenance=None)` | Requires a complete joint table. |
| `bernoulli(variable, probability, provenance?)` | `bernoulli(variable, probability, *, provenance=None)` | Builds the two Boolean rows. |
| `assumeIndependent(groups, { reason })` | `assume_independent(groups, *, reason)` | Reason is required. |
| `evaluate(expression, model?, options?)` | `evaluate(expression, model=None, *, max_worlds=65_536)` | Returns an immutable `Evaluation`. |
| `conjevture/jev` | `conjevture.jev` | `from_noul`, `from_choice`, `from_joint_choice`. |

Records use `state_id`, `question_id`, and `request_id` field names.

## Differences from the TypeScript version

- Python's `and`, `or`, and `not` keywords cannot build circuits. Use the
  gate functions. Calling `bool()` on a variable or expression raises
  `TypeError`, so an accidental truth test fails loudly.
- Variables, expression nodes, and scope records use identity equality. Two
  scopes with the same metadata stay distinct.
- Probabilities accept built-in `int` and `float` values, not `bool`. A
  Boolean assignment must be `True` or `False`: `1` does not match `True`.
- `max_worlds` accepts integers from `1` through `2**53 - 1`. Floats and
  Boolean values are rejected with `WORLD_LIMIT_EXCEEDED`.
- Wrong object types raise `TypeError`. Invalid model data raises
  `ConjevtureError` with the same eight codes as TypeScript:
  `INVALID_VARIABLE`, `SCOPE_MISMATCH`, `INVALID_DISTRIBUTION`,
  `OVERLAPPING_VARIABLES`, `MISSING_VARIABLE`, `MISSING_DEPENDENCE`,
  `WORLD_LIMIT_EXCEEDED`, and `INVALID_JEV_ANSWER`.

See the [Python guide](../docs/python-guide.md) for dependence, limits,
errors, and runtime-validated checks.

## Limits

Version 0.1 enumerates possible worlds with a default limit of 65,536
assignments. Set `max_worlds` to change the limit. Probabilities use
floating-point arithmetic. Exact enumeration describes inference within the
supplied model. Probability bounds, conditional learned gates, sampling, and
Score conversion remain outside this version.

## Development

Work from the `python/` directory:

```sh
python -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/pytest
.venv/bin/mypy
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/python benchmarks/enumeration.py
```

The behavioral tests include the shared conformance fixtures in
`python/tests/fixtures/conformance/`. The TypeScript runner
(`test/conformance.test.ts` in the repository root) runs the same fixtures,
so both implementations stay compatible.

## License

[MIT](LICENSE) © 2026 Nikola Balic.
