import { ConjevtureError } from "./errors.js";
import type { Value, Variable } from "./scope.js";
import { Sum } from "./sum.js";

const modelBrand: unique symbol = Symbol("Conjevture model");
const normalizationTolerance = 1e-9;

export interface Provenance {
  readonly source: string;
  readonly model?: string;
  readonly questionId?: string;
  readonly requestId?: string;
}

export type Assignment<V extends readonly Variable[]> = {
  readonly [K in keyof V]: V[K] extends Variable<infer T> ? T : never;
};

export interface JointRow<V extends readonly Variable[] = readonly Variable[]> {
  readonly values: Assignment<V>;
  readonly probability: number;
}

export interface JointDistribution {
  readonly [modelBrand]: true;
  readonly kind: "joint";
  readonly variables: readonly Variable[];
  readonly rows: readonly JointRow[];
  readonly provenance?: Provenance;
}

export interface IndependenceAssumption {
  readonly kind: "independence";
  readonly groups: readonly (readonly Variable[])[];
  readonly reason: string;
}

export interface IndependentModel {
  readonly [modelBrand]: true;
  readonly kind: "independent";
  readonly groups: readonly JointDistribution[];
  readonly assumptions: readonly IndependenceAssumption[];
}

export type ProbabilityModel = JointDistribution | IndependentModel;

/** Supply every assignment exactly once, including zero-probability assignments. */
export function joint<const V extends readonly Variable[]>(
  variables: V,
  rows: readonly JointRow<NoInfer<V>>[],
  provenance?: Provenance,
): JointDistribution {
  validateVariables(variables);
  const expected = variables.reduce((count, variable) => count * variable.domain.length, 1);
  if (!Number.isSafeInteger(expected) || rows.length !== expected) {
    throw new ConjevtureError(
      "INVALID_DISTRIBUTION",
      `Expected ${expected} rows, one for each possible assignment; received ${rows.length}.`,
    );
  }

  const seen = new Set<string>();
  const total = new Sum();
  for (const row of rows) {
    if (
      row.values.length !== variables.length ||
      variables.some((variable, index) => !variable.domain.includes(row.values[index]!))
    ) {
      throw new ConjevtureError(
        "INVALID_DISTRIBUTION",
        "Every row must assign one valid value to each variable.",
      );
    }
    const key = JSON.stringify(row.values);
    if (seen.has(key)) {
      throw new ConjevtureError("INVALID_DISTRIBUTION", "Joint distributions cannot contain duplicate assignments.");
    }
    seen.add(key);
    assertProbability(row.probability);
    total.add(row.probability);
  }
  if (Math.abs(total.value - 1) > normalizationTolerance) {
    throw new ConjevtureError("INVALID_DISTRIBUTION", `Probabilities must sum to 1; received ${total.value}.`);
  }

  return Object.freeze({
    [modelBrand]: true as const,
    kind: "joint" as const,
    variables: Object.freeze([...variables]),
    rows: Object.freeze(rows.map((row) => Object.freeze({
      values: Object.freeze([...row.values]) as readonly Value[],
      probability: row.probability / total.value,
    }))),
    ...(provenance === undefined ? {} : { provenance: Object.freeze({ ...provenance }) }),
  });
}

export function bernoulli(
  variable: Variable<boolean>,
  probability: number,
  provenance?: Provenance,
): JointDistribution {
  assertProbability(probability);
  return joint([variable], [
    { values: [false], probability: 1 - probability },
    { values: [true], probability },
  ], provenance);
}

/** Declare mutual independence between disjoint groups, conditioned on this state. */
export function assumeIndependent(
  groups: readonly JointDistribution[],
  options: { readonly reason: string },
): IndependentModel {
  if (
    groups.length < 2 ||
    typeof options.reason !== "string" ||
    options.reason.trim().length === 0
  ) {
    throw new ConjevtureError(
      "MISSING_DEPENDENCE",
      "An independence declaration needs at least two groups and a nonempty reason.",
    );
  }
  validateVariables(groups.flatMap((group) => group.variables));
  const assumption: IndependenceAssumption = Object.freeze({
    kind: "independence",
    groups: Object.freeze(groups.map((group) => group.variables)),
    reason: options.reason,
  });
  return Object.freeze({
    [modelBrand]: true as const,
    kind: "independent" as const,
    groups: Object.freeze([...groups]),
    assumptions: Object.freeze([assumption]),
  });
}

function assertProbability(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ConjevtureError("INVALID_DISTRIBUTION", "Probabilities must be finite numbers between 0 and 1.");
  }
}

function validateVariables(variables: readonly Variable[]): void {
  if (variables.length === 0) {
    throw new ConjevtureError("INVALID_DISTRIBUTION", "A distribution needs at least one variable.");
  }
  if (new Set(variables).size !== variables.length) {
    throw new ConjevtureError(
      "OVERLAPPING_VARIABLES",
      "Each variable must belong to exactly one distribution in a model.",
    );
  }
  if (variables.some((variable) => variable.scope !== variables[0]!.scope)) {
    throw new ConjevtureError("SCOPE_MISMATCH", "All variables in a model must belong to the same scope.");
  }
}
