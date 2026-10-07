"""Joint tables, Bernoulli rows, independence declarations, and validation."""

from dataclasses import FrozenInstanceError, replace

import pytest

from conjevture import (
    ConjevtureError,
    IndependenceAssumption,
    IndependentModel,
    JointDistribution,
    JointRow,
    Provenance,
    assume_independent,
    bernoulli,
    create_scope,
    evaluate,
    joint,
)


def fails(code: str, action) -> None:
    with pytest.raises(ConjevtureError) as info:
        action()
    assert info.value.code == code


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


def test_joint_requires_every_assignment_exactly_once(a) -> None:
    fails(
        "INVALID_DISTRIBUTION",
        lambda: joint((a,), (JointRow(values=(True,), probability=1),)),
    )
    fails(
        "INVALID_DISTRIBUTION",
        lambda: joint(
            (a,),
            (
                JointRow(values=(True,), probability=0.5),
                JointRow(values=(True,), probability=0.5),
            ),
        ),
    )
    fails(
        "INVALID_DISTRIBUTION",
        lambda: joint(
            (a,),
            (
                JointRow(values=(False,), probability=0.3),
                JointRow(values=(True,), probability=0.8),
            ),
        ),
    )


def test_joint_validates_row_shapes_and_domains(a, b) -> None:
    fails(
        "INVALID_DISTRIBUTION",
        lambda: joint(
            (a, b),
            (
                JointRow(values=(False,), probability=0.25),
                JointRow(values=(False, True), probability=0.25),
                JointRow(values=(True, False), probability=0.25),
                JointRow(values=(True, True), probability=0.25),
            ),
        ),
    )
    fails(
        "INVALID_DISTRIBUTION",
        lambda: joint(
            (a,),
            (
                JointRow(values=("true",), probability=0.5),
                JointRow(values=(False,), probability=0.5),
            ),
        ),
    )


def test_boolean_assignments_require_real_booleans(a) -> None:
    # 1 == True in Python, so runtime checks must reject it.
    fails(
        "INVALID_DISTRIBUTION",
        lambda: joint(
            (a,),
            (
                JointRow(values=(1,), probability=0.5),  # type: ignore[arg-type]
                JointRow(values=(0,), probability=0.5),  # type: ignore[arg-type]
            ),
        ),
    )
    distribution = joint(
        (a,),
        (
            JointRow(values=(False,), probability=0.5),
            JointRow(values=(True,), probability=0.5),
        ),
    )
    assert distribution.rows[0].values == (False,)
    assert distribution.rows[1].values == (True,)


def test_joint_rejects_empty_and_duplicate_variables(a) -> None:
    fails("INVALID_DISTRIBUTION", lambda: joint((), ()))
    fails("OVERLAPPING_VARIABLES", lambda: joint((a, a), ()))


def test_joint_rejects_variables_from_different_scopes(a) -> None:
    other = create_scope(state_id="ticket:42", revision="4").boolean("urgent")
    fails("SCOPE_MISMATCH", lambda: joint((a, other), ()))


def test_joint_rejects_non_variable_and_non_row_inputs(a) -> None:
    with pytest.raises(TypeError):
        joint(("urgent",), ())  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        joint(
            (a,),
            ({"values": (True,), "probability": 1.0},),  # type: ignore[arg-type]
        )


@pytest.mark.parametrize(
    "probability",
    [float("nan"), float("inf"), float("-inf"), -0.1, 1.1, -1, 2, True, "0.5"],
)
def test_invalid_probabilities_fail(a, probability) -> None:
    fails("INVALID_DISTRIBUTION", lambda: bernoulli(a, probability))


@pytest.mark.parametrize("probability", [0, 1, 0.5, 1.0])
def test_valid_int_and_float_probabilities_pass(a, probability) -> None:
    distribution = bernoulli(a, probability)
    assert isinstance(distribution, JointDistribution)
    assert len(distribution.rows) == 2


def test_bernoulli_builds_the_two_boolean_rows(a) -> None:
    distribution = bernoulli(a, 0.25)
    assert distribution.rows[0].values == (False,)
    assert distribution.rows[0].probability == pytest.approx(0.75)
    assert distribution.rows[1].values == (True,)
    assert distribution.rows[1].probability == pytest.approx(0.25)


