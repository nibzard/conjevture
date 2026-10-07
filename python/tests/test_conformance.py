"""Shared conformance fixtures: the Python side of python/tests/fixtures/conformance.

The TypeScript runner (test/conformance.test.ts) executes the same JSON
scenarios against the baseline implementation, so every fixture pins both
implementations to identical behavior.
"""

import json
from collections.abc import Callable
from functools import cache
from pathlib import Path
from typing import Any

import pytest

from conjevture import (
    ConjevtureError,
    JointDistribution,
    JointRow,
    Provenance,
    Scope,
    Variable,
    and_,
    assume_independent,
    bernoulli,
    constant,
    create_scope,
    eq,
    evaluate,
    joint,
    not_,
    or_,
    xor,
)
from conjevture.jev import JevProvenance, from_choice, from_joint_choice, from_noul

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "conformance"
GATES: dict[str, Callable[[Any, Any], Any]] = {"and": and_, "or": or_, "xor": xor}


class FixtureLoad:
    """Native objects built from one fixture file, keyed by fixture ids."""

    def __init__(self) -> None:
        self.scopes: dict[str, Scope] = {}
        self.variables: dict[str, Variable[Any]] = {}
        self.ids: dict[Variable[Any], str] = {}
        self.distributions: dict[str, JointDistribution] = {}
        self.models: dict[str, Any] = {}

    def variable(self, variable_id: str) -> Variable[Any]:
        assert variable_id in self.variables, f'Unknown fixture variable "{variable_id}".'
        return self.variables[variable_id]

    def scope(self, scope_id: str) -> Scope:
        assert scope_id in self.scopes, f'Unknown fixture scope "{scope_id}".'
        return self.scopes[scope_id]

    def distribution(self, distribution_id: str) -> JointDistribution:
        assert distribution_id in self.distributions, (
            f'Unknown fixture distribution "{distribution_id}".'
        )
        return self.distributions[distribution_id]

    def id_of(self, variable: Variable[Any]) -> str:
        assert variable in self.ids, "A fixture variable is missing from the identifier map."
        return self.ids[variable]


def full_provenance(node: dict[str, Any]) -> Provenance:
    return Provenance(**_provenance_fields(node))


def _provenance_fields(node: dict[str, Any]) -> dict[str, str]:
    """Convert camelCase fixture fields to the snake_case record fields."""
    names = {
        "source": "source",
        "model": "model",
        "questionId": "question_id",
        "requestId": "request_id",
    }
    return {names[key]: value for key, value in node.items() if key in names}


def jev_provenance(node: dict[str, Any] | None) -> JevProvenance:
    if node is None:
        return JevProvenance()
    return JevProvenance(**_provenance_fields(node))


def build_expression(node: Any, load: FixtureLoad) -> Any:
    if isinstance(node, str):
        return load.variable(node)
    kind = node["kind"]
    if kind == "constant":
        return constant(node["value"])
    if kind == "not":
        return not_(build_expression(node["operand"], load))
    if kind in GATES:
        return GATES[kind](
            build_expression(node["left"], load),
            build_expression(node["right"], load),
        )
    if kind == "equals":
        return eq(load.variable(node["variable"]), node["value"])
    if kind == "repeat":
        expression = build_expression(node["operand"], load)
        gate = GATES[node["gate"]]
        for _ in range(node["count"]):
            expression = gate(expression, expression)
        return expression
    raise AssertionError(f'Unknown fixture expression kind "{kind}".')


def build_distribution(decl: dict[str, Any], load: FixtureLoad) -> JointDistribution:
    kind = decl["kind"]
    if kind == "joint":
        variables = [load.variable(variable_id) for variable_id in decl["variables"]]
        rows = [
            JointRow(values=tuple(row["values"]), probability=row["probability"])
            for row in decl["rows"]
        ]
        provenance = None if "provenance" not in decl else full_provenance(decl["provenance"])
        return joint(variables, rows, provenance=provenance)
    if kind == "bernoulli":
        provenance = None if "provenance" not in decl else full_provenance(decl["provenance"])
        return bernoulli(
            load.variable(decl["variable"]),
            decl["probability"],
            provenance=provenance,
        )
    if kind == "jev-noul":
        return from_noul(
            load.variable(decl["variable"]),
            decl["answer"],
            provenance=jev_provenance(decl.get("provenance")),
        )
    if kind == "jev-choice":
        return from_choice(
            load.variable(decl["variable"]),
            decl["answer"],
            provenance=jev_provenance(decl.get("provenance")),
        )
    if kind == "jev-joint-choice":
        return from_joint_choice(
            [load.variable(variable_id) for variable_id in decl["variables"]],
            {label: list(values) for label, values in decl["mapping"].items()},
            decl["answer"],
            provenance=jev_provenance(decl.get("provenance")),
        )
    raise AssertionError(f'Unknown fixture distribution kind "{kind}".')


def build_model(decl: dict[str, Any], load: FixtureLoad) -> Any:
    if decl["kind"] == "single":
        return load.distribution(decl["distribution"])
    return assume_independent(
        [load.distribution(group_id) for group_id in decl["groups"]],
        reason=decl["reason"],
    )


def build_variable(decl: dict[str, Any], scope: Scope) -> Variable[Any]:
    if decl["kind"] == "boolean":
        return scope.boolean(decl["name"])
    return scope.categorical(decl["name"], decl["labels"])


