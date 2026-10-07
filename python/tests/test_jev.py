"""Jev Noul and Choice conversion."""

import pytest

from conjevture import ConjevtureError, and_, create_scope, eq, evaluate, or_, xor
from conjevture.jev import JevProvenance, from_choice, from_joint_choice, from_noul


def fails_code(action, code: str) -> None:
    with pytest.raises(ConjevtureError) as info:
        action()
    assert info.value.code == code


def test_converts_a_noul_answer_and_preserves_provenance() -> None:
    scope = create_scope(state_id="message:1", revision="2")
    refund = scope.boolean("refund")
    model = from_noul(
        refund,
        {"type": "noul", "noul": 0.85},
        provenance=JevProvenance(
            model="fixture-model", question_id="refund", request_id="request:1"
        ),
    )
    result = evaluate(refund, model)
    assert result.probability == 0.85
    assert result.sources[0].provenance is not None
    assert result.sources[0].provenance.source == "jev"
    assert result.sources[0].provenance.model == "fixture-model"
    assert result.sources[0].provenance.question_id == "refund"
    assert result.sources[0].provenance.request_id == "request:1"
    assert result.sources[0].variables[0].scope.revision == "2"
    assert result.assumptions == ()


def test_noul_defaults_to_jev_provenance_without_other_fields() -> None:
    scope = create_scope(state_id="message:1", revision="1")
    flag = scope.boolean("flag")
    result = evaluate(flag, from_noul(flag, {"type": "noul", "noul": 0.5}))
    assert result.sources[0].provenance is not None
    assert result.sources[0].provenance.source == "jev"
    assert result.sources[0].provenance.model is None


def test_uses_all_choice_probabilities_without_multiplying_confidence() -> None:
    scope = create_scope(state_id="message:1", revision="1")
    route = scope.categorical("route", ["billing", "technical", "other"])
    model = from_choice(
        route,
        {
            "type": "choice",
            "choice": "billing",
            "confidence": 0.05,
            "probabilities": {"billing": 0.6, "technical": 0.3, "other": 0.1},
        },
    )
    assert evaluate(eq(route, "billing"), model).probability == 0.6
    assert (
        abs(evaluate(or_(eq(route, "billing"), eq(route, "technical")), model).probability - 0.9)
        < 1e-12
    )
    assert evaluate(and_(eq(route, "billing"), eq(route, "technical")), model).probability == 0


def test_maps_a_joint_choice_to_one_coherent_distribution() -> None:
    scope = create_scope(state_id="ticket:42", revision="3")
    urgent = scope.boolean("urgent")
    repeat = scope.boolean("repeat")
    model = from_joint_choice(
        (urgent, repeat),
        {
            "neither": (False, False),
            "urgentOnly": (True, False),
            "repeatOnly": (False, True),
            "both": (True, True),
        },
        {
            "type": "choice",
            "choice": "both",
            "confidence": 0.1,
            "probabilities": {"both": 0.5, "neither": 0.1, "repeatOnly": 0.1, "urgentOnly": 0.3},
        },
    )
    assert evaluate(and_(urgent, repeat), model).probability == 0.5
    assert evaluate(or_(urgent, repeat), model).probability == 0.9
    assert evaluate(xor(urgent, repeat), model).probability == 0.4


@pytest.mark.parametrize(
    "answer",
    [
        None,
        {},
        [],
        {"type": "noul", "noul": "0.5"},
        {"type": "noul", "noul": True},
        {"type": "choice", "noul": 0.5},
        {"type": "noul"},
        {"noul": 0.5},
    ],
)
def test_rejects_malformed_noul_answers(answer) -> None:
    flag = create_scope(state_id="message:1", revision="1").boolean("flag")
    fails_code(lambda: from_noul(flag, answer), "INVALID_JEV_ANSWER")


@pytest.mark.parametrize("noul", [float("nan"), float("inf"), -1, 2, 1.5])
def test_rejects_out_of_range_noul_values(noul) -> None:
    flag = create_scope(state_id="message:1", revision="1").boolean("flag")
    fails_code(lambda: from_noul(flag, {"type": "noul", "noul": noul}), "INVALID_DISTRIBUTION")


