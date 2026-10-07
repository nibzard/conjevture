"""Scope identity, variable redeclaration, and domain validation."""

from collections.abc import Callable

import pytest

from conjevture import ConjevtureError, Scope, ScopeInfo, create_scope


def fails(code: str, action: Callable[[], object]) -> None:
    with pytest.raises(ConjevtureError) as info:
        action()
    assert info.value.code == code


@pytest.fixture
def scope():
    return create_scope(state_id="ticket:42", revision="3")


def test_repeated_declaration_returns_the_same_variable(scope) -> None:
    variable = scope.boolean("urgent")
    assert scope.boolean("urgent") is variable
    assert variable.name == "urgent"
    assert variable.domain == (False, True)


def test_reordered_domain_returns_the_original_variable(scope) -> None:
    route = scope.categorical("route", ["billing", "technical"])
    again = scope.categorical("route", ["technical", "billing"])
    assert again is route
    assert route.domain == ("billing", "technical")
    assert route.domain != ("technical", "billing")


def test_conflicting_domains_fail(scope) -> None:
    scope.boolean("urgent")
    route = scope.categorical("route", ["billing", "technical"])
    assert route.domain == ("billing", "technical")
    fails("INVALID_VARIABLE", lambda: scope.categorical("urgent", ["yes", "no"]))
    fails("INVALID_VARIABLE", lambda: scope.categorical("route", ["billing", "other"]))
    fails("INVALID_VARIABLE", lambda: scope.boolean("route"))


def test_invalid_names_and_labels_fail(scope) -> None:
    fails("INVALID_VARIABLE", lambda: scope.boolean(" "))
    fails("INVALID_VARIABLE", lambda: scope.boolean(""))
    fails("INVALID_VARIABLE", lambda: scope.categorical("empty", []))
    fails("INVALID_VARIABLE", lambda: scope.categorical("duplicates", ["a", "a"]))
    fails("INVALID_VARIABLE", lambda: scope.categorical("blank", [" "]))
    fails("INVALID_VARIABLE", lambda: scope.categorical("numbers", ["a", 1]))


def test_scope_requires_nonempty_metadata() -> None:
    fails("INVALID_VARIABLE", lambda: create_scope(state_id="", revision="1"))
    fails("INVALID_VARIABLE", lambda: create_scope(state_id="ticket", revision=" "))


def test_scope_info_records_metadata(scope) -> None:
    assert scope.info.state_id == "ticket:42"
    assert scope.info.revision == "3"
    assert scope.boolean("urgent").scope is scope.info


def test_distinct_scopes_stay_distinct_with_matching_metadata() -> None:
    one = create_scope(state_id="ticket:42", revision="3")
    two = create_scope(state_id="ticket:42", revision="3")
    assert one is not two
    assert one.info is not two.info
    assert one.info.state_id == two.info.state_id
    assert one.info.revision == two.info.revision
    assert one.boolean("urgent") is not two.boolean("urgent")
    assert one.boolean("urgent").scope is not two.boolean("urgent").scope


def test_variables_use_identity_equality(scope) -> None:
    a = scope.boolean("urgent")
    other_scope = create_scope(state_id="ticket:42", revision="3")
    assert a == a
    assert a != scope.boolean("repeat")
    assert a != other_scope.boolean("urgent")
    assert len({a, a, scope.boolean("urgent")}) == 1
    assert hash(a) == hash(a)


def test_variables_reject_truth_testing(scope) -> None:
    with pytest.raises(TypeError, match="and_"):
        bool(scope.boolean("urgent"))


def test_scope_identity_cannot_be_reassigned(scope: Scope) -> None:
    original = scope.info
    existing = scope.boolean("existing")
    other = create_scope(state_id="other", revision="2")
    with pytest.raises(AttributeError):
        scope.info = other.info  # type: ignore[misc]
    with pytest.raises(AttributeError):
        scope.info = ScopeInfo(state_id="ticket:42", revision="4")  # type: ignore[misc]
    assert scope.info is original
    assert scope.boolean("existing") is existing
    assert scope.boolean("new").scope is original
