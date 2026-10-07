// Shared conformance runner. Loads the JSON fixtures in python/tests/fixtures/conformance
// and checks each scenario against the TypeScript implementation. The Python
// package runs the same fixtures through python/tests/test_conformance.py.
// Run from the repository root, like every other test in this suite.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  and,
  assumeIndependent,
  bernoulli,
  constant,
  ConjevtureError,
  createScope,
  eq,
  evaluate,
  joint,
  not,
  or,
  xor,
} from "conjevture";
import { fromChoice, fromJointChoice, fromNoul } from "conjevture/jev";
import type {
  ErrorCode,
  Evaluation,
  Expression,
  IndependenceAssumption,
  JointDistribution,
  ProbabilityModel,
  Provenance,
  Scope,
  Value,
  Variable,
} from "conjevture";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

function field(record: JsonObject, name: string): Json {
  const value = record[name];
  assert.ok(value !== undefined, `Missing fixture field "${name}".`);
  return value;
}

function objectField(record: JsonObject, name: string): JsonObject {
  return field(record, name) as JsonObject;
}

function listField(record: JsonObject, name: string): Json[] {
  return field(record, name) as Json[];
}

function stringField(record: JsonObject, name: string): string {
  return field(record, name) as string;
}

function numberField(record: JsonObject, name: string): number {
  return field(record, name) as number;
}
class FixtureLoad {
  readonly scopes = new Map<string, Scope>();
  readonly variables = new Map<string, Variable>();
  readonly ids = new Map<Variable, string>();
  readonly distributions = new Map<string, JointDistribution>();
  readonly models = new Map<string, ProbabilityModel>();

  variable(id: string): Variable {
    const variable = this.variables.get(id);
    assert.ok(variable, `Unknown fixture variable "${id}".`);
    return variable;
  }

  scope(id: string): Scope {
    const scope = this.scopes.get(id);
    assert.ok(scope, `Unknown fixture scope "${id}".`);
    return scope;
  }

  distribution(id: string): JointDistribution {
    const distribution = this.distributions.get(id);
    assert.ok(distribution, `Unknown fixture distribution "${id}".`);
    return distribution;
  }

  model(id: string): ProbabilityModel {
    const model = this.models.get(id);
    assert.ok(model, `Unknown fixture model "${id}".`);
    return model;
  }

  idOf(variable: Variable): string {
    const id = this.ids.get(variable);
    assert.ok(id, "A fixture variable is missing from the identifier map.");
    return id;
  }
}

function fixturesDirectory(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "python/tests/fixtures/conformance"),
    path.resolve(here, "../../python/tests/fixtures/conformance"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Conformance fixtures not found; run the tests from the repository root.");
}

function buildExpression(node: Json, load: FixtureLoad): Expression {
  if (typeof node === "string") return load.variable(node) as Variable<boolean>;
  const record = node as JsonObject;
  switch (record.kind) {
    case "constant":
      return constant(field(record, "value") as boolean);
    case "not":
      return not(buildExpression(field(record, "operand"), load));
    case "and":
      return and(buildExpression(field(record, "left"), load), buildExpression(field(record, "right"), load));
    case "or":
      return or(buildExpression(field(record, "left"), load), buildExpression(field(record, "right"), load));
    case "xor":
      return xor(buildExpression(field(record, "left"), load), buildExpression(field(record, "right"), load));
    case "equals":
      return eq(
        load.variable(stringField(record, "variable")) as Variable<Value>,
        field(record, "value") as Value,
      );
    case "repeat": {
      let expression = buildExpression(field(record, "operand"), load);
      const count = numberField(record, "count");
      for (let index = 0; index < count; index++) {
        expression =
          record.gate === "and" ? and(expression, expression)
          : record.gate === "or" ? or(expression, expression)
          : xor(expression, expression);
      }
      return expression;
    }
    default:
      throw new Error(`Unknown fixture expression kind "${String(record.kind)}".`);
  }
}

function fullProvenance(node: Json): Provenance {
  const record = node as JsonObject;
  const provenance: { source?: string; model?: string; questionId?: string; requestId?: string } = {};
  for (const [key, value] of Object.entries(record)) provenance[key as keyof typeof provenance] = value as string;
  return provenance as Provenance;
}

