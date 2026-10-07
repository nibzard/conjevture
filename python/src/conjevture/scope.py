"""Scopes, variable identity, and typed domains."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

from .errors import ConjevtureError

Value = bool | str

_DeclaredT = TypeVar("_DeclaredT", bound=Value)
_LabelT = TypeVar("_LabelT", bound=str)


@dataclass(frozen=True, eq=False)
class ScopeInfo:
    """Metadata for one state snapshot.

    Identity is the record object, so each scope owns a distinct ``ScopeInfo``
    even when its metadata matches another scope.
    """

    state_id: str
    revision: str


@dataclass(frozen=True, eq=False)
class Variable(Generic[_DeclaredT]):
    """A typed uncertain proposition.

    Identity is the variable object, not its name or domain. Two declarations
    of one name inside a scope return the same object.
    """

    name: str
    domain: tuple[_DeclaredT, ...]
    scope: ScopeInfo

    def __bool__(self) -> bool:
        raise TypeError(
            "A Variable is not a Boolean value. "
            "Build expressions with and_(), or_(), not_(), xor_(), and eq()."
        )


class Scope:
    """One scope per immutable state snapshot."""

    __slots__ = ("_info", "_variables")

    def __init__(self, state_id: str, revision: str) -> None:
        if not _nonempty(state_id) or not _nonempty(revision):
            raise ConjevtureError(
                "INVALID_VARIABLE", "A scope needs a nonempty state_id and revision."
            )
        self._info = ScopeInfo(state_id=state_id, revision=revision)
        self._variables: dict[str, Variable[Any]] = {}

    @property
    def info(self) -> ScopeInfo:
        """Return the fixed metadata and identity token for this scope."""
        return self._info

    def boolean(self, name: str) -> Variable[bool]:
        """Return the Boolean variable declared under this name."""
        return self._declare(name, (False, True))

    def categorical(self, name: str, labels: Sequence[_LabelT]) -> Variable[_LabelT]:
        """Return a variable with a finite string domain."""
        if not all(_nonempty(label) for label in labels):
            raise ConjevtureError(
                "INVALID_VARIABLE", "Categorical labels must be nonempty strings."
            )
        return self._declare(name, tuple(labels))

    def _declare(self, name: str, domain: tuple[_DeclaredT, ...]) -> Variable[_DeclaredT]:
        if not _nonempty(name) or not domain or len(set(domain)) != len(domain):
            raise ConjevtureError(
                "INVALID_VARIABLE",
                "A variable needs a name and a nonempty domain without duplicates.",
            )
        existing = self._variables.get(name)
        if existing is not None:
            if len(existing.domain) != len(domain) or any(
                value not in existing.domain for value in domain
            ):
                raise ConjevtureError(
                    "INVALID_VARIABLE",
                    f'Variable "{name}" already has a different domain.',
                )
            # The domain check establishes the same value type for this declaration.
            return existing
        variable: Variable[_DeclaredT] = Variable(name=name, domain=domain, scope=self.info)
        self._variables[name] = variable
        return variable


def create_scope(*, state_id: str, revision: str) -> Scope:
    """Create one scope per immutable state snapshot."""
    return Scope(state_id=state_id, revision=revision)


def _nonempty(value: object) -> bool:
    return isinstance(value, str) and len(value.strip()) > 0


def _matches_domain(value: object, domain: tuple[object, ...]) -> bool:
    """Report exact domain membership.

    Python treats ``True == 1``, so membership also requires the same built-in
    type: ``1`` never matches ``True`` and ``0`` never matches ``False``.
    """
    return any(type(member) is type(value) and member == value for member in domain)
