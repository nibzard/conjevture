import { and, or, xor, not, createScope, assumeIndependent, bernoulli, evaluate } from "conjevture";
import type { Expression, Variable, ProbabilityModel, Evaluation } from "conjevture";
import { fromNoul, fromJointChoice } from "conjevture/jev";
import { GATES } from "./levels.js";
import type { Circuit, Level } from "./levels.js";

export interface Context {
  variables: Map<string, Variable<boolean>>;
  model: ProbabilityModel;
}
export interface CheckRow { values: boolean[]; expected: boolean; actual: boolean }
export interface CheckResult {
  passed: boolean;
  rows: CheckRow[];
  evaluation: Evaluation;
  targetProbability: number;
  expression: string;
}
export function createContext(level: Level): Context {
  const scope = createScope({ stateId: `workshop:${level.id}`, revision: "1" });
  const variables = new Map(level.inputs.map(input => [input.id, scope.boolean(input.id)]));
  const groups = level.inputs.map(input => fromNoul(variables.get(input.id)!, {
    type: "noul", noul: input.probability,
  }, { model: "illustrative-fixture", questionId: input.label }));
  if (level.joint) {
    const [neither, aOnly, bOnly, both] = level.joint;
    groups.splice(0, 2, fromJointChoice([variables.get("A")!, variables.get("B")!], {
      neither: [false, false], aOnly: [true, false], bOnly: [false, true], both: [true, true],
    }, { type: "choice", probabilities: { neither, aOnly, bOnly, both } }, {
      model: "illustrative-joint-fixture", questionId: `${level.id}:paired-signals`,
    }));
  }
  const model = groups.length === 1 ? groups[0]! : assumeIndependent(groups, {
    reason: level.joint
      ? "For this puzzle, the third signal is independent of the related first two signals."
      : "For this puzzle, the distinct input signals are assumed to be mutually independent.",
  });
  return { variables, model };
}

/** Compile connections, preserving each source variable's identity. Reject cycles and incomplete circuits. */
export function compile(circuit: Circuit, context: { variables: ReadonlyMap<string, Expression> }, requireAll = true): Expression {
  const ids = new Set(context.variables.keys());
  for (const gate of circuit.gates) {
    if (ids.has(gate.id) || gate.id === "out" || !Object.hasOwn(GATES, gate.kind)) {
      throw new Error("The circuit contains an invalid or duplicate gate.");
    }
    ids.add(gate.id);
  }
  const incoming = new Map<string, string>();
  for (const wire of circuit.wires) {
    const destination = circuit.gates.find(gate => gate.id === wire.to);
    const ports = wire.to === "out" ? 1 : destination ? GATES[destination.kind].ports : 0;
    const key = `${wire.to}:${wire.port}`;
    if (!ids.has(wire.from) || !Number.isInteger(wire.port) || wire.port < 0 || wire.port >= ports) {
      throw new Error("A wire has an invalid source or input socket.");
    }
    if (incoming.has(key)) throw new Error("Each input socket accepts one wire. Remove the extra connection.");
    incoming.set(key, wire.from);
  }
  const visiting = new Set<string>();
  const expressions = new Map<string, Expression>();
  function input(id: string, port: number): Expression {
    const from = incoming.get(`${id}:${port}`);
    if (!from) throw new Error(id === "out" ? "Connect a gate to the outcome socket." : `Connect input ${port + 1} of ${id.toUpperCase()}.`);
    return visit(from);
  }
  function visit(id: string): Expression {
    const variable = context.variables.get(id);
    if (variable) return variable;
    const cached = expressions.get(id);
    if (cached) return cached;
    if (visiting.has(id)) throw new Error("This circuit has a loop. Connect gates in one direction toward the outcome.");
    const gate = circuit.gates.find(item => item.id === id);
    if (!gate) throw new Error("A connected gate is missing.");
    visiting.add(id);
    const left = input(id, 0);
    const expression = gate.kind === "NOT" ? not(left) :
      { AND: and, OR: or, XOR: xor }[gate.kind](left, input(id, 1));
    visiting.delete(id);
    expressions.set(id, expression);
    return expression;
  }
  const result = input("out", 0);
  if (requireAll && expressions.size !== circuit.gates.length) {
    throw new Error("Connect every placed gate to the outcome, or remove the unused gates.");
  }
  return result;
}
export function formatExpression(expression: Expression): string {
  switch (expression.kind) {
    case "variable": return expression.name;
    case "not": return `NOT ${formatExpression(expression.operand)}`;
    case "and": case "or": case "xor":
      return `(${formatExpression(expression.left)} ${expression.kind.toUpperCase()} ${formatExpression(expression.right)})`;
    case "constant": return String(expression.value);
    case "equals": return `${expression.variable.name} = ${String(expression.value)}`;
  }
}
export function validateInventory(level: Level, circuit: Circuit): void {
  for (const kind of Object.keys(GATES) as (keyof typeof GATES)[]) {
    const count = circuit.gates.filter(gate => gate.kind === kind).length;
    if (count !== (level.inventory[kind] ?? 0)) {
      throw new Error(`Use exactly ${level.inventory[kind] ?? 0} ${kind} gate(s). Each supplied gate must contribute to the outcome.`);
    }
  }
}
export function checkCircuit(level: Level, circuit: Circuit): CheckResult {
  validateInventory(level, circuit);
  const context = createContext(level);
  const expression = compile(circuit, context);
  const target = compile(level.blueprint, context);
  const variables = [...context.variables.values()];
  const rows: CheckRow[] = [];
  // Check even zero-probability worlds. A matching percentage alone cannot win.
  for (let mask = 0; mask < 2 ** variables.length; mask++) {
    const values = variables.map((_, index) => Boolean(mask & (1 << index)));
    const groups = variables.map((variable, index) => bernoulli(variable, values[index] ? 1 : 0));
    const model = groups.length === 1 ? groups[0]! : assumeIndependent(groups, {
      reason: "Fixed truth-table inputs have deterministic values for this check.",
    });
    rows.push({ values, expected: evaluate(target, model).probability === 1, actual: evaluate(expression, model).probability === 1 });
  }
  return {
    passed: rows.every(row => row.actual === row.expected), rows,
    evaluation: evaluate(expression, context.model),
    targetProbability: evaluate(target, context.model).probability,
    expression: formatExpression(expression),
  };
}
export function previewCircuit(level: Level, circuit: Circuit): Evaluation {
  const context = createContext(level);
  return evaluate(compile(circuit, context, false), context.model);
}
export function targetProbability(level: Level): number {
  return previewCircuit(level, level.blueprint).probability;
}