def run_check(check: dict[str, Any], load: FixtureLoad) -> None:
    if check["kind"] == "redeclare":
        scope = load.scope(check["scope"])

        def declare() -> Variable[Any]:
            return build_variable(check["variable"], scope)

        if "expectError" in check:
            with pytest.raises(ConjevtureError) as info:
                declare()
            assert info.value.code == check["expectError"]
            return
        again = declare()
        assert again is load.variable(check["sameAs"])
        if "domainOrder" in check:
            assert again.domain == tuple(check["domainOrder"])
        return
    if check["kind"] == "create-scope":
        with pytest.raises(ConjevtureError) as info:
            create_scope(state_id=check["stateId"], revision=check["revision"])
        assert info.value.code == check["expectError"]
        return
    raise AssertionError(f'Unknown fixture check kind "{check["kind"]}".')


def assumption_json(assumption: Any, load: FixtureLoad) -> dict[str, Any]:
    return {
        "groups": [[load.id_of(variable) for variable in group] for group in assumption.groups],
        "reason": assumption.reason,
    }


def source_json(source: Any, load: FixtureLoad) -> dict[str, Any]:
    record: dict[str, Any] = {"variables": [load.id_of(variable) for variable in source.variables]}
    if source.provenance is not None:
        provenance: dict[str, str] = {"source": source.provenance.source}
        if source.provenance.model is not None:
            provenance["model"] = source.provenance.model
        if source.provenance.question_id is not None:
            provenance["questionId"] = source.provenance.question_id
        if source.provenance.request_id is not None:
            provenance["requestId"] = source.provenance.request_id
        record["provenance"] = provenance
    return record


def run_case(fixture_case: dict[str, Any], load: FixtureLoad) -> None:
    # Expression construction itself can raise INVALID_VARIABLE for values
    # outside a domain, so build inside the checked action for error cases.
    def run() -> Any:
        expression = build_expression(fixture_case["expression"], load)
        model = None if "model" not in fixture_case else load.models[fixture_case["model"]]
        options: dict[str, Any] = {}
        if "maxWorlds" in fixture_case:
            options["max_worlds"] = fixture_case["maxWorlds"]
        return evaluate(expression, model, **options)

    if "expectError" in fixture_case:
        with pytest.raises(ConjevtureError) as info:
            run()
        assert info.value.code == fixture_case["expectError"]
        return

    result = run()
    expected = fixture_case["expect"]
    assert abs(result.probability - expected["probability"]) < 1e-12, (
        f"Expected probability {expected['probability']}, received {result.probability}."
    )
    assert result.worlds == expected["worlds"]
    assert result.method == "enumeration"
    assert [assumption_json(a, load) for a in result.assumptions] == expected["assumptions"]
    assert [source_json(source, load) for source in result.sources] == expected["sources"]


@cache
def loaded_fixture(path_text: str) -> tuple[str, tuple[dict[str, Any], ...], FixtureLoad]:
    path = Path(path_text)
    data = json.loads(path.read_text())
    load = FixtureLoad()
    for scope_decl in data["scopes"]:
        load.scopes[scope_decl["id"]] = create_scope(
            state_id=scope_decl["stateId"], revision=scope_decl["revision"]
        )
    for variable_decl in data.get("variables", []):
        variable = build_variable(variable_decl, load.scope(variable_decl["scope"]))
        load.variables[variable_decl["id"]] = variable
        load.ids[variable] = variable_decl["id"]
    for distribution_decl in data.get("distributions", []):
        if "expectError" in distribution_decl:
            with pytest.raises(ConjevtureError) as info:
                build_distribution(distribution_decl, load)
            assert info.value.code == distribution_decl["expectError"], (
                f'Distribution "{distribution_decl["id"]}" should fail '
                f"with {distribution_decl['expectError']}."
            )
            continue
        load.distributions[distribution_decl["id"]] = build_distribution(distribution_decl, load)
    for model_decl in data.get("models", []):
        if "expectError" in model_decl:
            with pytest.raises(ConjevtureError) as info:
                build_model(model_decl, load)
            assert info.value.code == model_decl["expectError"], (
                f'Model "{model_decl["id"]}" should fail with {model_decl["expectError"]}.'
            )
            continue
        load.models[model_decl["id"]] = build_model(model_decl, load)
    for check in data.get("checks", []):
        run_check(check, load)
    return data["id"], tuple(data["cases"]), load


FILES = sorted(FIXTURES.glob("*.json"))
assert FILES, "No conformance fixtures found."


def case_parameters() -> list[Any]:
    parameters = []
    for path in FILES:
        data = json.loads(path.read_text())
        for fixture_case in data["cases"]:
            parameters.append(
                pytest.param(str(path), fixture_case["id"], id=f"{data['id']}:{fixture_case['id']}")
            )
    return parameters


@pytest.mark.parametrize("path", [str(p) for p in FILES], ids=[p.stem for p in FILES])
def test_fixture_construction_and_checks(path: str) -> None:
    loaded_fixture(path)


@pytest.mark.parametrize(("path", "case_id"), case_parameters())
def test_conformance_case(path: str, case_id: str) -> None:
    _, cases, load = loaded_fixture(path)
    fixture_case = next(case for case in cases if case["id"] == case_id)
    run_case(fixture_case, load)


def test_fixtures_cover_the_core_contract() -> None:
    count = sum(len(json.loads(path.read_text())["cases"]) for path in FILES)
    assert count >= 60, f"Expected the shared contract to stay comprehensive; saw {count} cases."