def test_bernoulli_rejects_non_boolean_variables(scope, a) -> None:
    route = scope.categorical("route", ["billing", "technical"])
    fails("INVALID_DISTRIBUTION", lambda: bernoulli(route, 0.5))
    with pytest.raises(TypeError):
        bernoulli("urgent", 0.5)  # type: ignore[arg-type]


def test_normalization_only_for_rounding_differences(a) -> None:
    accepted = joint(
        (a,),
        (
            JointRow(values=(False,), probability=0.5),
            JointRow(values=(True,), probability=0.5000000004),
        ),
    )
    assert accepted.rows[1].probability == pytest.approx(0.5 / 1.0000000004)
    fails(
        "INVALID_DISTRIBUTION",
        lambda: joint(
            (a,),
            (
                JointRow(values=(False,), probability=0.5),
                JointRow(values=(True,), probability=0.500000002),
            ),
        ),
    )


def test_joint_copies_caller_owned_inputs(a) -> None:
    variables = [a]
    values = [False]
    rows: list[JointRow] = [
        JointRow(values=values, probability=0.2),  # type: ignore[arg-type]
        JointRow(values=[True], probability=0.8),  # type: ignore[arg-type]
    ]
    provenance = Provenance(source="manual", question_id="original")
    model = joint(variables, rows, provenance=provenance)
    variables.clear()
    values[0] = True
    rows[1] = JointRow(values=(True,), probability=0.0)
    result = evaluate(a, model)
    assert result.probability == pytest.approx(0.8)
    assert model.variables == (a,)
    assert model.rows[0].values == (False,)
    assert model.rows[1].probability == pytest.approx(0.8)
    assert model.provenance is not provenance
    assert model.provenance == Provenance(source="manual", question_id="original")
    assert result.sources[0].provenance is not None
    assert result.sources[0].provenance.question_id == "original"


def test_joint_accepts_lists_and_stores_tuples(a) -> None:
    model = joint(
        [a],
        [
            JointRow(values=[False], probability=0.5),  # type: ignore[arg-type]
            JointRow(values=[True], probability=0.5),  # type: ignore[arg-type]
        ],
    )
    assert isinstance(model.variables, tuple)
    assert all(isinstance(row.values, tuple) for row in model.rows)


def test_assume_independent_records_groups_and_reason(a, b, ab, scope) -> None:
    c = scope.boolean("resolved")
    model = assume_independent((ab, bernoulli(c, 0.1)), reason="Illustrative assumption.")
    assert len(model.assumptions) == 1
    assumption = model.assumptions[0]
    assert assumption.reason == "Illustrative assumption."
    assert assumption.groups == ((a, b), (c,))
    assert assumption.groups[0][0] is a
    assert len(model.groups) == 2


def test_assume_independent_needs_groups_and_a_reason(a, b, ab) -> None:
    fails("MISSING_DEPENDENCE", lambda: assume_independent((ab,), reason="Invalid."))
    fails(
        "MISSING_DEPENDENCE",
        lambda: assume_independent((bernoulli(a, 0.8), bernoulli(b, 0.6)), reason=" "),
    )
    fails(
        "MISSING_DEPENDENCE",
        lambda: assume_independent((bernoulli(a, 0.8), bernoulli(b, 0.6)), reason=""),
    )
    fails(
        "MISSING_DEPENDENCE",
        lambda: assume_independent(
            (bernoulli(a, 0.8), bernoulli(b, 0.6)),
            reason=7,  # type: ignore[arg-type]
        ),
    )


def test_assume_independent_rejects_overlaps_and_mixed_scopes(a, ab) -> None:
    fails(
        "OVERLAPPING_VARIABLES",
        lambda: assume_independent((ab, bernoulli(a, 0.8)), reason="Invalid."),
    )
    other = create_scope(state_id="ticket:42", revision="4").boolean("urgent")
    other_model = bernoulli(other, 0.5)
    fails(
        "SCOPE_MISMATCH",
        lambda: assume_independent((ab, other_model), reason="Invalid."),
    )


