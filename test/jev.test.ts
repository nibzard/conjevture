import assert from "node:assert/strict";
import { test } from "node:test";
import { and, ConjevtureError, createScope, eq, evaluate, or, xor } from "conjevture";
import { fromChoice, fromJointChoice, fromNoul } from "conjevture/jev";

test("converts a Noul answer and preserves prediction provenance", () => {
  const scope = createScope({ stateId: "message:1", revision: "2" });
  const refund = scope.boolean("refund");
  const model = fromNoul(refund, { type: "noul", noul: 0.85 }, {
    model: "fixture-model", questionId: "refund", requestId: "request:1",
  });
  const result = evaluate(refund, model);
  assert.equal(result.probability, 0.85);
  assert.deepEqual(result.sources[0]?.provenance, {
    source: "jev", model: "fixture-model", questionId: "refund", requestId: "request:1",
  });
  assert.equal(result.sources[0]?.variables[0]?.scope.revision, "2");
  assert.deepEqual(result.assumptions, []);
});

test("uses all Choice probabilities without multiplying confidence", () => {
  const scope = createScope({ stateId: "message:1", revision: "1" });
  const route = scope.categorical("route", ["billing", "technical", "other"]);
  const model = fromChoice(route, {
    type: "choice", choice: "billing", confidence: 0.05,
    probabilities: { billing: 0.6, technical: 0.3, other: 0.1 },
  });
  assert.equal(evaluate(eq(route, "billing"), model).probability, 0.6);
  assert.ok(Math.abs(evaluate(or(eq(route, "billing"), eq(route, "technical")), model).probability - 0.9) < 1e-12);
  assert.equal(evaluate(and(eq(route, "billing"), eq(route, "technical")), model).probability, 0);
});

test("maps a joint Choice to one coherent joint distribution", () => {
  const scope = createScope({ stateId: "ticket:42", revision: "3" });
  const urgent = scope.boolean("urgent");
  const repeat = scope.boolean("repeat");
  const model = fromJointChoice([urgent, repeat], {
    neither: [false, false], urgentOnly: [true, false],
    repeatOnly: [false, true], both: [true, true],
  }, {
    type: "choice", choice: "both", confidence: 0.1,
    probabilities: { both: 0.5, neither: 0.1, repeatOnly: 0.1, urgentOnly: 0.3 },
  });
  assert.equal(evaluate(and(urgent, repeat), model).probability, 0.5);
  assert.equal(evaluate(or(urgent, repeat), model).probability, 0.9);
  assert.equal(evaluate(xor(urgent, repeat), model).probability, 0.4);
});

test("rejects malformed Noul and Choice responses", () => {
  const scope = createScope({ stateId: "message:1", revision: "1" });
  const flag = scope.boolean("flag");
  const route = scope.categorical("route", ["a", "b"]);
  for (const answer of [null, {}, [], { type: "noul", noul: "0.5" }, { type: "choice", noul: 0.5 }]) {
    assert.throws(() => fromNoul(flag, answer), ConjevtureError);
  }
  for (const noul of [NaN, Infinity, -1, 2]) {
    assert.throws(() => fromNoul(flag, { type: "noul", noul }), ConjevtureError);
  }
  for (const answer of [
    null, {}, [],
    { type: "choice", probabilities: null },
    { type: "choice", probabilities: [0.5, 0.5] },
    { type: "choice", probabilities: { a: 1 } },
    { type: "choice", probabilities: { a: 0.5, c: 0.5 } },
    { type: "choice", probabilities: { a: 0.5, b: 0.4, c: 0.1 } },
    { type: "choice", probabilities: { a: "0.5", b: 0.5 } },
    { type: "choice", probabilities: { a: NaN, b: 0.5 } },
    { type: "choice", probabilities: { a: 0.5, b: 0.6 } },
  ]) assert.throws(() => fromChoice(route, answer), ConjevtureError);
});

test("requires a complete joint mapping without duplicate worlds", () => {
  const flag = createScope({ stateId: "message:1", revision: "1" }).boolean("flag");
  assert.throws(() => fromJointChoice([flag], { yes: [true] }, {
    type: "choice", probabilities: { yes: 1 },
  }), ConjevtureError);
  assert.throws(() => fromJointChoice([flag], { first: [true], second: [true] }, {
    type: "choice", probabilities: { first: 0.5, second: 0.5 },
  }), ConjevtureError);
});

test("supports labels that also name Object prototype properties", () => {
  const scope = createScope({ stateId: "labels", revision: "1" });
  const route = scope.categorical("route", ["__proto__", "constructor"]);
  const model = fromChoice(route, JSON.parse('{"type":"choice","probabilities":{"__proto__":0.4,"constructor":0.6}}'));
  assert.equal(evaluate(eq(route, "__proto__"), model).probability, 0.4);
});
