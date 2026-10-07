"""Probability models: joint tables, Bernoulli variables, and independence."""

import math
from collections.abc import Sequence
from dataclasses import dataclass, replace
from typing import Any

from ._sum import Sum
from .errors import ConjevtureError
from .scope import Value, Variable, _matches_domain

_NORMALIZATION_TOLERANCE = 1e-9


@dataclass(frozen=True)
class Provenance:
    """Where a distribution came from."""

    source: str
    model: str | None = None
    question_id: str | None = None
    request_id: str | None = None


@dataclass(frozen=True)
class JointRow:
    """One assignment and its probability."""

    values: tuple[Value, ...]
    probability: float


@dataclass(frozen=True)
class JointDistribution:
    """A complete joint table over disjoint variables."""

    variables: tuple[Variable[Any], ...]
    rows: tuple[JointRow, ...]
    provenance: Provenance | None = None

    def __post_init__(self) -> None:
        variables, rows, provenance = _prepare_joint(self.variables, self.rows, self.provenance)
        object.__setattr__(self, "variables", variables)
        object.__setattr__(self, "rows", rows)
        object.__setattr__(self, "provenance", provenance)


@dataclass(frozen=True)
class IndependenceAssumption:
    """A recorded mutual-independence declaration."""

    groups: tuple[tuple[Variable[Any], ...], ...]
    reason: str

    def __post_init__(self) -> None:
        groups = tuple(tuple(group) for group in self.groups)
        if (
            len(groups) < 2
            or any(not group for group in groups)
            or not isinstance(self.reason, str)
            or not self.reason.strip()
        ):
            raise ConjevtureError(
                "MISSING_DEPENDENCE",
                "An independence declaration needs at least two groups and a nonempty reason.",
            )
        _validate_variables(tuple(variable for group in groups for variable in group))
        object.__setattr__(self, "groups", groups)


@dataclass(frozen=True)
class IndependentModel:
    """Groups declared mutually independent, conditioned on one state."""

    groups: tuple[JointDistribution, ...]
    assumptions: tuple[IndependenceAssumption, ...]

    def __post_init__(self) -> None:
        groups = tuple(self.groups)
        for group in groups:
            if not isinstance(group, JointDistribution):
                raise TypeError("An independent model needs JointDistribution groups.")
        if len(groups) < 2:
            raise ConjevtureError(
                "MISSING_DEPENDENCE", "An independent model needs at least two groups."
            )
        _validate_variables(tuple(variable for group in groups for variable in group.variables))
        assumptions = tuple(self.assumptions)
        if (
            len(assumptions) != 1
            or not isinstance(assumptions[0], IndependenceAssumption)
            or assumptions[0].groups != tuple(group.variables for group in groups)
        ):
            raise ConjevtureError(
                "MISSING_DEPENDENCE",
                "An independent model needs one independence declaration "
                "covering its groups in order.",
            )
        object.__setattr__(self, "groups", groups)
        object.__setattr__(self, "assumptions", assumptions)


ProbabilityModel = JointDistribution | IndependentModel


def joint(
    variables: Sequence[Variable[Any]],
    rows: Sequence[JointRow],
    *,
    provenance: Provenance | None = None,
) -> JointDistribution:
    """Supply every assignment exactly once, including zero-probability assignments."""
    return JointDistribution(variables=tuple(variables), rows=tuple(rows), provenance=provenance)


