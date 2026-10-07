# Python library implementation plan

Build a native Python version of Conjevture with the same probability semantics as TypeScript version `0.1.0`.
Use commit `c54c02a` as the compatibility baseline.
Preserve variable identity, explicit dependence, exact enumeration, and prediction provenance.
Use Python names and call conventions for the public application programming interface (API).

The initial scope includes the core library, Jev converters, documentation, and the two command-line examples.
The browser game, network clients, action policies, sampling, probability bounds, and Score conversion remain outside this release.
Exact enumeration describes inference within the supplied model. Probabilities still use floating-point arithmetic.

The implementation defaults are Python `3.11+`, zero runtime dependencies, and the import name `conjevture`.
Place the package under `python/` in this repository so both implementations can use shared compatibility fixtures.
Retain the MIT license and existing attribution.
Check availability of the distribution name on the Python Package Index before publication.

The behavioral contract comes from the [guide](guide.md), [public exports](../src/index.ts),
[core tests](../test/core.test.ts), [Jev tests](../test/jev.test.ts), and [type checks](../test/types.ts).

Use this public API mapping:

| TypeScript | Python | Contract |
| --- | --- | --- |
| `createScope({ stateId, revision })` | `create_scope(*, state_id, revision)` | Create a distinct scope for one state snapshot. |
| `scope.boolean(name)` | `scope.boolean(name)` | Return `Variable[bool]`. |
| `scope.categorical(name, labels)` | `scope.categorical(name, labels)` | Return a variable with a finite string domain. |
| `and`, `or`, `not`, `xor` | `and_`, `or_`, `not_`, `xor` | Build Boolean expressions. Binary gates keep two operands. |
| `eq`, `constant` | `eq`, `constant` | Compare a domain value or construct a Boolean constant. |
| `joint(variables, rows, provenance?)` | `joint(variables, rows, *, provenance=None)` | Require a complete joint table. |
| `bernoulli(variable, probability, provenance?)` | `bernoulli(variable, probability, *, provenance=None)` | Construct the two Boolean rows. |
| `assumeIndependent(groups, { reason })` | `assume_independent(groups, *, reason)` | Require disjoint joint distributions and a nonempty reason. |
| `evaluate(expression, model?, options?)` | `evaluate(expression, model=None, *, max_worlds=65_536)` | Return an immutable `Evaluation`. |
| `conjevture/jev` | `conjevture.jev` | Export `from_noul`, `from_choice`, and `from_joint_choice`. |

Export typed records for `ScopeInfo`, `JointRow`, `Provenance`, `IndependenceAssumption`, and `Evaluation`.
Export `Scope`, `Variable`, `Expression`, the model types, and `ConjevtureError` for annotations and error handling.
Use `state_id`, `question_id`, and `request_id` in Python records.
Keep Jev answer keys unchanged at the conversion boundary.
Each converter accepts the answer as a mapping and optional provenance as a keyword argument.
`from_joint_choice` also accepts the ordered variables and the label-to-assignment mapping.

This is the target support-ticket example:

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

assert abs(result.probability - 0.81) < 1e-12
assert result.worlds == 8
```

Preserve these behaviors across both implementations:

- A repeated name and domain return the same variable object within a scope.
  A reordered categorical domain also returns that object and keeps its original domain order.
  Conflicting domains fail. Separate scopes remain distinct, even when their metadata match.
- Repeated variables represent the same proposition: `and_(a, a)` has probability `P(a)`.
  Correlated branches use their joint table. Different labels of one categorical variable are mutually exclusive.
- Joint tables contain every assignment exactly once, including assignments with zero probability.
  Validate row lengths, domain membership, duplicate assignments, and duplicate variables.
- Probabilities must be finite and within `[0, 1]`.
  Accept totals within `1e-9` of one and divide accepted rows by their total.
  Use the compensated summation algorithm from [sum.ts](../src/sum.ts) for normalization and evaluation.
- Independence applies between at least two disjoint joint distributions in the same scope.
  Preserve dependence within each group and return the supplied reason in `assumptions`.
  Missing distributions and overlapping groups produce errors.
- Check `max_worlds` before enumeration. Count zero-probability rows and variables outside the expression.
  Preserve the TypeScript limit range: integers from `1` through `2**53 - 1`.
  Skip zero-probability branches during evaluation without changing the reported count.
- Constants need no model and report one world when no model is supplied.
  Results expose `probability`, `method="enumeration"`, `worlds`, `assumptions`, and `sources`.
  Preserve each group's variables and optional provenance, including groups outside the expression.

Python needs several explicit design choices:

| Concern | Implementation decision |
| --- | --- |
| Identity and hashing | Use identity equality for scope tokens, variables, and expression nodes. Use `eq=False` on their dataclasses. |
| Immutability | Use frozen records and tuples. Copy caller-owned sequences and provenance before storage. |
| Boolean syntax | Provide the named gate functions. Make `__bool__` raise `TypeError` on variables and expression nodes. |
| Equality syntax | Keep `eq(variable, value)` as the expression builder. Object equality preserves identity for variables. |
| Numeric validation | Accept built-in `int` and `float` probabilities, excluding `bool`. Boolean assignments require actual Boolean values. |
| Type checks | Use `Variable[T]` for Boolean and string domains. Gates accept Boolean expressions only. |
| Deep expressions | Traverse expressions iteratively and cache results by node identity for each world. |
| Invalid calls | Use `TypeError` for nonexpressions or unsupported model objects. Preserve domain error codes for invalid model data. |

Python Boolean operators perform truth testing and cannot serve as circuit constructors.
Also, `bool` is a subclass of `int`, so numeric validation needs an explicit Boolean exclusion.
These rules follow Python's [built-in type behavior](https://docs.python.org/3.11/library/stdtypes.html).
Identity hashing and frozen fields follow the [dataclass rules](https://docs.python.org/3.11/library/dataclasses.html).

Ship a `py.typed` marker and inline type annotations, as described in the
[Python typing guide](https://typing.python.org/en/latest/guides/libraries.html).
Support explicitly annotated `Literal` domains where the type checker can preserve them.
Keep runtime validation authoritative for categorical membership and heterogeneous row positions.
Do not make arbitrary tuple inference or a custom type-checker plugin a release requirement.

Preserve all eight `ConjevtureError.code` strings:
`INVALID_VARIABLE`, `SCOPE_MISMATCH`, `INVALID_DISTRIBUTION`, `OVERLAPPING_VARIABLES`,
`MISSING_VARIABLE`, `MISSING_DEPENDENCE`, `WORLD_LIMIT_EXCEEDED`, and `INVALID_JEV_ANSWER`.
Error codes form the compatibility contract; message wording can explain Python calls.
Malformed Jev shapes, nonnumeric fields, and mismatched labels produce `INVALID_JEV_ANSWER`.
Numeric probability violations produce `INVALID_DISTRIBUTION`.
Invalid world limits, including Boolean values, produce `WORLD_LIMIT_EXCEEDED`.

Jev conversion must retain every Choice probability and ignore the selected answer and confidence.
Require exact label coverage. Joint Choice mappings must cover each complete assignment once.
Set the provenance source to `"jev"` and preserve the other supplied provenance fields.
Separate Jev answers create no independence assumption.

Use the following package layout:

```text
python/
  pyproject.toml
  README.md
  LICENSE
  src/conjevture/
    __init__.py
    py.typed
    scope.py
    expression.py
    distribution.py
    evaluate.py
    errors.py
    jev.py
    _sum.py
  tests/
    test_scope.py
    test_expression.py
    test_distribution.py
    test_evaluate.py
    test_jev.py
    test_conformance.py
    typing/
    fixtures/conformance/
  examples/
    support_ticket.py
    routing.py
