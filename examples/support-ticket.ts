import { and, assumeIndependent, bernoulli, createScope, evaluate, joint, not, or } from "conjevture";

const scope = createScope({ stateId: "ticket:42", revision: "3" });
const urgent = scope.boolean("urgent");
const repeat = scope.boolean("repeat");
const resolved = scope.boolean("resolved");

// Illustrative values, not measured Jev predictions.
const urgencyAndRepeat = joint([urgent, repeat], [
  { values: [false, false], probability: 0.10 },
  { values: [true, false], probability: 0.30 },
  { values: [false, true], probability: 0.10 },
  { values: [true, true], probability: 0.50 },
]);

const model = assumeIndependent(
  [urgencyAndRepeat, bernoulli(resolved, 0.10)],
  { reason: "For this example, resolution is independent of urgency and repetition." },
);

const priority = and(or(urgent, repeat), not(resolved));
const result = evaluate(priority, model);

console.log(`Probability of priority: ${result.probability.toFixed(2)}`);
console.log(`Assumption: ${result.assumptions[0]?.reason}`);
