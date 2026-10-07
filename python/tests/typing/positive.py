"""Positive type-check cases. mypy must accept every line.

This module is only type-checked; it is never executed. Calls marked as
runtime-authoritative type-check loosely on purpose: joint() validates row
positions and categorical membership at runtime, which keeps arbitrary tuple
inference out of the release requirements.
"""

from typing import Literal

from conjevture import (
    JointRow,
    Provenance,
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


def check_positive() -> None:
    scope = create_scope(state_id="ticket", revision="1")
    flag = scope.boolean("flag")
    route = scope.categorical("route", ["billing", "technical"])

    # An explicitly annotated Literal domain keeps the labels in the type.
    labels: tuple[Literal["billing", "technical"], ...] = ("billing", "technical")
    literal_route = scope.categorical("route", labels)

    eq(route, "billing")
    eq(literal_route, "billing")
    eq(flag, True)
    and_(flag, eq(route, "technical"))
    or_(flag, not_(flag))
    xor(flag, flag)
    constant(True)

    joint(
        [flag, route],
        [
            JointRow(values=(False, "billing"), probability=0.25),
            JointRow(values=(False, "technical"), probability=0.25),
            JointRow(values=(True, "billing"), probability=0.25),
            JointRow(values=(True, "technical"), probability=0.25),
        ],
    )
    bernoulli(flag, 0.5)
    bernoulli(flag, 1)

    other = scope.boolean("other")
    model = assume_independent(
        (bernoulli(flag, 0.5), bernoulli(other, 0.5)),
        reason="Example reason.",
    )
    evaluate(flag, model)
    evaluate(and_(flag, not_(flag)), None)

    result = evaluate(and_(flag, flag), bernoulli(flag, 0.5), max_worlds=100)
    probability: float = result.probability
    worlds: int = result.worlds
    method: str = result.method
    reasons = [assumption.reason for assumption in result.assumptions]
    provenances = [source.provenance for source in result.sources]
    variables = [variable for source in result.sources for variable in source.variables]
    assert probability and worlds and method and reasons and provenances and variables

    documented = Provenance(source="manual", question_id="route")
    joint([flag], [JointRow(values=(False,), probability=0.5)], provenance=documented)

    from_noul(flag, {"type": "noul", "noul": 0.5})
    from_noul(flag, {"type": "noul", "noul": 0.5}, provenance=JevProvenance(question_id="refund"))
    from_choice(route, {"type": "choice", "probabilities": {"billing": 0.5, "technical": 0.5}})
    from_choice(
        literal_route, {"type": "choice", "probabilities": {"billing": 0.5, "technical": 0.5}}
    )
    from_joint_choice(
        [flag, route],
        {"both": [True, "billing"]},
        {"type": "choice", "probabilities": {"both": 1.0}},
    )
    # Runtime validation is authoritative here: joint() rejects the widened
    # label when these calls execute.
    from_joint_choice(
        [route], {"sales": ["sales"]}, {"type": "choice", "probabilities": {"sales": 1.0}}
    )
    joint([route], [JointRow(values=("sales",), probability=1.0)])
