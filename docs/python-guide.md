# Conjevture Python guide

[Back to the README](../README.md) · [TypeScript guide](guide.md)

The Python package implements the same probability semantics as the
TypeScript library version `0.1.0`. It preserves variable identity, explicit
dependence, exact enumeration, and prediction provenance. Both
implementations run the same conformance fixtures from
`python/tests/fixtures/conformance/`.

## Define a circuit

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

# Illustrative probabilities for two related propositions.
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
result.assumptions  # The independence declaration
result.sources      # Variables and optional provenance for each group
```

Use `and_`, `or_`, `xor`, and `not_` to build expressions. Python's `and`,
`or`, and `not` keywords test truth and cannot build circuits. Calling
`bool()` on a variable or an expression node raises `TypeError`, so an
accidental truth test fails with an explanation. Use `constant(True)` and
`constant(False)` for fixed values. Expressions containing only constants
need no probability model.

## Preserve identity and dependence

Create one scope per state snapshot with `create_scope`. Keep that scope
while building its circuit. Repeated declarations of a name with the same
domain return the same variable object. A different domain under that name
raises an error.

Each scope has a distinct identity, even when its `state_id` and `revision`
match another scope. Model construction and evaluation reject mixed scopes.
You manage state revisions and the meaning of variable names. Use a new name
when you change the meaning of a proposition.

Variables, expression nodes, and `ScopeInfo` records compare by identity.
Two variables are equal only when they are the same object. Records such as
`JointRow`, `Provenance`, and `Evaluation` compare by value.
The `scope.info` property is read-only. Create a new scope for a new state revision.

Use `joint` for related variables. Include every assignment exactly once,
including assignments with probability zero. Row values follow the order of
the supplied variables. Derive marginals by evaluating a variable against
that model.

`assume_independent` declares mutual independence between disjoint groups,
conditioned on the same state. It requires a reason, which remains visible in
each result. It preserves dependence within each group. The library cannot
verify whether the independence assumption holds in the world.

Overlapping distributions cannot be combined. For example, `P(A,B)` and
`P(B,C)` do not determine a unique joint distribution over all three
variables. Supply a joint model that covers the circuit, or explicitly
declare independence between disjoint groups. A missing distribution raises
an error.

## Use categorical variables

A categorical variable takes exactly one value from its declared labels.

```python
from conjevture import create_scope, eq, evaluate, joint
from conjevture import JointRow

scope = create_scope(state_id="ticket:42", revision="3")
route = scope.categorical("route", ["billing", "technical"])
model = joint(
    (route,),
    (
        JointRow(values=("billing",), probability=0.6),
        JointRow(values=("technical",), probability=0.4),
    ),
)

evaluate(eq(route, "billing"), model).probability  # 0.6
```

Annotate the labels with `typing.Literal` to keep them in the type:

```python
from typing import Literal

labels: tuple[Literal["billing", "technical"], ...] = ("billing", "technical")
route = scope.categorical("route", labels)

eq(route, "sales")  # mypy error: "sales" is outside the declared labels
```

Without the annotation, `scope.categorical` returns `Variable[str]` and any
string passes the type check. Runtime validation stays authoritative in both
cases: `eq(route, "sales")` raises `INVALID_VARIABLE` when the calls execute.

## Convert Jev answers

Import converters from `conjevture.jev`. Pass individual answers obtained
through your existing Jev client. Conjevture makes no network requests.

```python
from conjevture import create_scope, evaluate
from conjevture.jev import JevProvenance, from_noul

scope = create_scope(state_id="message:1", revision="2")
refund = scope.boolean("refund")

# Replace this fixture with response.answers.refund from your Jev client.
model = from_noul(
    refund,
    {"type": "noul", "noul": 0.85},
    provenance=JevProvenance(
        model="fixture-model", question_id="refund:v1", request_id="request:1"
    ),
)

