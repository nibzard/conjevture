import { bernoulli, joint } from "./distribution.js";
import type { Assignment, JointDistribution, JointRow, Provenance } from "./distribution.js";
import { ConjevtureError } from "./errors.js";
import type { Variable } from "./scope.js";

export type JevProvenance = Omit<Provenance, "source">;

/** Convert a Noul answer without creating dependence assumptions. */
export function fromNoul(
  variable: Variable<boolean>,
  answer: unknown,
  provenance: JevProvenance = {},
): JointDistribution {
  if (!isRecord(answer) || answer["type"] !== "noul" || typeof answer["noul"] !== "number") {
    throw new ConjevtureError("INVALID_JEV_ANSWER", "Expected a Noul answer with a numeric noul field.");
  }
  return bernoulli(variable, answer["noul"], { ...provenance, source: "jev" });
}

/** Preserve all Choice probabilities; the selected answer and confidence are unused. */
export function fromChoice<T extends string>(
  variable: Variable<T>,
  answer: unknown,
  provenance: JevProvenance = {},
): JointDistribution {
  const probabilities = choiceProbabilities(answer, variable.domain);
  return joint([variable], variable.domain.map((value) => ({
    values: [value],
    probability: probabilities[value]!,
  })), { ...provenance, source: "jev" });
}

/** Map Choice labels to complete assignments, one label per possible world. */
export function fromJointChoice<const V extends readonly Variable[]>(
  variables: V,
  mapping: Readonly<Record<string, Assignment<NoInfer<V>>>>,
  answer: unknown,
  provenance: JevProvenance = {},
): JointDistribution {
  const probabilities = choiceProbabilities(answer, Object.keys(mapping));
  const rows: JointRow<V>[] = Object.entries(mapping).map(([label, values]) => ({
    values,
    probability: probabilities[label]!,
  }));
  return joint(variables, rows, { ...provenance, source: "jev" });
}

function choiceProbabilities(answer: unknown, labels: readonly string[]): Readonly<Record<string, number>> {
  if (!isRecord(answer) || answer["type"] !== "choice" || !isRecord(answer["probabilities"])) {
    throw new ConjevtureError("INVALID_JEV_ANSWER", "Expected a Choice answer with a probabilities object.");
  }
  const probabilities = answer["probabilities"];
  if (
    Object.keys(probabilities).length !== labels.length ||
    labels.some((label) => !Object.hasOwn(probabilities, label))
  ) {
    throw new ConjevtureError(
      "INVALID_JEV_ANSWER",
      "Choice probability keys must match the declared labels exactly.",
    );
  }
  if (Object.values(probabilities).some((value) => typeof value !== "number")) {
    throw new ConjevtureError("INVALID_JEV_ANSWER", "Choice probabilities must be numbers.");
  }
  return probabilities as Record<string, number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
