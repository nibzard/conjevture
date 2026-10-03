import assert from "node:assert/strict";
import { test } from "node:test";
import { LEVELS } from "../examples/signal-workshop/levels.js";
import type { Circuit, Level } from "../examples/signal-workshop/levels.js";
import { checkCircuit, compile, createContext, previewCircuit } from "../examples/signal-workshop/engine.js";

const expectedProbabilities = [0.48, 0.88, 0.75, 0.52, 0.68, 0.65, 0.5, 0.81];
for (const [index, level] of LEVELS.entries()) {
  test(`game: ${level.id} has a complete, winning solution`, () => {
    const result = checkCircuit(level, level.blueprint);
    assert.equal(result.passed, true);
    assert.equal(result.rows.length, 2 ** level.inputs.length);
    assert.ok(Math.abs(result.evaluation.probability - expectedProbabilities[index]!) < 1e-12);
    assert.ok(result.evaluation.sources.every(source => source.provenance?.source === "jev"));
    assert.ok(result.evaluation.sources.every(source => source.provenance?.model?.includes("fixture")));
  });
}
test("game: equal probabilities cannot pass a wrong rule", () => {
  const level: Level = {
    ...LEVELS[2]!,
    inputs: [{ id: "A", label: "A", probability: .5 }, { id: "B", label: "B", probability: .5 }],
  };
  const wrong = structuredClone(level.blueprint);
  wrong.wires[0]!.from = "B";
  const result = checkCircuit(level, wrong);
  assert.equal(result.evaluation.probability, result.targetProbability);
  assert.equal(result.passed, false);
  assert.equal(result.rows.filter(row => row.actual !== row.expected).length, 2);
});
test("game: truth checks include impossible worlds", () => {
  const level: Level = { ...LEVELS[0]!, joint: [0, 0, 0, 1] };
  const wrong = structuredClone(level.blueprint);
  wrong.wires[1]!.from = "A";
  const result = checkCircuit(level, wrong);
  assert.equal(result.evaluation.probability, 1);
  assert.equal(result.targetProbability, 1);
  assert.equal(result.passed, false);
});
test("game: every supplied gate must contribute to the outcome", () => {
  const level = LEVELS[0]!;
  const bypass: Circuit = { gates: [], wires: [{ from: "A", to: "out", port: 0 }] };
  assert.throws(() => checkCircuit(level, bypass), /exactly 1 AND/);
  bypass.gates = structuredClone(level.blueprint.gates);
  assert.throws(() => checkCircuit(level, bypass), /every placed gate/);
});
test("game: incomplete circuits produce actionable errors", () => {
  const level = LEVELS[0]!;
  const circuit = structuredClone(level.blueprint);
  circuit.wires = [];
  assert.throws(() => checkCircuit(level, circuit), /outcome socket/);
  circuit.wires = [{ from: "g1", to: "out", port: 0 }];
  assert.throws(() => checkCircuit(level, circuit), /input 1 of G1/);
});
test("game: loops, duplicate inputs, unknown endpoints, and duplicate IDs are rejected", () => {
  const level = LEVELS[4]!;
  const context = createContext(level);
  const loop = structuredClone(level.blueprint);
  loop.wires.find(wire => wire.to === "g1" && wire.port === 0)!.from = "g3";
  assert.throws(() => compile(loop, context), /loop/);
  const duplicate = structuredClone(level.blueprint);
  duplicate.wires.push({ from: "C", to: "g1", port: 0 });
  assert.throws(() => compile(duplicate, context), /one wire/);
  const unknown = structuredClone(level.blueprint);
  unknown.wires[0]!.from = "missing";
  assert.throws(() => compile(unknown, context), /invalid source/);
  const duplicateId = structuredClone(level.blueprint);
  duplicateId.gates[0]!.id = "A";
  assert.throws(() => compile(duplicateId, context), /invalid or duplicate gate/);
});
test("game: wrong inventories and invalid socket indices cannot win", () => {
  const level = LEVELS[0]!;
  const circuit = structuredClone(level.blueprint);
  circuit.gates[0]!.kind = "OR";
  assert.throws(() => checkCircuit(level, circuit), /exactly 1 AND/);
  circuit.gates[0]!.kind = "AND";
  circuit.wires[0]!.port = 2;
  assert.throws(() => checkCircuit(level, circuit), /invalid source or input/);
});
test("game: live preview allows spare gates while final validation rejects them", () => {
  const level = LEVELS[0]!;
  const circuit = structuredClone(level.blueprint);
  circuit.gates.push({ id: "g2", kind: "NOT", x: 300, y: 285 });
  assert.ok(Math.abs(previewCircuit(level, circuit).probability - .48) < 1e-12);
  assert.throws(() => checkCircuit(level, circuit), /exactly 0 NOT/);
});
test("game: joint fixtures replace separate marginals and retain independence boundaries", () => {
  const storm = checkCircuit(LEVELS[6]!, LEVELS[6]!.blueprint).evaluation;
  assert.equal(storm.probability, .5);
  assert.equal(storm.assumptions.length, 0);
  assert.equal(storm.sources.length, 1);
  const dispatch = checkCircuit(LEVELS[7]!, LEVELS[7]!.blueprint).evaluation;
  assert.equal(dispatch.assumptions.length, 1);
  assert.equal(dispatch.sources.length, 2);
  assert.equal(dispatch.sources[0]!.variables.length, 2);
});
