"""Conjevture: exact Boolean logic over uncertain variables.

Import the public API from :mod:`conjevture` and the Jev converters from
:mod:`conjevture.jev`.
"""

from .distribution import (
    IndependenceAssumption,
    IndependentModel,
    JointDistribution,
    JointRow,
    ProbabilityModel,
    Provenance,
    assume_independent,
    bernoulli,
    joint,
)
from .errors import ConjevtureError, ErrorCode
from .evaluate import DEFAULT_MAX_WORLDS, Evaluation, EvaluationSource, evaluate
from .expression import (
    And,
    Constant,
    Equals,
    Expression,
    Not,
    Or,
    Xor,
    and_,
    constant,
    eq,
    not_,
    or_,
    xor,
)
from .scope import Scope, ScopeInfo, Value, Variable, create_scope

__version__ = "0.1.0"

__all__ = [
    "DEFAULT_MAX_WORLDS",
    "And",
    "Constant",
    "ConjevtureError",
    "Equals",
    "ErrorCode",
    "Evaluation",
    "EvaluationSource",
    "Expression",
    "IndependenceAssumption",
    "IndependentModel",
    "JointDistribution",
    "JointRow",
    "Not",
    "Or",
    "ProbabilityModel",
    "Provenance",
    "Scope",
    "ScopeInfo",
    "Value",
    "Variable",
    "Xor",
    "and_",
    "assume_independent",
    "bernoulli",
    "constant",
    "create_scope",
    "eq",
    "evaluate",
    "joint",
    "not_",
    "or_",
    "xor",
]