function optionalProvenance(node: Json | undefined): [] | [Provenance] {
  return node === undefined ? [] : [fullProvenance(node)];
}

function jevProvenance(node: Json | undefined): { model?: string; questionId?: string; requestId?: string } {
  if (node === undefined) return {};
  const record = node as JsonObject;
  const provenance: { model?: string; questionId?: string; requestId?: string } = {};
  for (const [key, value] of Object.entries(record)) provenance[key as keyof typeof provenance] = value as string;
  return provenance;
}

function buildDistribution(decl: JsonObject, load: FixtureLoad): JointDistribution {
  switch (decl.kind) {
    case "joint": {
      const variables = (listField(decl, "variables") as string[]).map((id) => load.variable(id));
      const rows = (listField(decl, "rows") as JsonObject[]).map((row) => ({
        values: listField(row, "values") as Value[],
        probability: numberField(row, "probability"),
      }));
      return joint(variables, rows, ...optionalProvenance(decl.provenance));
    }
    case "bernoulli":
      return bernoulli(
        load.variable(stringField(decl, "variable")) as Variable<boolean>,
        numberField(decl, "probability"),
        ...optionalProvenance(decl.provenance),
      );
    case "jev-noul":
      return fromNoul(
        load.variable(stringField(decl, "variable")) as Variable<boolean>,
        field(decl, "answer"),
        jevProvenance(decl.provenance),
      );
    case "jev-choice":
      return fromChoice(
        load.variable(stringField(decl, "variable")) as Variable<string>,
        field(decl, "answer"),
        jevProvenance(decl.provenance),
      );
    case "jev-joint-choice": {
      const variables = (listField(decl, "variables") as string[]).map((id) => load.variable(id));
      const mapping = objectField(decl, "mapping") as Record<string, Value[]>;
      return fromJointChoice(
        variables as [Variable<Value>, ...Variable<Value>[]],
        mapping as Record<string, never>,
        field(decl, "answer"),
        jevProvenance(decl.provenance),
      );
    }
    default:
      throw new Error(`Unknown fixture distribution kind "${String(decl.kind)}".`);
  }
}

function buildModel(decl: JsonObject, load: FixtureLoad): ProbabilityModel {
  if (decl.kind === "single") return load.distribution(stringField(decl, "distribution"));
  return assumeIndependent((listField(decl, "groups") as string[]).map((id) => load.distribution(id)), {
    reason: stringField(decl, "reason"),
  });
}

function buildVariable(decl: JsonObject, scope: Scope): Variable {
  return field(decl, "kind") === "boolean"
    ? scope.boolean(stringField(decl, "name"))
    : scope.categorical(stringField(decl, "name"), listField(decl, "labels") as string[]);
}

function expectedCode(node: Json): ErrorCode {
  return node as ErrorCode;
}

function runCheck(check: JsonObject, load: FixtureLoad): void {
  switch (check.kind) {
    case "redeclare": {
      const scope = load.scope(check.scope as string);
      const action = (): Variable => buildVariable(check.variable as JsonObject, scope);
      if (check.expectError !== undefined) {
        const code = expectedCode(check.expectError);
        assert.throws(action, (error: unknown) => error instanceof ConjevtureError && error.code === code);
        return;
      }
      const again = action();
      assert.equal(again, load.variable(stringField(check, "sameAs")));
      if (check.domainOrder !== undefined) {
        assert.deepEqual(Array.from(again.domain), check.domainOrder);
      }
      return;
    }
    case "create-scope": {
      const code = expectedCode(field(check, "expectError"));
      assert.throws(
        () => createScope({ stateId: stringField(check, "stateId"), revision: stringField(check, "revision") }),
        (error: unknown) => error instanceof ConjevtureError && error.code === code,
      );
      return;
    }
    default:
      throw new Error(`Unknown fixture check kind "${String(check.kind)}".`);
  }
}

function assumptionJson(assumption: IndependenceAssumption, load: FixtureLoad): Json {
  return {
    groups: assumption.groups.map((group) => Array.from(group, (variable) => load.idOf(variable))),
    reason: assumption.reason,
  };
}

