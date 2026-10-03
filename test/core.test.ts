import assert from "node:assert/strict";
import { test } from "node:test";
import {
  and, assumeIndependent, bernoulli, constant, ConjevtureError, createScope,
  eq, evaluate, joint, not, or, xor,
} from "conjevture";
import type { ErrorCode, Expression } from "conjevture";

function close(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-12, `Expected ${expected}, received ${actual}`);
}

function fails(code: ErrorCode, action: () => unknown): void {
  assert.throws(action, (error: unknown) => error instanceof ConjevtureError && error.code === code);
}

function fixture() {
  const scope = createScope({ stateId: "ticket:42", revision: "3" });
  const a = scope.boolean("urgent");
  const b = scope.boolean("repeat");
  const ab = joint([a, b], [
    { values: [false, false], probability: 0.10 },
    { values: [true, false], probability: 0.30 },
    { values: [false, true], probability: 0.10 },
    { values: [true, true], probability: 0.50 },
  ]);
  return { scope, a, b, ab };
}

test("preserves identities for repeated variables and overlapping branches", () => {
  const { a, b, ab } = fixture();
  const cases: readonly [Expression, number][] = [
    [a, 0.8],
    [and(a, a), 0.8],
    [or(a, a), 0.8],
    [xor(a, a), 0],
    [or(a, not(a)), 1],
    [and(a, not(a)), 0],
    [not(not(a)), 0.8],
    [or(and(a, b), and(a, not(b))), 0.8],
    [and(or(a, b), or(a, not(b))), 0.8],
    [xor(or(a, b), and(a, b)), 0.4],
  ];
  for (const [expression, expected] of cases) close(evaluate(expression, ab).probability, expected);
});

test("uses the supplied correlation for every gate", () => {
  const { a, b, ab } = fixture();
  close(evaluate(a, ab).probability, 0.8);
  close(evaluate(b, ab).probability, 0.6);
  close(evaluate(and(a, b), ab).probability, 0.5);
  close(evaluate(or(a, b), ab).probability, 0.9);
  close(evaluate(xor(a, b), ab).probability, 0.4);
  close(evaluate(not(a), ab).probability, 0.2);
  assert.deepEqual(evaluate(a, ab).assumptions, []);
});

test("declares mutual independence between groups and retains the reason", () => {
  const { scope, a, b, ab } = fixture();
  const c = scope.boolean("resolved");
  const model = assumeIndependent([ab, bernoulli(c, 0.1)], { reason: "Illustrative assumption." });
  const result = evaluate(and(or(a, b), not(c)), model);
  close(result.probability, 0.81);
  assert.equal(result.method, "enumeration");
  assert.equal(result.worlds, 8);
  assert.equal(result.assumptions[0]?.reason, "Illustrative assumption.");
  assert.deepEqual(result.assumptions[0]?.groups, [[a, b], [c]]);
  assert.deepEqual(result.sources.map((source) => source.variables), [[a, b], [c]]);
});

test("independent marginals produce the independent gate probabilities", () => {
  const { a, b } = fixture();
  const model = assumeIndependent([bernoulli(a, 0.8), bernoulli(b, 0.6)], { reason: "Test independence." });
  close(evaluate(and(a, b), model).probability, 0.48);
  close(evaluate(or(a, b), model).probability, 0.92);
  close(evaluate(xor(a, b), model).probability, 0.44);
});

test("different labels of the same categorical variable are mutually exclusive", () => {
  const scope = createScope({ stateId: "ticket:42", revision: "1" });
  const route = scope.categorical("route", ["billing", "technical", "other"]);
  const model = joint([route], [
    { values: ["billing"], probability: 0.5 },
    { values: ["technical"], probability: 0.3 },
    { values: ["other"], probability: 0.2 },
  ]);
  close(evaluate(and(eq(route, "billing"), eq(route, "technical")), model).probability, 0);
  close(evaluate(or(eq(route, "billing"), eq(route, "technical")), model).probability, 0.8);
  close(evaluate(not(eq(route, "other")), model).probability, 0.8);
});

