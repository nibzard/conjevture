"""Routing example with a fixed Choice answer."""

from conjevture import and_, create_scope, eq, evaluate, or_
from conjevture.jev import JevProvenance, from_choice


def routing_decisions() -> tuple[float, float]:
    """Return the supported-route and impossible-route probabilities."""
    scope = create_scope(state_id="ticket:42", revision="3")
    route = scope.categorical("route", ["billing", "technical", "other"])

    # Replace this fixture with a Choice answer from your Jev client.
    model = from_choice(
        route,
        {
            "type": "choice",
            "choice": "billing",
            "confidence": 0.4,
            "probabilities": {"billing": 0.6, "technical": 0.3, "other": 0.1},
        },
        provenance=JevProvenance(model="fixture-model", question_id="route"),
    )

    handled = or_(eq(route, "billing"), eq(route, "technical"))
    impossible = and_(eq(route, "billing"), eq(route, "technical"))
    return evaluate(handled, model).probability, evaluate(impossible, model).probability


def main() -> tuple[float, float]:
    """Print both decisions and return their probabilities."""
    handled, impossible = routing_decisions()
    print(f"Probability of a supported route: {handled:.2f}")
    print(f"Probability of both routes: {impossible:g}")
    return handled, impossible


if __name__ == "__main__":
    main()
