import type { IndependenceAssumption, JointDistribution, ProbabilityModel, Provenance } from "./distribution.js";
import { ConjevtureError } from "./errors.js";
import type { Expression } from "./expression.js";
import type { Value, Variable } from "./scope.js";
import { Sum } from "./sum.js";

export interface EvaluationOptions {
  /** Maximum number of assignments, including assignments with zero probability. */
  readonly maxWorlds?: number;
}

export interface Evaluation {
  readonly probability: number;
  readonly method: "enumeration";
  readonly worlds: number;
  readonly assumptions: readonly IndependenceAssumption[];
  readonly sources: readonly {
    readonly variables: readonly Variable[];
    readonly provenance?: Provenance;
  }[];
}

/** Evaluate Boolean logic in each world of the supplied probability model. */
export function evaluate(
  expression: Expression,
  model?: ProbabilityModel,
  options: EvaluationOptions = {},
): Evaluation {
  const groups: readonly JointDistribution[] = model === undefined
    ? []
    : model.kind === "joint" ? [model] : model.groups;
  const needed = collectVariables(expression);
  const available = new Set(groups.flatMap((group) => group.variables));
  const scope = groups[0]?.variables[0]?.scope ?? needed.values().next().value?.scope;

  for (const variable of needed) {
    if (variable.scope !== scope) {
      throw new ConjevtureError("SCOPE_MISMATCH", `Variable "${variable.name}" belongs to a different scope.`);
    }
    if (!available.has(variable)) {
      throw new ConjevtureError(
        "MISSING_VARIABLE",
        `No distribution supplies "${variable.name}". ` +
        "Supply a joint distribution or explicitly declare independence between groups.",
      );
    }
  }

  const maxWorlds = options.maxWorlds ?? 65_536;
  if (!Number.isSafeInteger(maxWorlds) || maxWorlds < 1) {
    throw new ConjevtureError("WORLD_LIMIT_EXCEEDED", "maxWorlds must be a positive safe integer.");
  }
  let worlds = 1;
  for (const group of groups) {
    if (group.rows.length > maxWorlds / worlds) {
      throw new ConjevtureError(
        "WORLD_LIMIT_EXCEEDED",
        `The model exceeds maxWorlds (${maxWorlds}). Use a smaller model or increase the limit.`,
      );
    }
    worlds *= group.rows.length;
  }

  const world = new Map<Variable, Value>();
  const total = new Sum();

  function visit(index: number, weight: number): void {
    const group = groups[index];
    if (group === undefined) {
      if (truth(expression, world)) total.add(weight);
      return;
    }
    for (const row of group.rows) {
      if (row.probability === 0) continue;
      group.variables.forEach((variable, offset) => world.set(variable, row.values[offset]!));
      visit(index + 1, weight * row.probability);
    }
  }
  visit(0, 1);

  return Object.freeze({
    probability: Math.max(0, Math.min(1, total.value)),
    method: "enumeration" as const,
    worlds,
    assumptions: model?.kind === "independent" ? model.assumptions : Object.freeze([]),
    sources: Object.freeze(groups.map(({ variables, provenance }) => Object.freeze({
      variables,
      ...(provenance === undefined ? {} : { provenance }),
    }))),
  });
}

function collectVariables(expression: Expression): Set<Variable> {
  const result = new Set<Variable>();
  const seen = new Set<Expression>();
  const pending = [expression];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (seen.has(node)) continue;
    seen.add(node);
    switch (node.kind) {
      case "variable": result.add(node); break;
      case "equals": result.add(node.variable); break;
      case "not": pending.push(node.operand); break;
      case "and":
      case "or":
      case "xor": pending.push(node.left, node.right); break;
      case "constant": break;
    }
  }
  return result;
}

function truth(
  expression: Expression,
  world: ReadonlyMap<Variable, Value>,
  cache = new Map<Expression, boolean>(),
): boolean {
  const cached = cache.get(expression);
  if (cached !== undefined) return cached;
  let result: boolean;
  switch (expression.kind) {
    case "variable": result = world.get(expression) === true; break;
    case "constant": result = expression.value; break;
    case "equals": result = world.get(expression.variable) === expression.value; break;
    case "not": result = !truth(expression.operand, world, cache); break;
    case "and":
      result = truth(expression.left, world, cache) && truth(expression.right, world, cache);
      break;
    case "or":
      result = truth(expression.left, world, cache) || truth(expression.right, world, cache);
      break;
    case "xor":
      result = truth(expression.left, world, cache) !== truth(expression.right, world, cache);
      break;
  }
  cache.set(expression, result);
  return result;
}