test("matches direct truth-table evaluation on a correlated mixed domain", () => {
  const scope = createScope({ stateId: "case", revision: "1" });
  const a = scope.boolean("a");
  const b = scope.boolean("b");
  const route = scope.categorical("route", ["billing", "technical"]);
  const rows = [
    { values: [false, false, "billing"], probability: 0.03 },
    { values: [false, false, "technical"], probability: 0.07 },
    { values: [false, true, "billing"], probability: 0.11 },
    { values: [false, true, "technical"], probability: 0.09 },
    { values: [true, false, "billing"], probability: 0.13 },
    { values: [true, false, "technical"], probability: 0.17 },
    { values: [true, true, "billing"], probability: 0.19 },
    { values: [true, true, "technical"], probability: 0.21 },
  ] as const;
  const model = joint([a, b, route], rows);
  const expression = xor(and(or(a, b), eq(route, "billing")), not(a));
  const expected = rows.reduce((sum, { values: [av, bv, label], probability }) => {
    return sum + (((av || bv) && label === "billing") !== !av ? probability : 0);
  }, 0);
  close(evaluate(expression, model).probability, expected);
});

test("evaluates constants without a probability model", () => {
  assert.equal(evaluate(constant(true)).probability, 1);
  assert.equal(evaluate(not(constant(true))).probability, 0);
  assert.equal(evaluate(xor(constant(true), constant(false))).worlds, 1);
});

test("handles probabilities of zero and one", () => {
  const { a } = fixture();
  assert.equal(evaluate(a, bernoulli(a, 0)).probability, 0);
  assert.equal(evaluate(not(a), bernoulli(a, 1)).probability, 0);
  assert.equal(evaluate(a, bernoulli(a, 1)).probability, 1);
});

test("reuses a named variable within one scope and rejects conflicting declarations", () => {
  const { scope, a } = fixture();
  assert.equal(scope.boolean("urgent"), a);
  const route = scope.categorical("route", ["billing", "technical"]);
  assert.equal(scope.categorical("route", ["technical", "billing"]), route);
  fails("INVALID_VARIABLE", () => scope.categorical("urgent", ["yes", "no"]));
  fails("INVALID_VARIABLE", () => scope.categorical("route", ["billing", "other"]));
  fails("INVALID_VARIABLE", () => scope.boolean(" "));
  fails("INVALID_VARIABLE", () => scope.categorical("empty", []));
  fails("INVALID_VARIABLE", () => scope.categorical("duplicates", ["a", "a"]));
  fails("INVALID_VARIABLE", () => scope.categorical("blank", [" "]));
  fails("INVALID_VARIABLE", () => createScope({ stateId: "", revision: "1" }));
});

test("rejects variables from different snapshots, even when names match", () => {
  const { a, ab } = fixture();
  for (const revision of ["3", "4"]) {
    const other = createScope({ stateId: "ticket:42", revision }).boolean("urgent");
    fails("SCOPE_MISMATCH", () => evaluate(other, ab));
    fails("SCOPE_MISMATCH", () => evaluate(and(a, other), ab));
    fails("SCOPE_MISMATCH", () => assumeIndependent([ab, bernoulli(other, 0.5)], { reason: "Invalid." }));
    fails("SCOPE_MISMATCH", () => joint([a, other], []));
  }
});

test("rejects overlapping distributions and unexplained independence", () => {
  const { a, b, ab } = fixture();
  fails("OVERLAPPING_VARIABLES", () => assumeIndependent([ab, bernoulli(a, 0.8)], { reason: "Invalid." }));
  fails("OVERLAPPING_VARIABLES", () => joint([a, a], []));
  fails("MISSING_DEPENDENCE", () => assumeIndependent([ab], { reason: "Invalid." }));
  fails("MISSING_DEPENDENCE", () => assumeIndependent([bernoulli(a, 0.8), bernoulli(b, 0.6)], { reason: " " }));
  fails("MISSING_VARIABLE", () => evaluate(and(a, b), bernoulli(a, 0.8)));
  fails("MISSING_VARIABLE", () => evaluate(a));
});

