"""Exact evaluation by enumerating the worlds of a probability model."""

from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any, Literal

from ._sum import Sum
from .distribution import (
    IndependenceAssumption,
    IndependentModel,
    JointDistribution,
    JointRow,
    ProbabilityModel,
    Provenance,
)
from .errors import ConjevtureError
from .expression import And, Constant, Equals, Expression, Not, Or, Xor, is_expression
from .scope import Value, Variable

DEFAULT_MAX_WORLDS = 65_536
_MAX_SAFE_INTEGER = 2**53 - 1


@dataclass(frozen=True)
class EvaluationSource:
    """The variables and provenance behind one group of the model."""

    variables: tuple[Variable[Any], ...]
    provenance: Provenance | None = None


@dataclass(frozen=True)
class Evaluation:
    """The result of exact enumeration."""

    probability: float
    method: Literal["enumeration"]
    worlds: int
    assumptions: tuple[IndependenceAssumption, ...]
    sources: tuple[EvaluationSource, ...]


def evaluate(
    expression: Expression,
    model: ProbabilityModel | None = None,
    *,
    max_worlds: int = DEFAULT_MAX_WORLDS,
) -> Evaluation:
    """Evaluate Boolean logic in each world of the supplied probability model."""
    if not is_expression(expression):
        raise TypeError(
            f"evaluate() needs a Conjevture expression; received {type(expression).__name__}."
        )
    if model is not None and not isinstance(model, (JointDistribution, IndependentModel)):
        raise TypeError(
            "evaluate() needs a JointDistribution, an IndependentModel, or None; "
            f"received {type(model).__name__}."
        )
    groups: tuple[JointDistribution, ...] = (
        () if model is None else (model,) if isinstance(model, JointDistribution) else model.groups
    )
    needed = _collect_variables(expression)
    available = {variable for group in groups for variable in group.variables}
    if available:
        scope = next(iter(available)).scope
    elif needed:
        scope = next(iter(needed)).scope
    else:
        scope = None

    for variable in needed:
        if variable.scope is not scope:
            raise ConjevtureError(
                "SCOPE_MISMATCH",
                f'Variable "{variable.name}" belongs to a different scope.',
            )
        if variable not in available:
            raise ConjevtureError(
                "MISSING_VARIABLE",
                f'No distribution supplies "{variable.name}". '
                "Supply a joint distribution or explicitly declare independence "
                "between groups.",
            )

    if (
        isinstance(max_worlds, bool)
        or not isinstance(max_worlds, int)
        or max_worlds < 1
        or max_worlds > _MAX_SAFE_INTEGER
    ):
        raise ConjevtureError(
            "WORLD_LIMIT_EXCEEDED",
            "max_worlds must be an integer from 1 through 2**53 - 1.",
        )
    worlds = 1
    for group in groups:
        if len(group.rows) * worlds > max_worlds:
            raise ConjevtureError(
                "WORLD_LIMIT_EXCEEDED",
                f"The model exceeds max_worlds ({max_worlds}). "
                "Use a smaller model or increase the limit.",
            )
        worlds *= len(group.rows)

    total = Sum()
    world: dict[Variable[Any], Value] = {}

    if not groups:
        if _truth(expression, world):
            total.add(1.0)
    else:
        # Keep one iterator and prefix weight per group, without recursion or
        # allocating the Cartesian product of the groups.
        iterators: list[Iterator[JointRow]] = [iter(groups[0].rows)]
        weights = [1.0]
        while iterators:
            index = len(iterators) - 1
            row = next(iterators[-1], None)
            if row is None:
                iterators.pop()
                weights.pop()
                continue
            if row.probability == 0:
                continue
            for variable, value in zip(groups[index].variables, row.values, strict=True):
                world[variable] = value
            weight = weights[-1] * row.probability
            if index + 1 == len(groups):
                if _truth(expression, world):
                    total.add(weight)
            else:
                iterators.append(iter(groups[index + 1].rows))
                weights.append(weight)

    return Evaluation(
        probability=min(1.0, max(0.0, total.value)),
        method="enumeration",
        worlds=worlds,
        assumptions=model.assumptions if isinstance(model, IndependentModel) else (),
        sources=tuple(
            EvaluationSource(variables=group.variables, provenance=group.provenance)
            for group in groups
        ),
    )


def _collect_variables(expression: Expression) -> set[Variable[Any]]:
    result: set[Variable[Any]] = set()
    seen: set[Expression] = set()
    pending: list[Expression] = [expression]
    while pending:
        node = pending.pop()
        if node in seen:
            continue
        seen.add(node)
        if isinstance(node, Variable):
            result.add(node)
        elif isinstance(node, Equals):
            result.add(node.variable)
        elif isinstance(node, Not):
            pending.append(node.operand)
        elif isinstance(node, And | Or | Xor):
            pending.append(node.left)
            pending.append(node.right)
        # Constant nodes contribute no variables.
    return result


def _truth(expression: Expression, world: dict[Variable[Any], Value]) -> bool:
    """Evaluate one expression in one world.

    The traversal keeps an explicit stack, so deeply nested expressions do not
    depend on Python's recursion limit. Each node is computed at most once per
    world, including cached false results.
    """
    cache: dict[Expression, bool] = {}
    stack: list[tuple[Expression, bool]] = [(expression, False)]
    while stack:
        node, expanded = stack.pop()
        if node in cache:
            continue
        if isinstance(node, Variable):
            cache[node] = world[node] is True
            continue
        if isinstance(node, Constant):
            cache[node] = node.value
            continue
        if isinstance(node, Equals):
            cache[node] = world[node.variable] == node.value
            continue
        if not expanded:
            stack.append((node, True))
            if isinstance(node, Not):
                stack.append((node.operand, False))
            else:
                stack.append((node.left, False))
                stack.append((node.right, False))
            continue
        if isinstance(node, Not):
            cache[node] = not cache[node.operand]
        elif isinstance(node, And):
            cache[node] = cache[node.left] and cache[node.right]
        elif isinstance(node, Or):
            cache[node] = cache[node.left] or cache[node.right]
        else:  # Xor
            cache[node] = cache[node.left] != cache[node.right]
    return cache[expression]
