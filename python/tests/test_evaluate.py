"""Exact enumeration: identities, correlations, limits, and deep circuits."""

from dataclasses import FrozenInstanceError
from typing import Any

import pytest

from conjevture import (
    ConjevtureError,
    JointRow,
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


def fails(code: str, action) -> None:
    with pytest.raises(ConjevtureError) as info:
        action()
    assert info.value.code == code


def close(actual: float, expected: float) -> None:
    assert abs(actual - expected) < 1e-12, f"Expected {expected}, received {actual}"


@pytest.fixture
def scope():
    return create_scope(state_id="ticket:42", revision="3")


@pytest.fixture
def a(scope):
    return scope.boolean("urgent")


@pytest.fixture
def b(scope):
    return scope.boolean("repeat")


@pytest.fixture
def ab(a, b):
    return joint(
        (a, b),
        (
            JointRow(values=(False, False), probability=0.10),
            JointRow(values=(True, False), probability=0.30),
            JointRow(values=(False, True), probability=0.10),
            JointRow(values=(True, True), probability=0.50),
        ),
    )


def test_preserves_identities_for_repeated_variables(a, b, ab) -> None:
    cases = [
        (a, 0.8),
        (and_(a, a), 0.8),
        (or_(a, a), 0.8),
        (xor(a, a), 0.0),
        (or_(a, not_(a)), 1.0),
        (and_(a, not_(a)), 0.0),
        (not_(not_(a)), 0.8),
        (or_(and_(a, b), and_(a, not_(b))), 0.8),
        (and_(or_(a, b), or_(a, not_(b))), 0.8),
        (xor(or_(a, b), and_(a, b)), 0.4),
    ]
    for expression, expected in cases:
        close(evaluate(expression, ab).probability, expected)


def test_uses_the_supplied_correlation_for_every_gate(a, b, ab) -> None:
    close(evaluate(a, ab).probability, 0.8)
    close(evaluate(b, ab).probability, 0.6)
    close(evaluate(and_(a, b), ab).probability, 0.5)
    close(evaluate(or_(a, b), ab).probability, 0.9)
    close(evaluate(xor(a, b), ab).probability, 0.4)
    close(evaluate(not_(a), ab).probability, 0.2)
    assert evaluate(a, ab).assumptions == ()
    assert evaluate(a, ab).worlds == 4
    assert evaluate(a, ab).method == "enumeration"


def test_declares_mutual_independence_and_retains_the_reason(a, b, ab, scope) -> None:
    c = scope.boolean("resolved")
    model = assume_independent((ab, bernoulli(c, 0.1)), reason="Illustrative assumption.")
    result = evaluate(and_(or_(a, b), not_(c)), model)
    close(result.probability, 0.81)
    assert result.worlds == 8
    assert result.assumptions[0].reason == "Illustrative assumption."
    assert result.assumptions[0].groups == ((a, b), (c,))
    assert [source.variables for source in result.sources] == [(a, b), (c,)]


def test_independent_marginals_produce_independent_gate_probabilities(a, b) -> None:
    model = assume_independent(
        (bernoulli(a, 0.8), bernoulli(b, 0.6)),
        reason="Test independence.",
    )
    close(evaluate(and_(a, b), model).probability, 0.48)
    close(evaluate(or_(a, b), model).probability, 0.92)
    close(evaluate(xor(a, b), model).probability, 0.44)


def test_categorical_labels_are_mutually_exclusive(scope) -> None:
    route = scope.categorical("route", ["billing", "technical", "other"])
    model = joint(
        (route,),
        (
            JointRow(values=("billing",), probability=0.5),
            JointRow(values=("technical",), probability=0.3),
            JointRow(values=("other",), probability=0.2),
        ),
    )
    close(evaluate(and_(eq(route, "billing"), eq(route, "technical")), model).probability, 0.0)
    close(evaluate(or_(eq(route, "billing"), eq(route, "technical")), model).probability, 0.8)
    close(evaluate(not_(eq(route, "other")), model).probability, 0.8)
    assert evaluate(eq(route, "billing"), model).worlds == 3


def test_matches_direct_truth_table_evaluation(scope) -> None:
    a = scope.boolean("a")
    b = scope.boolean("b")
    route = scope.categorical("route", ["billing", "technical"])
    rows = [
        ((False, False, "billing"), 0.03),
        ((False, False, "technical"), 0.07),
        ((False, True, "billing"), 0.11),
        ((False, True, "technical"), 0.09),
        ((True, False, "billing"), 0.13),
        ((True, False, "technical"), 0.17),
        ((True, True, "billing"), 0.19),
        ((True, True, "technical"), 0.21),
    ]
    model = joint(
        (a, b, route),
        tuple(JointRow(values=values, probability=p) for values, p in rows),
    )
    expression = xor(and_(or_(a, b), eq(route, "billing")), not_(a))
    expected = sum(
        p for (av, bv, label), p in rows if ((av or bv) and label == "billing") != (not av)
    )
    close(evaluate(expression, model).probability, expected)


def test_evaluates_constants_without_a_model() -> None:
    assert evaluate(constant(True)).probability == 1
    assert evaluate(not_(constant(True))).probability == 0
    assert evaluate(xor(constant(True), constant(False))).probability == 1
    assert evaluate(xor(constant(True), constant(False))).worlds == 1
    assert evaluate(and_(constant(True), constant(True))).sources == ()


def test_handles_probabilities_of_zero_and_one(a) -> None:
    assert evaluate(a, bernoulli(a, 0)).probability == 0
    assert evaluate(a, bernoulli(a, 0)).worlds == 2
    assert evaluate(not_(a), bernoulli(a, 1)).probability == 0
    assert evaluate(a, bernoulli(a, 1)).probability == 1


def test_zero_probability_rows_are_skipped_but_counted(a, b) -> None:
    model = joint(
        (a, b),
        (
            JointRow(values=(False, False), probability=0.5),
            JointRow(values=(True, False), probability=0.5),
            JointRow(values=(False, True), probability=0.0),
            JointRow(values=(True, True), probability=0.0),
        ),
    )
    result = evaluate(and_(a, b), model)
    assert result.probability == 0
    assert result.worlds == 4
    close(evaluate(or_(a, b), model).probability, 0.5)
    close(evaluate(or_(or_(a, b), and_(a, b)), model).probability, 0.5)


def test_normalizes_only_rounding_differences(a) -> None:
    model = joint(
        (a,),
        (
            JointRow(values=(False,), probability=0.4),
            JointRow(values=(True,), probability=0.6000000001),
        ),
    )
    assert evaluate(or_(a, not_(a)), model).probability == 1
    close(evaluate(a, model).probability, 0.6000000001 / 1.0000000001)


def test_unused_variables_still_count_toward_worlds(a, ab) -> None:
    assert evaluate(a, ab).worlds == 4


def test_checks_the_world_limit_before_enumerating(a, ab) -> None:
    assert evaluate(a, ab, max_worlds=4).worlds == 4
    fails("WORLD_LIMIT_EXCEEDED", lambda: evaluate(a, ab, max_worlds=3))
    invalid_limits: list[Any] = [0, -1, 1.5, float("inf"), float("nan"), True, 2**53, "8"]
    for max_worlds in invalid_limits:
        fails("WORLD_LIMIT_EXCEEDED", lambda mw=max_worlds: evaluate(a, ab, max_worlds=mw))
    assert evaluate(a, ab, max_worlds=2**53 - 1).worlds == 4


def test_default_limit_boundary_is_65536_worlds(scope) -> None:
    variables = [scope.boolean(f"v{index}") for index in range(17)]
    distributions = [bernoulli(variable, 0.5) for variable in variables]

    sixteen = assume_independent(
        distributions[:16],
        reason="Limit boundary.",
    )
    expression = variables[0]
    for variable in variables[1:16]:
        expression = or_(expression, variable)
    result = evaluate(expression, sixteen)
    close(result.probability, 1 - 2**-16)
    assert result.worlds == 65536

    seventeen = assume_independent(distributions, reason="Limit boundary.")
    fails("WORLD_LIMIT_EXCEEDED", lambda: evaluate(variables[0], seventeen))


def test_evaluates_extensively_shared_branches(a) -> None:
    expression = a
    for _ in range(50):
        expression = and_(expression, expression)
    close(evaluate(expression, bernoulli(a, 0.8)).probability, 0.8)


def test_deep_expressions_do_not_rely_on_recursion(a) -> None:
    expression = a
    for _ in range(1500):
        expression = or_(expression, and_(expression, expression))
    close(evaluate(expression, bernoulli(a, 0.8)).probability, 0.8)


def test_rejects_variables_from_different_snapshots(a, ab) -> None:
    for revision in ("3", "4"):
        other = create_scope(state_id="ticket:42", revision=revision).boolean("urgent")
        fails("SCOPE_MISMATCH", lambda v=other: evaluate(v, ab))
        fails("SCOPE_MISMATCH", lambda v=other: evaluate(and_(a, v), ab))


def test_missing_distributions_fail(a, b) -> None:
    fails("MISSING_VARIABLE", lambda: evaluate(and_(a, b), bernoulli(a, 0.8)))
    fails("MISSING_VARIABLE", lambda: evaluate(a))


def test_rejects_non_expressions_and_unsupported_models(a) -> None:
    model = bernoulli(a, 0.5)
    with pytest.raises(TypeError):
        evaluate("urgent", model)  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        evaluate(a, [model])  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        evaluate(a, "model")  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        evaluate(a, 123)  # type: ignore[arg-type]


def test_results_are_immutable(a) -> None:
    result = evaluate(a, bernoulli(a, 0.5))
    with pytest.raises(FrozenInstanceError):
        result.probability = 1.0  # type: ignore[misc]
    with pytest.raises(FrozenInstanceError):
        result.sources = ()  # type: ignore[misc]


def test_many_singleton_groups_do_not_rely_on_recursion(scope) -> None:
    variables = [scope.categorical(f"single-{index}", ("only",)) for index in range(1100)]
    groups = [joint((v,), (JointRow(values=("only",), probability=1.0),)) for v in variables]
    model = assume_independent(groups, reason="Singleton domains.")
    result = evaluate(eq(variables[0], "only"), model)
    assert result.probability == 1.0
    assert result.worlds == 1
    assert len(result.sources) == 1100

    first, last = scope.boolean("first"), scope.boolean("last")
    mixed = assume_independent(
        (bernoulli(first, 0.3), *groups, bernoulli(last, 0.6)),
        reason="Singleton domains between Boolean groups.",
    )
    result = evaluate(and_(first, last), mixed)
    close(result.probability, 0.18)
    assert result.worlds == 4