test("rejects invalid weights and incomplete or duplicate assignments", () => {
  const { a, b } = fixture();
  for (const probability of [NaN, Infinity, -Infinity, -0.1, 1.1]) {
    fails("INVALID_DISTRIBUTION", () => bernoulli(a, probability));
  }
  fails("INVALID_DISTRIBUTION", () => joint([], []));
  fails("INVALID_DISTRIBUTION", () => joint([a], [{ values: [true], probability: 1 }]));
  fails("INVALID_DISTRIBUTION", () => joint([a], [
    { values: [true], probability: 0.5 }, { values: [true], probability: 0.5 },
  ]));
  fails("INVALID_DISTRIBUTION", () => joint([a], [
    { values: [false], probability: 0.3 }, { values: [true], probability: 0.8 },
  ]));
  // Check runtime validation at a JavaScript boundary as well as static types.
  fails("INVALID_DISTRIBUTION", () => joint([a], [
    // @ts-expect-error A Boolean variable cannot hold a string.
    { values: ["true"], probability: 0.5 }, { values: [false], probability: 0.5 },
  ]));
  fails("INVALID_DISTRIBUTION", () => joint([a, b], [
    // @ts-expect-error Each row must assign both variables.
    { values: [false], probability: 0.25 },
    { values: [false, true], probability: 0.25 },
    { values: [true, false], probability: 0.25 },
    { values: [true, true], probability: 0.25 },
  ]));
});

test("normalizes only rounding differences within the documented tolerance", () => {
  const { a } = fixture();
  const model = joint([a], [
    { values: [false], probability: 0.4 },
    { values: [true], probability: 0.6000000001 },
  ]);
  assert.equal(evaluate(or(a, not(a)), model).probability, 1);
  close(evaluate(a, model).probability, 0.6000000001 / 1.0000000001);
});

test("rejects sparse domains and assignments", () => {
  const { scope, a } = fixture();
  fails("INVALID_VARIABLE", () => scope.categorical("sparse", new Array<string>(1)));
  const variables = [a];
  fails("INVALID_DISTRIBUTION", () => joint(variables, [
    { values: new Array<boolean>(1), probability: 0.5 },
    { values: [true], probability: 0.5 },
  ]));
});

test("evaluates a circuit with extensively shared branches", () => {
  const { a } = fixture();
  let expression: Expression = a;
  for (let index = 0; index < 50; index++) expression = and(expression, expression);
  close(evaluate(expression, bernoulli(a, 0.8)).probability, 0.8);
});

test("checks the world limit before enumerating", () => {
  const { a, ab } = fixture();
  assert.equal(evaluate(a, ab, { maxWorlds: 4 }).worlds, 4);
  fails("WORLD_LIMIT_EXCEEDED", () => evaluate(a, ab, { maxWorlds: 3 }));
  for (const maxWorlds of [0, -1, 1.5, Infinity, NaN]) {
    fails("WORLD_LIMIT_EXCEEDED", () => evaluate(a, ab, { maxWorlds }));
  }
  const scope = createScope({ stateId: "large", revision: "1" });
  const variables = Array.from({ length: 17 }, (_, index) => scope.boolean(`v${index}`));
  const model = assumeIndependent(variables.map((variable) => bernoulli(variable, 0.5)), { reason: "Limit test." });
  fails("WORLD_LIMIT_EXCEEDED", () => evaluate(variables[0]!, model));
});

test("copies and freezes probability tables and provenance", () => {
  const { a } = fixture();
  const variables = [a];
  const values = [false];
  const rows = [
    { values, probability: 0.2 },
    { values: [true], probability: 0.8 },
  ];
  const provenance = { source: "manual", questionId: "original" };
  const model = joint(variables, rows, provenance);
  variables.length = 0;
  values[0] = true;
  rows[1]!.probability = 0;
  provenance.questionId = "changed";
  close(evaluate(a, model).probability, 0.8);
  assert.equal(evaluate(a, model).sources[0]?.provenance?.questionId, "original");
  assert.ok(Object.isFrozen(model));
  assert.ok(Object.isFrozen(model.rows));
  assert.ok(Object.isFrozen(model.rows[0]?.values));
  assert.ok(Object.isFrozen(a.scope));
  assert.ok(Object.isFrozen(a.domain));
});
