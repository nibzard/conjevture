"""Negative type-check cases. mypy must report an error on each marked line.

This module is only type-checked; it is never executed.
"""

from typing import Literal

from conjevture import (
    and_,
    assume_independent,
    bernoulli,
    constant,
    create_scope,
    eq,
    evaluate,
    not_,
)
from conjevture.jev import from_choice, from_noul


def check_negative() -> None:
    scope = create_scope(state_id="ticket", revision="1")
    flag = scope.boolean("flag")
    route = scope.categorical("route", ["billing", "technical"])
    labels: tuple[Literal["billing", "technical"], ...] = ("billing", "technical")
    literal_route = scope.categorical("route", labels)

    eq(literal_route, "sales")  # expect-error Equality cannot widen the declared labels.
    and_(flag, route)  # expect-error Gates need Boolean expressions.
    and_(0.8, flag)  # expect-error Probabilities are not expressions.
    not_(0)  # expect-error Gates need expressions.
    eq(flag, 1)  # expect-error 1 is not a Boolean domain value.
    constant(1)  # expect-error Constants need a bool.
    bernoulli(route, 0.5)  # expect-error A categorical variable is not a Boolean variable.
    from_noul(route, {"type": "noul", "noul": 0.5})  # expect-error Noul binds a Boolean variable.
    evaluate(flag, [bernoulli(flag, 0.5)])  # expect-error Evaluation needs a model, not a list.
    evaluate("urgent")  # expect-error Strings are not expressions.
    assume_independent([bernoulli(flag, 0.5)])  # expect-error Independence needs a reason.

    from_choice(flag, {"type": "choice"})  # expect-error Choice binds a string variable.
    scope.info = scope.info  # expect-error Scope identity cannot be reassigned.
