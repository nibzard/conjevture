# Conjevture guide

[Back to the README](../README.md)

## Define a circuit

```ts
import {
  and, assumeIndependent, bernoulli, createScope,
  evaluate, joint, not, or,
} from "conjevture";

const scope = createScope({ stateId: "ticket:42", revision: "3" });
const urgent = scope.boolean("urgent");
const repeat = scope.boolean("repeat");
const resolved = scope.boolean("resolved");

// Illustrative probabilities for two related propositions.
const urgencyAndRepeat = joint([urgent, repeat], [
  { values: [false, false], probability: 0.10 },
  { values: [true, false],  probability: 0.30 },
  { values: [false, true],  probability: 0.10 },
  { values: [true, true],   probability: 0.50 },
]);

const model = assumeIndependent(
  [urgencyAndRepeat, bernoulli(resolved, 0.10)],
  { reason: "For this example, resolution is independent of urgency and repetition." },
);

const priority = and(or(urgent, repeat), not(resolved));
const result = evaluate(priority, model);

result.probability; // Approximately 0.81
result.assumptions; // The independence declaration
result.sources;    // Variables and optional prediction provenance for each group
```

Use `and`, `or`, `xor`, and `not` to build expressions. JavaScript operators such
as `&&` and `||` do not build circuits. Use `constant(true)` or `constant(false)`
for fixed values. Expressions containing only constants need no probability model.

## Preserve identity and dependence

Create one scope per state snapshot. Keep that scope while building its circuit.
Repeated declarations of a name with the same domain return the same variable.
A different domain under that name produces an error.

Each scope has a distinct identity, even when its state identifier and revision
match another scope. Model construction and evaluation reject mixed scopes.
You manage state revisions and the meaning of variable names. Use a new name when
you change a proposition's meaning.

Use a joint distribution for related variables. Include every assignment exactly
once, including assignments with probability zero. Row values follow the order of
the supplied variables. Derive marginals by evaluating a variable against that model.

`assumeIndependent` declares mutual independence between disjoint groups, conditioned
on the same state. It requires a reason, which remains visible in each result.
It preserves dependence within each group. The library cannot verify whether the
independence assumption holds in the world.

Overlapping distributions cannot be combined. For example, `P(A,B)` and `P(B,C)`
do not determine a unique joint distribution over all three variables.
Supply a joint model that covers the circuit, or explicitly declare independence
between disjoint groups. A missing distribution produces an error.

## Use categorical variables

A categorical variable takes exactly one value from its declared labels.

```ts
import { and, createScope, eq, evaluate, joint } from "conjevture";

const scope = createScope({ stateId: "ticket:42", revision: "3" });
const route = scope.categorical("route", ["billing", "technical"]);
const model = joint([route], [
  { values: ["billing"], probability: 0.6 },
  { values: ["technical"], probability: 0.4 },
]);

evaluate(eq(route, "billing"), model).probability; // 0.6
evaluate(and(eq(route, "billing"), eq(route, "technical")), model)
  .probability; // 0

// eq(route, "sales"); // TypeScript rejects an undeclared label.
```

## Convert Jev answers

Import converters from `conjevture/jev`. Pass individual answers obtained through
your existing Jev client. Conjevture makes no network requests.

```ts
import { createScope, evaluate } from "conjevture";
import { fromNoul } from "conjevture/jev";

const scope = createScope({ stateId: "message:1", revision: "2" });
const refund = scope.boolean("refund");

// Replace this fixture with response.answers.refund from your Jev client.
const model = fromNoul(refund, { type: "noul", noul: 0.85 }, {
  model: "fixture-model",
  questionId: "refund:v1",
  requestId: "request:1",
});

evaluate(refund, model).probability; // 0.85
```

`fromChoice(variable, answer, provenance?)` converts the full probability
distribution into a categorical model. It requires exactly the declared labels.
The selected answer and `confidence` do not change the probabilities.
This follows the documented [Noul](https://docs.typesafe.ai/primitives/noul)
and [Choice](https://docs.typesafe.ai/primitives/choice) response shapes.

To represent related propositions, map one Choice answer to complete assignments:

```ts
import { and, createScope, evaluate } from "conjevture";
import { fromJointChoice } from "conjevture/jev";

const scope = createScope({ stateId: "ticket:42", revision: "3" });
const urgent = scope.boolean("urgent");
const repeat = scope.boolean("repeat");

const model = fromJointChoice([urgent, repeat], {
  neither: [false, false],
  urgentOnly: [true, false],
  repeatOnly: [false, true],
  both: [true, true],
}, {
  type: "choice",
  probabilities: {
    neither: 0.10, urgentOnly: 0.30, repeatOnly: 0.10, both: 0.50,
  },
});

evaluate(and(urgent, repeat), model).probability; // 0.5
```

This is a caller-defined mapping of Choice options, not a separate Jev service.
Each option must describe its complete assignment. The mapping must cover every
assignment exactly once. Separate Jev answers do not establish statistical independence.

## Evaluation and validation

Evaluation visits possible assignments and adds the probability of each satisfying
assignment. It preserves repeated variables, overlapping branches, and categorical
exclusions. Shared expressions are evaluated at most once per world.
Exact enumeration describes the calculation within the supplied model;
it does not guarantee that learned judgments or assumptions are correct.

Tables require finite probabilities between zero and one. Their sum must be within
`1e-9` of one. Accepted tables are divided by their total to remove rounding error.
Larger errors are rejected. The library copies and freezes model data and uses
compensated summation. Results use ordinary JavaScript floating-point numbers.

The default limit is 65,536 worlds. The limit counts all assignments in the supplied
model, including zero-probability assignments and variables outside the expression.
The evaluator checks the limit before enumeration and skips zero-probability branches.
Set a different positive integer limit when needed:

```ts
const result = evaluate(priority, model, { maxWorlds: 100_000 });
```

For independent groups, the world count is the product of their row counts.
Evaluation uses memory for one assignment instead of storing the full product.
The `worlds` result reports the model's assignment count.

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

## Scope of version 0.1

This version supports finite variables, Boolean expressions, explicit joint tables,
and independent groups. It leaves probability bounds, conditional learned gates,
sampling, compiled inference, and Score conversion for later versions.

Your application selects an action from the returned probability. Conjevture does
not apply thresholds or perform actions.
