// Compiled by the test command. Invalid calls must remain compile errors.
import { and, assumeIndependent, bernoulli, createScope, eq, evaluate, joint } from "conjevture";
import { fromJointChoice, fromNoul } from "conjevture/jev";

export function checkPublicTypes(): void {
  const scope = createScope({ stateId: "ticket", revision: "1" });
  const flag = scope.boolean("flag");
  const route = scope.categorical("route", ["billing", "technical"]);

  eq(route, "billing");
  and(flag, eq(route, "technical"));
  joint([flag, route], [
    { values: [false, "billing"], probability: 0.25 },
    { values: [false, "technical"], probability: 0.25 },
    { values: [true, "billing"], probability: 0.25 },
    { values: [true, "technical"], probability: 0.25 },
  ]);

  // @ts-expect-error Equality cannot widen the declared labels.
  eq(route, "sales");
  // @ts-expect-error Gates need Boolean expressions.
  and(flag, route);
  // @ts-expect-error Probabilities are not expressions.
  and(0.8, flag);
  // @ts-expect-error A categorical variable is not a Boolean variable.
  bernoulli(route, 0.5);
  // @ts-expect-error A Noul answer binds a Boolean variable.
  fromNoul(route, { type: "noul", noul: 0.5 });
  // @ts-expect-error Evaluation requires an explicit model, not a list of marginals.
  evaluate(flag, [bernoulli(flag, 0.5)]);
  // @ts-expect-error Independence needs an explicit reason.
  assumeIndependent([bernoulli(flag, 0.5)]);
  // @ts-expect-error The row cannot widen the variable's domain.
  joint([route], [{ values: ["sales"], probability: 1 }]);
  // @ts-expect-error The row must have the correct number of values.
  joint([flag, route], [{ values: [true], probability: 1 }]);
  // @ts-expect-error Joint Choice mappings cannot widen the variable's domain.
  fromJointChoice([route], { sales: ["sales"] }, {});
}
