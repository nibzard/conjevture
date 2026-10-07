"""Converters for Jev Noul and Choice answers."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, TypeGuard, TypeVar

from .distribution import JointDistribution, JointRow, Provenance, bernoulli, joint
from .errors import ConjevtureError
from .scope import Value, Variable

_LabelT = TypeVar("_LabelT", bound=str)


@dataclass(frozen=True)
class JevProvenance:
    """Optional provenance fields for Jev converters.

    The converters set ``source="jev"`` themselves, so this record omits it.
    """

    model: str | None = None
    question_id: str | None = None
    request_id: str | None = None


def from_noul(
    variable: Variable[bool],
    answer: Mapping[str, Any],
    *,
    provenance: JevProvenance | None = None,
) -> JointDistribution:
    """Convert a Noul answer without creating dependence assumptions."""
    noul = (
        answer.get("noul") if isinstance(answer, Mapping) and answer.get("type") == "noul" else None
    )
    if not _is_number(noul):
        raise ConjevtureError(
            "INVALID_JEV_ANSWER", "Expected a Noul answer with a numeric noul field."
        )
    return bernoulli(variable, noul, provenance=_jev_provenance(provenance))


def from_choice(
    variable: Variable[_LabelT],
    answer: Mapping[str, Any],
    *,
    provenance: JevProvenance | None = None,
) -> JointDistribution:
    """Preserve all Choice probabilities; the selected answer and confidence are unused."""
    probabilities = _choice_probabilities(answer, variable.domain)
    return joint(
        (variable,),
        tuple(
            JointRow(values=(value,), probability=probabilities[value]) for value in variable.domain
        ),
        provenance=_jev_provenance(provenance),
    )


def from_joint_choice(
    variables: Sequence[Variable[Any]],
    mapping: Mapping[str, Sequence[Value]],
    answer: Mapping[str, Any],
    *,
    provenance: JevProvenance | None = None,
) -> JointDistribution:
    """Map Choice labels to complete assignments, one label per possible world."""
    probabilities = _choice_probabilities(answer, tuple(mapping))
    rows = tuple(
        JointRow(values=tuple(values), probability=probabilities[label])
        for label, values in mapping.items()
    )
    return joint(variables, rows, provenance=_jev_provenance(provenance))


def _choice_probabilities(
    answer: Mapping[str, Any],
    labels: Sequence[str],
) -> Mapping[str, int | float]:
    probabilities = answer.get("probabilities") if isinstance(answer, Mapping) else None
    if (
        not isinstance(answer, Mapping)
        or answer.get("type") != "choice"
        or not isinstance(probabilities, Mapping)
    ):
        raise ConjevtureError(
            "INVALID_JEV_ANSWER",
            "Expected a Choice answer with a probabilities object.",
        )
    if len(probabilities) != len(labels) or any(label not in probabilities for label in labels):
        raise ConjevtureError(
            "INVALID_JEV_ANSWER",
            "Choice probability keys must match the declared labels exactly.",
        )
    for value in probabilities.values():
        if not _is_number(value):
            raise ConjevtureError("INVALID_JEV_ANSWER", "Choice probabilities must be numbers.")
    return probabilities


def _jev_provenance(provenance: JevProvenance | None) -> Provenance:
    return Provenance(
        source="jev",
        model=None if provenance is None else provenance.model,
        question_id=None if provenance is None else provenance.question_id,
        request_id=None if provenance is None else provenance.request_id,
    )


def _is_number(value: object) -> TypeGuard[int | float]:
    # bool is a subclass of int, so exclude it explicitly.
    return isinstance(value, (int, float)) and not isinstance(value, bool)
