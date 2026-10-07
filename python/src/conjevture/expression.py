"""Boolean expression nodes and the gate constructors."""

from dataclasses import dataclass
from typing import Any, Generic, TypeAlias, TypeVar, Union

from .errors import ConjevtureError
from .scope import Value, Variable, _matches_domain

_EqT = TypeVar("_EqT", bound=Value)

_BOOL_ERROR = (
    "A Conjevture expression is not a Boolean value. "
    "Combine expressions with and_(), or_(), not_(), and xor_()."
)


@dataclass(frozen=True, eq=False)
class Constant:
    """A fixed Boolean value."""

    value: bool

    def __bool__(self) -> bool:
        raise TypeError(_BOOL_ERROR)


@dataclass(frozen=True, eq=False)
class Not:
    """The negation of one operand."""

    operand: "Expression"

    def __bool__(self) -> bool:
        raise TypeError(_BOOL_ERROR)


@dataclass(frozen=True, eq=False)
class And:
    """The conjunction of two operands."""

    left: "Expression"
    right: "Expression"

    def __bool__(self) -> bool:
        raise TypeError(_BOOL_ERROR)


@dataclass(frozen=True, eq=False)
class Or:
    """The disjunction of two operands."""

    left: "Expression"
    right: "Expression"

    def __bool__(self) -> bool:
        raise TypeError(_BOOL_ERROR)


@dataclass(frozen=True, eq=False)
class Xor:
    """The exclusive disjunction of two operands."""

    left: "Expression"
    right: "Expression"

    def __bool__(self) -> bool:
        raise TypeError(_BOOL_ERROR)


@dataclass(frozen=True, eq=False)
class Equals(Generic[_EqT]):
    """The comparison of one variable with a member of its domain."""

    variable: Variable[_EqT]
    value: _EqT

    def __bool__(self) -> bool:
        raise TypeError(_BOOL_ERROR)


Expression: TypeAlias = Union["Variable[bool]", Constant, Not, And, Or, Xor, "Equals[Any]"]

_NODES = (Constant, Not, And, Or, Xor, Equals)


def is_expression(node: object) -> bool:
    """Report whether the node is a variable or an expression node."""
    return isinstance(node, (Variable, *_NODES))


def _require_expression(node: object, role: str) -> None:
    if not is_expression(node):
        raise TypeError(
            f"{role} must be a Conjevture expression; received {type(node).__name__}. "
            "Build expressions with and_(), or_(), not_(), xor_(), eq(), and constant()."
        )


def constant(value: bool) -> Constant:
    """Return a fixed Boolean value."""
    if not isinstance(value, bool):
        raise TypeError("constant() needs a bool; use eq() for domain values.")
    return Constant(value=value)


def not_(operand: Expression) -> Not:
    """Negate one expression."""
    _require_expression(operand, "not_() operand")
    return Not(operand=operand)


def and_(left: Expression, right: Expression) -> And:
    """Conjoin two expressions."""
    _require_expression(left, "and_() left operand")
    _require_expression(right, "and_() right operand")
    return And(left=left, right=right)


def or_(left: Expression, right: Expression) -> Or:
    """Disjoin two expressions."""
    _require_expression(left, "or_() left operand")
    _require_expression(right, "or_() right operand")
    return Or(left=left, right=right)


def xor(left: Expression, right: Expression) -> Xor:
    """Exclusive-disjoin two expressions."""
    _require_expression(left, "xor() left operand")
    _require_expression(right, "xor() right operand")
    return Xor(left=left, right=right)


def eq(variable: Variable[_EqT], value: _EqT) -> Equals[_EqT]:
    """Compare a variable with one member of its domain."""
    if not isinstance(variable, Variable):
        raise TypeError("eq() needs a Conjevture variable.")
    if not _matches_domain(value, variable.domain):
        raise ConjevtureError(
            "INVALID_VARIABLE",
            f'Value "{value}" is outside the domain of "{variable.name}".',
        )
    return Equals(variable=variable, value=value)
