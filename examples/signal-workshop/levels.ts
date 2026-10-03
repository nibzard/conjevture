export type GateKind = "AND" | "OR" | "NOT" | "XOR";
export interface Input { id: string; label: string; probability: number }
export interface Gate { id: string; kind: GateKind; x: number; y: number }
export interface Wire { from: string; to: string; port: number }
export interface Circuit { gates: Gate[]; wires: Wire[] }
export interface Level {
  id: string;
  title: string;
  lesson: string;
  sentence: string;
  output: string;
  inputs: Input[];
  inventory: Partial<Record<GateKind, number>>;
  hint: string;
  explanation: string;
  alternatives: [string, string];
  blueprint: Circuit;
  /** A complete joint Choice fixture for the first two inputs. */
  joint?: [number, number, number, number];
}
const gate = (kind: GateKind, id = "g1", x = 430, y = 185): Gate => ({ id, kind, x, y });
const wire = (from: string, to = "g1", port = 0): Wire => ({ from, to, port });
const single = (kind: GateKind, repeated = false): Circuit => ({
  gates: [gate(kind)],
  wires: [wire("A"), ...(kind === "NOT" ? [] : [wire(repeated ? "A" : "B", "g1", 1)]), wire("g1", "out")],
});
const combined = (): Circuit => ({
  gates: [gate("OR", "g1", 300, 85), gate("NOT", "g2", 300, 285), gate("AND", "g3", 590, 185)],
  wires: [wire("A"), wire("B", "g1", 1), wire("C", "g2"), wire("g1", "g3"), wire("g2", "g3", 1), wire("g3", "out")],
});
export const LEVELS: readonly Level[] = [
  {
    id: "two-to-open", title: "Two to open", lesson: "Meet the AND gate", output: "Door opens",
    sentence: "Open the door when the badge is valid AND the visit is scheduled.",
    inputs: [{ id: "A", label: "Valid badge", probability: 0.8 }, { id: "B", label: "Scheduled visit", probability: 0.6 }],
    inventory: { AND: 1 }, blueprint: single("AND"),
    hint: "Add an AND gate. Connect A and B to its two inputs. Connect its output to the door.",
    explanation: "AND needs both inputs. With independent signals, 80% × 60% gives a 48% chance of opening.",
    alternatives: ["Open the door when either condition is true, including both.", "Open the door when exactly one condition is true."],
  },
  {
    id: "another-way", title: "Another way in", lesson: "Add an alternative", output: "Door opens",
    sentence: "Open the door when the badge is valid OR the host approves, including when both are true.",
    inputs: [{ id: "A", label: "Valid badge", probability: 0.8 }, { id: "B", label: "Host approves", probability: 0.4 }],
    inventory: { OR: 1 }, blueprint: single("OR"),
    hint: "OR accepts either input. Both inputs can also be true.",
    explanation: "OR includes the overlap once. The chance is 80% + 40% − 32% = 88%.",
    alternatives: ["Open the door only when both conditions are true.", "Open the door only when neither condition is true."],
  },
  {
    id: "quiet-hours", title: "Quiet hours", lesson: "Reverse a signal", output: "Bell rings",
    sentence: "Ring the bell when quiet hours are NOT active.",
    inputs: [{ id: "A", label: "Quiet hours", probability: 0.25 }],
    inventory: { NOT: 1 }, blueprint: single("NOT"),
    hint: "NOT has one input. It turns true into false and false into true.",
    explanation: "NOT takes the complement. If quiet hours have a 25% chance, the bell has a 75% chance.",
    alternatives: ["Ring the bell when quiet hours are active.", "Ring the bell regardless of quiet hours."],
  },
  {
    id: "one-channel", title: "One channel only", lesson: "Either, but not both", output: "Message sends",
    sentence: "Send the message when exactly one channel is ready: radio OR satellite, but NOT both.",
    inputs: [{ id: "A", label: "Radio ready", probability: 0.6 }, { id: "B", label: "Satellite ready", probability: 0.4 }],
    inventory: { XOR: 1 }, blueprint: single("XOR"),
    hint: "Exclusive OR (XOR) is true when its inputs differ.",
    explanation: "XOR excludes the overlap. Radio only is 36%; satellite only is 16%. The total is 52%.",
    alternatives: ["Send the message when either channel is ready, including both.", "Send the message only when both channels are ready."],
  },
  {
    id: "safety-first", title: "Safety first", lesson: "Compose three gates", output: "Door opens",
    sentence: "Open the door if the badge is valid OR the host approves, but only when lockdown is NOT active.",
    inputs: [{ id: "A", label: "Valid badge", probability: 0.75 }, { id: "B", label: "Host approves", probability: 0.4 }, { id: "C", label: "Lockdown", probability: 0.2 }],
    inventory: { OR: 1, NOT: 1, AND: 1 }, blueprint: combined(),
    hint: "Combine the two permissions with OR. Reverse lockdown with NOT. Join those results with AND.",
    explanation: "Permission has an 85% chance. No lockdown has an 80% chance. Together, the outcome is 68%.",
    alternatives: ["Open the door if the badge is valid, even during lockdown.", "Open the door only when both permissions and lockdown are active."],
  },
  {
    id: "same-signal", title: "The same signal", lesson: "Identity matters", output: "Signal confirmed",
    sentence: "Confirm the signal when sensor A is active. Feed that SAME signal into both inputs of the required AND gate.",
    inputs: [{ id: "A", label: "Sensor active", probability: 0.65 }],
    inventory: { AND: 1 }, blueprint: single("AND", true),
    hint: "A source can feed more than one input. Connect A to both sockets of the AND gate.",
    explanation: "A AND A is A. Reusing a signal preserves its identity, so 65% stays 65%. It does not become 42.25%.",
    alternatives: ["Confirm only when two independent sensors are active.", "Confirm the signal when sensor A is inactive."],
  },
  {
    id: "storm-watch", title: "Storm watch", lesson: "Signals can be related", output: "Alert sounds",
    sentence: "Sound the alert when rain AND strong wind occur together.",
    inputs: [{ id: "A", label: "Rain", probability: 0.6 }, { id: "B", label: "Strong wind", probability: 0.65 }],
    inventory: { AND: 1 }, blueprint: single("AND"), joint: [0.25, 0.1, 0.15, 0.5],
    hint: "The circuit is AND. Read the joint table: rain and wind are related, so do not multiply their separate probabilities.",
    explanation: "The joint table assigns 50% to rain with wind. Multiplying 60% by 65% would incorrectly give 39%.",
    alternatives: ["Sound the alert when either rain or wind occurs, including both.", "Sound the alert only when rain occurs without wind."],
  },
  {
    id: "priority-dispatch", title: "Priority dispatch", lesson: "Put it all together", output: "Ticket escalates",
    sentence: "Escalate a ticket when it is urgent OR repeated, but only if it is NOT resolved.",
    inputs: [{ id: "A", label: "Urgent", probability: 0.8 }, { id: "B", label: "Repeated", probability: 0.6 }, { id: "C", label: "Resolved", probability: 0.1 }],
    inventory: { OR: 1, NOT: 1, AND: 1 }, blueprint: combined(), joint: [0.1, 0.3, 0.1, 0.5],
    hint: "Combine urgent and repeated. Reverse resolved. Require both results. The first two signals share a joint table.",
    explanation: "Urgent or repeated has a 90% chance in the joint table. Unresolved is independent at 90%. Escalation is 81%.",
    alternatives: ["Escalate every urgent ticket, even if it is resolved.", "Escalate only when a ticket is urgent, repeated, and resolved."],
  },
];
export const GATES: Record<GateKind, { description: string; symbol: string; ports: number }> = {
  AND: { description: "Both inputs are true", symbol: "∧", ports: 2 },
  OR: { description: "At least one input is true", symbol: "∨", ports: 2 },
  NOT: { description: "Reverse the input", symbol: "¬", ports: 1 },
  XOR: { description: "Exactly one input is true", symbol: "⊕", ports: 2 },
};