function sourceJson(source: Evaluation["sources"][number], load: FixtureLoad): Json {
  const variables = Array.from(source.variables, (variable) => load.idOf(variable));
  if (source.provenance === undefined) return { variables };
  const provenance = source.provenance;
  const record: Record<string, string> = { source: provenance.source };
  if (provenance.model !== undefined) record.model = provenance.model;
  if (provenance.questionId !== undefined) record.questionId = provenance.questionId;
  if (provenance.requestId !== undefined) record.requestId = provenance.requestId;
  return { variables, provenance: record };
}

function runCase(fixtureCase: JsonObject, load: FixtureLoad): void {
  // Expression construction itself can raise INVALID_VARIABLE for values
  // outside a domain, so build inside the checked action for error cases.
  const run = (): Evaluation => {
    const expression = buildExpression(field(fixtureCase, "expression"), load);
    const model = fixtureCase.model === undefined ? undefined : load.model(fixtureCase.model as string);
    const options =
      fixtureCase.maxWorlds === undefined ? {} : { maxWorlds: fixtureCase.maxWorlds as number };
    return evaluate(expression, model, options);
  };
  if (fixtureCase.expectError !== undefined) {
    const code = expectedCode(fixtureCase.expectError);
    assert.throws(
      () => run(),
      (error: unknown) => error instanceof ConjevtureError && error.code === code,
    );
    return;
  }
  const result = run();
  const expected = objectField(fixtureCase, "expect");
  const expectedProbability = numberField(expected, "probability");
  assert.ok(
    Math.abs(result.probability - expectedProbability) < 1e-12,
    `Expected probability ${expectedProbability}, received ${result.probability}.`,
  );
  assert.equal(result.worlds, numberField(expected, "worlds"));
  assert.equal(result.method, "enumeration");
  assert.deepEqual(
    result.assumptions.map((assumption) => assumptionJson(assumption, load)),
    expected.assumptions,
  );
  assert.deepEqual(
    result.sources.map((source) => sourceJson(source, load)),
    expected.sources,
  );
}

const directory = fixturesDirectory();
const files = fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort();
assert.ok(files.length > 0, "No conformance fixtures found.");

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")) as JsonObject;
  const load = new FixtureLoad();
  for (const scopeDecl of data.scopes as JsonObject[]) {
    load.scopes.set(
      stringField(scopeDecl, "id"),
      createScope({ stateId: stringField(scopeDecl, "stateId"), revision: stringField(scopeDecl, "revision") }),
    );
  }
  for (const variableDecl of (data.variables ?? []) as JsonObject[]) {
    const variable = buildVariable(variableDecl, load.scope(stringField(variableDecl, "scope")));
    load.variables.set(stringField(variableDecl, "id"), variable);
    load.ids.set(variable, stringField(variableDecl, "id"));
  }
  for (const distributionDecl of (data.distributions ?? []) as JsonObject[]) {
    if (distributionDecl.expectError !== undefined) {
      const code = expectedCode(distributionDecl.expectError);
      assert.throws(
        () => buildDistribution(distributionDecl, load),
        (error: unknown) => error instanceof ConjevtureError && error.code === code,
        `Distribution "${stringField(distributionDecl, "id")}" should fail with ${code}.`,
      );
      continue;
    }
    load.distributions.set(stringField(distributionDecl, "id"), buildDistribution(distributionDecl, load));
  }
  for (const modelDecl of (data.models ?? []) as JsonObject[]) {
    if (modelDecl.expectError !== undefined) {
      const code = expectedCode(modelDecl.expectError);
      assert.throws(
        () => buildModel(modelDecl, load),
        (error: unknown) => error instanceof ConjevtureError && error.code === code,
        `Model "${stringField(modelDecl, "id")}" should fail with ${code}.`,
      );
      continue;
    }
    load.models.set(stringField(modelDecl, "id"), buildModel(modelDecl, load));
  }
  for (const check of (data.checks ?? []) as JsonObject[]) runCheck(check, load);

  const fixtureId = stringField(data, "id");
  for (const fixtureCase of data.cases as JsonObject[]) {
    test(`conformance ${fixtureId}: ${stringField(fixtureCase, "id")}`, () => {
      runCase(fixtureCase, load);
    });
  }
}
