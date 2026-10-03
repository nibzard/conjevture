# Night Shift design

Night Shift replaces the original gate puzzle campaign. The original game used known
Boolean inputs and illustrative probabilities. Its winning condition barely depended
on uncertainty. This redesign makes language interpretation and probability affect decisions.

## Two directions

| Direction | Player's task |
| --- | --- |
| Build | Define judgments and connect a policy circuit that handles several reports. |
| Investigate | Explain whether a failure came from question meaning, wiring, dependence, or missing evidence. |

The implemented campaign combines both directions. Each shift needs a passing operational
score and a solved incident investigation. The decision trace exposes the exact questions,
expression, model, and source used for each outcome.

## Division of responsibilities

| Component | Responsibility |
| --- | --- |
| Jev | Interpret natural-language questions against a report and return typed probability answers. |
| Player | Define useful questions, connect the rule, choose assumptions, and set thresholds. |
| Conjevture | Evaluate the expression exactly within the supplied probability model. |
| Game server | Enforce budgets, select the action, and score independent scenario outcomes. |

The model does not evaluate whether its own decisions were correct.
The library does not infer a policy from prose or establish that independence is justified.

## Why the evidence must be messy

Consider: “The pump started after another reset. The vibration is getting worse.”
A question about whether the pump restarted can be answered correctly while producing
a bad dispatch decision. The player needs to distinguish a temporary restart from
a verified lasting repair. This is a defect in question meaning, even if every gate is correct.

Likewise, two judgments from the same report do not establish two independent events.
The dependence shift asks players to review an inherited independence assumption.
The comparison preserves the marginal probabilities and changes only their relationship.

The final shift deliberately contains incomplete evidence. A real recorded model response
is too reassuring about a second-hand claim. The player can request an inspection,
create a new evidence revision, and reevaluate without changing the policy.

## Progression

1. Learn AND and OR in two short, optional gate lessons.
2. Interpret unfamiliar reports through typed judgment questions.
3. Repair a weak definition of a verified fix.
4. Preserve one variable's identity when several wires reuse it.
5. Compare joint evidence with an explicit independence assumption.
6. Use mutually exclusive status categories.
7. Combine these skills with a policy memo and incomplete reports.

## Variations after this campaign

| Variation | Build task | Investigation task |
| --- | --- | --- |
| Dispatch desk | Route messages to typed queues. | Identify why a request reached the wrong team. |
| Evidence room | Compose claims from several documents. | Find repeated evidence or an unjustified assumption. |
| Repair shop | Fix a damaged circuit within an edit budget. | Find a counterexample before changing a gate. |
| Optimization | Preserve behavior with fewer gates or model questions. | Explain whether two systems are equivalent. |
| Policy workshop | Interpret a longer operational memo. | Locate ambiguous clauses and require explicit interpretation. |

Future campaigns can add unseen evaluation batches to measure generalization.
Live model responses may vary; exact percentage matching should not become a winning condition.
Recorded runs should always retain their exact questions, evidence, model, and request identifiers.