```

Use `pyproject.toml` with a standard build backend, initially setuptools.
Declare the Python requirement, version, license, package discovery, and development dependencies there.
The `src` layout helps tests exercise the installed package.
See the [packaging configuration guide](https://packaging.python.org/en/latest/guides/writing-pyproject-toml/)
and [source layout guidance](https://packaging.python.org/en/latest/discussions/src-layout-vs-flat-layout/).
Use pytest for behavioral tests, mypy for type checks, and Ruff for formatting and lint checks.
Keep these tools in development dependencies.

Implement the library in this order. Each step depends on the preceding step's acceptance criteria.

1. **Record the compatibility contract.**
   Extract shared fixtures from the TypeScript core and Jev tests.
   Store scope identifiers, variable references, expression nodes, model rows, and expected results in JSON.
   Give distinct scopes distinct fixture identifiers, even when their metadata match.
   Keep repeated variable and expression references intact when each runner loads a fixture.
   Add a TypeScript runner and confirm that every fixture passes against the baseline.
   Compare probabilities within `1e-12`; compare world counts, error codes, assumptions, and provenance exactly after field-name conversion.

2. **Create the package and expression model.**
   Add packaging, exports, typed records, errors, scopes, variables, and gate constructors.
   Verify redeclaration, scope identity, copied inputs, and categorical exclusions.
   Verify that accidental Python truth testing raises a useful error.
   Add positive and negative type-check cases based on `test/types.ts`.
   Document checks that Python enforces at runtime instead of through static types.

3. **Implement probability models.**
   Add `joint`, `bernoulli`, `assume_independent`, and compensated summation.
   Verify all assignments, normalization boundaries, overlap rejection, scope checks, and assumption records.
   Include Python-specific tests for `True` as a probability and `1` as a Boolean assignment.
   Mutate caller-owned rows and provenance after construction; stored models must retain their original values.

4. **Implement exact evaluation.**
   Collect required variables, validate model coverage and scopes, and check the world limit before enumeration.
   Stream assignments across groups without allocating their Cartesian product.
   Use an explicit traversal stack so deep expressions do not depend on Python's recursion limit.
   Cache each expression node once per world, including cached false results.
   Verify logical identities, correlated gates, independent gates, constants, and categorical rules against direct truth tables.
   Verify the default limit, its boundary, zero-probability rows, unused variables, and extensively shared expressions.
   Record timing and memory for representative models near the world limit without promising an unmeasured speed target.

5. **Implement Jev conversion and examples.**
   Add all three converters and preserve provenance.
   Cover malformed payloads, missing or extra labels, invalid probabilities, and incomplete or duplicate joint mappings.
   Port the support-ticket and routing examples using fixed answers.
   The examples must return `0.81`, `0.90`, and `0` for their corresponding decisions.
   All core and Jev compatibility fixtures must pass in both languages.

6. **Validate the distribution and document usage.**
   Run behavioral tests, type checks, formatting, and lint checks in continuous integration.
   Test Python `3.11` and each later stable minor version supported at implementation time.
   Include installation checks on Linux, macOS, and Windows.
   Build the wheel and source distribution, then test clean installations outside the repository.
   Verify exports, `py.typed`, license files, and both examples from the installed package.
   Add a Python guide and a README link covering dependence, limits, errors, and syntax differences.

Version `0.1.0` is complete when these six steps pass and the built package has zero runtime dependencies.
The release must preserve the documented TypeScript behavior and explain the Python API differences above.
Future optimizations must pass the same compatibility fixtures before they replace enumeration internals.