@pytest.mark.parametrize(
    "answer",
    [
        None,
        {},
        [],
        {"type": "choice", "probabilities": None},
        {"type": "choice", "probabilities": [0.5, 0.5]},
        {"type": "choice", "probabilities": {"a": 1}},
        {"type": "choice", "probabilities": {"a": 0.5, "c": 0.5}},
        {"type": "choice", "probabilities": {"a": 0.5, "b": 0.4, "c": 0.1}},
        {"type": "choice", "probabilities": {"a": "0.5", "b": 0.5}},
        {"type": "choice", "probabilities": {"a": True, "b": 0.5}},
        {"type": "noul", "probabilities": {"a": 0.5, "b": 0.5}},
    ],
)
def test_rejects_malformed_choice_answers(answer) -> None:
    scope = create_scope(state_id="message:1", revision="1")
    route = scope.categorical("route", ["a", "b"])
    fails_code(lambda: from_choice(route, answer), "INVALID_JEV_ANSWER")


def test_rejects_choice_probabilities_that_do_not_sum_to_one() -> None:
    scope = create_scope(state_id="message:1", revision="1")
    route = scope.categorical("route", ["a", "b"])
    fails_code(
        lambda: from_choice(route, {"type": "choice", "probabilities": {"a": 0.5, "b": 0.6}}),
        "INVALID_DISTRIBUTION",
    )
    fails_code(
        lambda: from_choice(
            route, {"type": "choice", "probabilities": {"a": float("nan"), "b": 1.0}}
        ),
        "INVALID_DISTRIBUTION",
    )


def test_requires_a_complete_joint_mapping_without_duplicate_worlds() -> None:
    flag = create_scope(state_id="message:1", revision="1").boolean("flag")
    fails_code(
        lambda: from_joint_choice(
            (flag,),
            {"yes": (True,)},
            {"type": "choice", "probabilities": {"yes": 1}},
        ),
        "INVALID_DISTRIBUTION",
    )
    fails_code(
        lambda: from_joint_choice(
            (flag,),
            {"first": (True,), "second": (True,)},
            {"type": "choice", "probabilities": {"first": 0.5, "second": 0.5}},
        ),
        "INVALID_DISTRIBUTION",
    )


def test_joint_choice_mapping_must_match_domain_types() -> None:
    flag = create_scope(state_id="message:1", revision="1").boolean("flag")
    fails_code(
        lambda: from_joint_choice(
            (flag,),
            {"no": ("false",), "yes": (True,)},
            {"type": "choice", "probabilities": {"no": 0.5, "yes": 0.5}},
        ),
        "INVALID_DISTRIBUTION",
    )


def test_supports_labels_that_also_name_object_prototype_properties() -> None:
    scope = create_scope(state_id="labels", revision="1")
    route = scope.categorical("route", ["__proto__", "constructor"])
    model = from_choice(
        route,
        {"type": "choice", "probabilities": {"__proto__": 0.4, "constructor": 0.6}},
    )
    assert evaluate(eq(route, "__proto__"), model).probability == 0.4


@pytest.mark.parametrize("probability", [10**400, -(10**400)])
def test_large_int_jev_probabilities_have_a_domain_error(probability) -> None:
    scope = create_scope(state_id="message:1", revision="1")
    flag = scope.boolean("flag")
    route = scope.categorical("route", ("a", "b"))
    fails_code(
        lambda: from_noul(flag, {"type": "noul", "noul": probability}),
        "INVALID_DISTRIBUTION",
    )
    fails_code(
        lambda: from_choice(
            route, {"type": "choice", "probabilities": {"a": probability, "b": 0.5}}
        ),
        "INVALID_DISTRIBUTION",
    )
    fails_code(
        lambda: from_joint_choice(
            (flag,),
            {"no": (False,), "yes": (True,)},
            {"type": "choice", "probabilities": {"no": probability, "yes": 0.5}},
        ),
        "INVALID_DISTRIBUTION",
    )
