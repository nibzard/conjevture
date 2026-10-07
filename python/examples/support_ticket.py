"""Support-ticket priority example with illustrative values."""

from conjevture import (
    Evaluation,
    JointRow,
    and_,
    assume_independent,
    bernoulli,
    create_scope,
    evaluate,
    joint,
    not_,
    or_,
)


def priority_evaluation() -> Evaluation:
    """Return the evaluation of the priority rule."""
    scope = create_scope(state_id="ticket:42", revision="3")
    urgent = scope.boolean("urgent")
    repeat = scope.boolean("repeat")
    resolved = scope.boolean("resolved")

    # Illustrative values, not measured Jev predictions.
    urgency_and_repeat = joint(
        (urgent, repeat),
        (
            JointRow(values=(False, False), probability=0.10),
            JointRow(values=(True, False), probability=0.30),
            JointRow(values=(False, True), probability=0.10),
            JointRow(values=(True, True), probability=0.50),
        ),
    )
    model = assume_independent(
        (urgency_and_repeat, bernoulli(resolved, 0.10)),
        reason="For this example, resolution is independent of urgency and repetition.",
    )
    priority = and_(or_(urgent, repeat), not_(resolved))
    return evaluate(priority, model)


def main() -> float:
    """Print the decision and return the priority probability."""
    result = priority_evaluation()
    print(f"Probability of priority: {result.probability:.2f}")
    reason = result.assumptions[0].reason if result.assumptions else ""
    print(f"Assumption: {reason}")
    return result.probability


if __name__ == "__main__":
    main()
