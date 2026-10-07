"""Expression constructors, domain checks, and truth-test rejection."""

import pytest

from conjevture import ConjevtureError, Constant, Equals, Not, and_, constant, eq, not_, or_, xor


@pytest.fixture
def scope():
    from conjevture import create_scope

    return create_scope(state_id="ticket:42", revision="3")


@pytest.fixture
def flag(scope):
    return scope.boolean("urgent")


@pytest.fixture
def route(scope):
    return scope.categorical("route", ["billing", "technical"])


def test_gates_reject_non_expressions(flag) -> None:
    for action in (
        lambda: and_(0.8, flag),  # type: ignore[arg-type]
        lambda: or_(flag, "urgent"),  # type: ignore[arg-type]
        lambda: xor(flag, 3),  # type: ignore[arg-type]
        lambda: not_(None),  # type: ignore[arg-type]
        lambda: and_(flag, [flag]),  # type: ignore[arg-type]
    ):
        with pytest.raises(TypeError, match="expression"):
            action()


def test_constant_requires_a_real_bool() -> None:
    assert constant(True).value is True
    assert constant(False).value is False
    with pytest.raises(TypeError):
        constant(1)  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        constant("true")  # type: ignore[arg-type]


def test_eq_returns_a_node_with_its_fields(flag, route) -> None:
    node = eq(route, "billing")
    assert isinstance(node, Equals)
    assert node.variable is route
    assert node.value == "billing"
    assert eq(flag, True).value is True


def test_eq_rejects_values_outside_the_domain(flag, route) -> None:
    with pytest.raises(ConjevtureError) as info:
        eq(route, "sales")
    assert info.value.code == "INVALID_VARIABLE"
    # bool is a subclass of int, so 1 must not match True.
    with pytest.raises(ConjevtureError) as info:
        eq(flag, 1)
    assert info.value.code == "INVALID_VARIABLE"
    with pytest.raises(ConjevtureError) as info:
        eq(flag, "true")
    assert info.value.code == "INVALID_VARIABLE"


def test_eq_rejects_non_variables(flag) -> None:
    with pytest.raises(TypeError):
        eq("urgent", True)  # type: ignore[arg-type]


def test_gate_nodes_keep_identity_and_two_operands(flag) -> None:
    first = and_(flag, flag)
    second = and_(flag, flag)
    assert first is not second
    assert first.left is flag
    assert first.right is flag
    assert isinstance(first, type(second))
    negated = not_(flag)
    assert isinstance(negated, Not)
    assert negated.operand is flag
    assert isinstance(constant(True), Constant)
    assert len({first, first, second}) == 2


def test_nodes_reject_truth_testing(flag) -> None:
    nodes = [
        and_(flag, flag),
        or_(flag, flag),
        xor(flag, flag),
        not_(flag),
        constant(True),
        eq(flag, True),
    ]
    for node in nodes:
        with pytest.raises(TypeError, match="and_"):
            bool(node)
