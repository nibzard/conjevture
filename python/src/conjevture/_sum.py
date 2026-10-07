"""Compensated summation reduces rounding error when many weights are added."""


class Sum:
    """A Kahan-compensated running total."""

    __slots__ = ("value", "_correction")

    def __init__(self) -> None:
        self.value = 0.0
        self._correction = 0.0

    def add(self, value: float) -> None:
        adjusted = value - self._correction
        next_value = self.value + adjusted
        self._correction = (next_value - self.value) - adjusted
        self.value = next_value