def test_assume_independent_rejects_non_distribution_groups(a, b) -> None:
    with pytest.raises(TypeError):
        assume_independent(
            (bernoulli(a, 0.5), "bernoulli(b, 0.5)"),  # type: ignore[arg-type]
            reason="Invalid.",
        )
    with pytest.raises(TypeError):
        assume_independent(
            (bernoulli(a, 0.5), None),  # type: ignore[arg-type]
            reason="Invalid.",
        )


def test_records_are_immutable(a) -> None:
    distribution = bernoulli(a, 0.5)
    with pytest.raises(FrozenInstanceError):
        distribution.rows = ()  # type: ignore[misc]
    with pytest.raises(FrozenInstanceError):
        distribution.provenance = Provenance(source="x")  # type: ignore[misc]
    with pytest.raises(FrozenInstanceError):
        distribution.rows[0].probability = 0.9  # type: ignore[misc]


@pytest.mark.parametrize("probability", [10**400, -(10**400)])
def test_large_int_probabilities_have_a_domain_error(a, probability) -> None:
    fails("INVALID_DISTRIBUTION", lambda: bernoulli(a, probability))
    fails(
        "INVALID_DISTRIBUTION",
        lambda: joint(
            (a,),
            (
                JointRow(values=(False,), probability=probability),
                JointRow(values=(True,), probability=0.5),
            ),
        ),
    )


def test_direct_joint_construction_validates_and_normalizes(a) -> None:
    fails(
        "INVALID_DISTRIBUTION",
        lambda: JointDistribution((a,), (JointRow(values=(True,), probability=0.4),)),
    )
    fails(
        "INVALID_DISTRIBUTION",
        lambda: JointDistribution(
            (a,),
            (JointRow(values=(False,), probability=0.4), JointRow(values=(True,), probability=0.4)),
        ),
    )
    model = JointDistribution(
        (a,),
        (
            JointRow(values=(False,), probability=0.4),
            JointRow(values=(True,), probability=0.6000000001),
        ),
    )
    assert evaluate(a, model).probability == pytest.approx(0.6000000001 / 1.0000000001)
    fails("INVALID_DISTRIBUTION", lambda: replace(model, rows=(model.rows[0],)))


def test_direct_joint_construction_copies_inputs(a) -> None:
    variables = [a]
    values = [True]
    rows = [JointRow(values=(False,), probability=0.2), JointRow(values=values, probability=0.8)]  # type: ignore[arg-type]
    model = JointDistribution(variables, rows)  # type: ignore[arg-type]
    variables.clear()
    values[0] = False
    rows.clear()
    assert model.variables == (a,)
    assert evaluate(a, model).probability == pytest.approx(0.8)


def test_direct_independent_construction_requires_matching_assumptions(a, b) -> None:
    groups = (bernoulli(a, 0.8), bernoulli(b, 0.6))
    fails("MISSING_DEPENDENCE", lambda: IndependentModel(groups, ()))
    fails(
        "MISSING_DEPENDENCE",
        lambda: IndependenceAssumption(groups=((a,), (b,)), reason=" "),
    )
    mismatch = IndependenceAssumption(groups=((b,), (a,)), reason="Test.")
    fails("MISSING_DEPENDENCE", lambda: IndependentModel(groups, (mismatch,)))
    assumption = IndependenceAssumption(groups=((a,), (b,)), reason="Test.")
    model = IndependentModel(groups, (assumption,))
    assert model.assumptions[0].reason == "Test."
    fails("MISSING_DEPENDENCE", lambda: replace(model, assumptions=()))
    fails("OVERLAPPING_VARIABLES", lambda: replace(model, groups=(groups[0], groups[0])))
    other = create_scope(state_id="other", revision="1").boolean("other")
    fails("SCOPE_MISMATCH", lambda: replace(model, groups=(groups[0], bernoulli(other, 0.5))))


def test_direct_independent_construction_copies_inputs(a, b) -> None:
    variables = [[a], [b]]
    assumption = IndependenceAssumption(groups=variables, reason="Test.")  # type: ignore[arg-type]
    groups = [bernoulli(a, 0.8), bernoulli(b, 0.6)]
    assumptions = [assumption]
    model = IndependentModel(groups, assumptions)  # type: ignore[arg-type]
    variables[0].clear()
    groups.clear()
    assumptions.clear()
    assert model.assumptions[0].groups == ((a,), (b,))
    assert len(model.groups) == 2
