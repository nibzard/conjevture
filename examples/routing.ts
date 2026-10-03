import { and, createScope, eq, evaluate, or } from "conjevture";
import { fromChoice } from "conjevture/jev";

const scope = createScope({ stateId: "ticket:42", revision: "3" });
const route = scope.categorical("route", ["billing", "technical", "other"]);

// Replace this fixture with a Choice answer from your Jev client.
const model = fromChoice(route, {
  type: "choice",
  choice: "billing",
  confidence: 0.4,
  probabilities: { billing: 0.6, technical: 0.3, other: 0.1 },
}, { model: "fixture-model", questionId: "route" });

const handled = or(eq(route, "billing"), eq(route, "technical"));
const impossible = and(eq(route, "billing"), eq(route, "technical"));

console.log(`Probability of a supported route: ${evaluate(handled, model).probability.toFixed(2)}`);
console.log(`Probability of both routes: ${evaluate(impossible, model).probability}`);