def _prepare_joint(
    variables: Sequence[Variable[Any]],
    rows: Sequence[JointRow],
    provenance: Provenance | None,
) -> tuple[tuple[Variable[Any], ...], tuple[JointRow, ...], Provenance | None]:
    variables_tuple = tuple(variables)
    rows_list = list(rows)
    for row in rows_list:
        if not isinstance(row, JointRow):
            raise TypeError(
                f"joint() rows must be JointRow records; received {type(row).__name__} for {row!r}."
            )
    _validate_variables(variables_tuple)
    expected = 1
    for variable in variables_tuple:
        expected *= len(variable.domain)
    if len(rows_list) != expected:
        raise ConjevtureError(
            "INVALID_DISTRIBUTION",
            f"Expected {expected} rows, one for each possible assignment; "
            f"received {len(rows_list)}.",
        )

    seen: set[tuple[object, ...]] = set()
    total = Sum()
    for row in rows_list:
        if len(row.values) != len(variables_tuple) or any(
            not _matches_domain(value, variable.domain)
            for variable, value in zip(variables_tuple, row.values, strict=False)
        ):
            raise ConjevtureError(
                "INVALID_DISTRIBUTION",
                "Every row must assign one valid value to each variable.",
            )
        key = tuple(row.values)
        if key in seen:
            raise ConjevtureError(
                "INVALID_DISTRIBUTION",
                "Joint distributions cannot contain duplicate assignments.",
            )
        seen.add(key)
        _assert_probability(row.probability)
        total.add(row.probability)
    if abs(total.value - 1.0) > _NORMALIZATION_TOLERANCE:
        raise ConjevtureError(
            "INVALID_DISTRIBUTION",
            f"Probabilities must sum to 1; received {total.value}.",
        )

    return (
        variables_tuple,
        tuple(
            JointRow(values=tuple(row.values), probability=row.probability / total.value)
            for row in rows_list
        ),
        None if provenance is None else replace(provenance),
    )


def bernoulli(
    variable: Variable[bool],
    probability: float,
    *,
    provenance: Provenance | None = None,
) -> JointDistribution:
    """Construct the two Boolean rows for one variable."""
    if not isinstance(variable, Variable):
        raise TypeError("bernoulli() needs a Conjevture variable.")
    _assert_probability(probability)
    return joint(
        (variable,),
        (
            JointRow(values=(False,), probability=1.0 - probability),
            JointRow(values=(True,), probability=probability),
        ),
        provenance=provenance,
    )


def assume_independent(
    groups: Sequence[JointDistribution],
    *,
    reason: str,
) -> IndependentModel:
    """Declare mutual independence between disjoint groups, conditioned on this state."""
    groups_tuple = tuple(groups)
    for group in groups_tuple:
        if not isinstance(group, JointDistribution):
            raise TypeError(
                "assume_independent() needs JointDistribution groups; "
                f"received {type(group).__name__}."
            )
    if len(groups_tuple) < 2 or not isinstance(reason, str) or not reason.strip():
        raise ConjevtureError(
            "MISSING_DEPENDENCE",
            "An independence declaration needs at least two groups and a nonempty reason.",
        )
    _validate_variables([variable for group in groups_tuple for variable in group.variables])
    assumption = IndependenceAssumption(
        groups=tuple(group.variables for group in groups_tuple),
        reason=reason,
    )
    return IndependentModel(groups=groups_tuple, assumptions=(assumption,))


def _assert_probability(value: float) -> None:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not 0 <= value <= 1
        or not math.isfinite(value)
    ):
        raise ConjevtureError(
            "INVALID_DISTRIBUTION",
            "Probabilities must be finite int or float values between 0 and 1.",
        )


def _validate_variables(variables: Sequence[Variable[Any]]) -> None:
    if not all(isinstance(variable, Variable) for variable in variables):
        raise TypeError("A distribution needs Conjevture variables.")
    if not variables:
        raise ConjevtureError(
            "INVALID_DISTRIBUTION",
            "A distribution needs at least one variable.",
        )
    if len(set(variables)) != len(variables):
        raise ConjevtureError(
            "OVERLAPPING_VARIABLES",
            "Each variable must belong to exactly one distribution in a model.",
        )
    scope = variables[0].scope
    if any(variable.scope is not scope for variable in variables):
        raise ConjevtureError(
            "SCOPE_MISMATCH",
            "All variables in a model must belong to the same scope.",
        )
