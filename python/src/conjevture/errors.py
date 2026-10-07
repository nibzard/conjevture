"""Error codes and the error type raised for model and input problems."""

from typing import Literal

ErrorCode = Literal[
    "INVALID_VARIABLE",
    "SCOPE_MISMATCH",
    "INVALID_DISTRIBUTION",
    "OVERLAPPING_VARIABLES",
    "MISSING_VARIABLE",
    "MISSING_DEPENDENCE",
    "WORLD_LIMIT_EXCEEDED",
    "INVALID_JEV_ANSWER",
]


class ConjevtureError(Exception):
    """A model or input error with a stable code for callers."""

    def __init__(self, code: ErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code