evaluate(refund, model).probability  # 0.85
```

`from_choice(variable, answer, *, provenance=None)` converts the full
probability distribution into a categorical model. It requires exactly the
declared labels. The selected answer and `confidence` do not change the
probabilities. This follows the documented
[Noul](https://docs.typesafe.ai/primitives/noul) and
[Choice](https://docs.typesafe.ai/primitives/choice) response shapes.

To represent related propositions, map one Choice answer to complete
assignments with `from_joint_choice(variables, mapping, answer, *,
provenance=None)`. The mapping must cover each complete assignment once.
Separate Jev answers create no independence assumption.

## Evaluation and validation

Evaluation visits possible assignments and adds the probability of each
satisfying assignment. It preserves repeated variables, overlapping branches,
and categorical exclusions. Shared expressions are evaluated at most once per
world. Exact enumeration describes the calculation within the supplied model.
It does not guarantee that learned judgments or assumptions are correct.

Tables require finite probabilities between zero and one. Their sum must be
within `1e-9` of one. Accepted tables are divided by their total to remove
rounding error. Larger errors are rejected. The library copies model inputs
and uses compensated summation. Results use ordinary Python floats.
Direct `JointDistribution` construction performs the same validation and normalization as `joint()`.
Direct `IndependentModel` construction requires one matching independence declaration with a nonempty reason.
These checks also apply when you use `dataclasses.replace()` to copy a model.

The default limit is 65,536 worlds. The limit counts all assignments in the
supplied model, including zero-probability assignments and variables outside
the expression. The evaluator checks the limit before enumeration and skips
zero-probability branches. Set a different integer limit when needed:

```python
result = evaluate(priority, model, max_worlds=100_000)
```

`max_worlds` accepts integers from `1` through `2**53 - 1`. Floats and
Boolean values raise `WORLD_LIMIT_EXCEEDED`. For independent groups, the
world count is the product of their row counts. Evaluation streams one
assignment at a time instead of storing the full product, and expression
traversal uses an explicit stack, so deeply nested circuits do not depend on
Python's recursion limit.

Catch `ConjevtureError` and inspect its `code` for expected failures:

| Code | Meaning |
| --- | --- |
| `INVALID_VARIABLE` | A scope, variable name, domain, or equality value is invalid. |
| `SCOPE_MISMATCH` | Variables belong to different scopes. |
| `INVALID_DISTRIBUTION` | A probability table is invalid or incomplete. |
| `OVERLAPPING_VARIABLES` | A variable appears more than once in a model. |
| `MISSING_VARIABLE` | The model lacks a variable used by the expression. |
| `MISSING_DEPENDENCE` | An independence declaration lacks groups or a reason. |
| `WORLD_LIMIT_EXCEEDED` | The world limit is invalid or too small. |
| `INVALID_JEV_ANSWER` | A Jev answer has the wrong structure or labels. |

Invalid numeric probabilities in Jev answers produce `INVALID_DISTRIBUTION`.

## Python-specific checks

Some checks that TypeScript performs through static types are enforced at
runtime in Python. Others use `TypeError` for wrong object types:

- `bool()` on a variable or expression node raises `TypeError`. This prevents
  accidental truth testing where a circuit was intended.
- Gate functions accept Boolean expressions only. Passing a probability, a
  string, or a list raises `TypeError`. A categorical variable used directly
  as an operand is a static type error; annotate or review your calls.
- Probabilities accept built-in `int` and `float` values, excluding `bool`.
  `True` as a probability raises `INVALID_DISTRIBUTION`.
- Boolean assignments require actual `True` or `False`. Because `1 == True`
  in Python, membership checks also compare types: `1` never matches `True`.
- `joint()` validates row length, domain membership, duplicate assignments,
  and duplicate variables at runtime. Row positions cannot be verified
  statically without arbitrary tuple inference, so runtime validation stays
  authoritative.
- `evaluate()` raises `TypeError` when the expression is not a Conjevture
  expression or the model is not a distribution, an independent model, or
  `None`.

## Measured performance

`python/benchmarks/enumeration.py` measures enumeration near the world
limit. Observed on one Linux machine with Python 3.12:

- 16 independent groups, 65,536 worlds, or-chain: about 0.6 seconds.
- One 256-row joint table, or-chain: about 0.001 seconds.
- A 300-gate shared chain across 65,536 worlds: about 8.5 seconds.
- Peak traced memory for one enumeration pass: about 5 KiB.

These numbers document one machine. They are not a promised speed target.

## Scope of version 0.1

This version supports finite variables, Boolean expressions, explicit joint
tables, and independent groups. It leaves probability bounds, conditional
learned gates, sampling, compiled inference, and Score conversion for later
versions.

Your application selects an action from the returned probability. Conjevture
does not apply thresholds or perform actions.
