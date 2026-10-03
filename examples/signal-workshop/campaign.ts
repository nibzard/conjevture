import type { Circuit, GateKind } from "./levels.js";
export interface Judgment {
  id: string;
  label: string;
  question: string;
  yes: string;
  no: string;
}
export interface Report {
  id: string;
  title: string;
  message: string;
  check: string;
}
export interface Shift {
  id: string;
  title: string;
  concept: string;
  briefing: string;
  policy: string;
  questions: Judgment[];
  inventory: Partial<Record<GateKind, number>>;
  reports: Report[];
  hint: string;
  diagnosis: {
    cause: "question" | "wiring" | "dependence" | "evidence";
    prompt: string;
    explanation: string;
  };
  starter: Circuit;
  category?: boolean;
  reference: Circuit;
}
const q = (
  id: string,
  label: string,
  question: string,
  yes: string,
  no: string,
): Judgment => ({ id, label, question, yes, no });
const unusable = q(
  "A",
  "Unusable now",
  "Is the equipment currently unable to perform its intended job?",
  "The current fault prevents normal operation.",
  "It operates normally, or only a past fault is described.",
);
const worse = q(
  "B",
  "Getting worse",
  "Is the current equipment fault deteriorating?",
  "The report describes a worsening fault, even if equipment still operates.",
  "There is no current deterioration, or the problem is only historical.",
);
const fixed = q(
  "C",
  "Repair verified",
  "Has a lasting repair of the current fault been verified?",
  "A repair is complete and has passed a sustained operation check.",
  "A restart, temporary workaround, hope, or unverified claim is not a verified repair.",
);
const g = (id: string, kind: GateKind, x = 430, y = 180) => ({
  id,
  kind,
  x,
  y,
});
const w = (from: string, to: string, port = 0) => ({ from, to, port });
const pair = (kind: GateKind): Circuit => ({
  gates: [g("g1", kind)],
  wires: [w("A", "g1"), w("B", "g1", 1), w("g1", "out")],
});
const combined: Circuit = {
  gates: [
    g("g1", "OR", 290, 70),
    g("g2", "NOT", 290, 280),
    g("g3", "AND", 580, 180),
  ],
  wires: [
    w("A", "g1"),
    w("B", "g1", 1),
    w("C", "g2"),
    w("g1", "g3"),
    w("g2", "g3", 1),
    w("g3", "out"),
  ],
};
export const SHIFTS: readonly Shift[] = [
  {
    id: "first-watch",
    title: "First watch",
    concept: "Words become signals",
    briefing:
      "The station has two repair drones. Build one system that can handle three differently worded reports.",
    policy:
      "Dispatch if equipment is currently unusable OR its condition is getting worse.",
    questions: [unusable, worse],
    inventory: { OR: 1 },
    starter: { gates: [], wires: [] },
    reference: pair("OR"),
    hint: "Add OR. Feed A and B into it, then connect it to Dispatch. Evaluate a report with Jev before running the system.",
    diagnosis: {
      cause: "question",
      prompt:
        "An earlier system asked “Does the report mention failure?” and dispatched for a repaired fault. What should change first?",
      explanation:
        "The judgment must distinguish a current fault from a mention of an old failure. Correct gates cannot repair a vague question.",
    },
    reports: [
      {
        id: "pump",
        title: "Pump 04 · wet deck",
        message:
          "Another reset got the pump turning. But the vibration has climbed all evening. I would not call this a recovery.",
        check: "Ask for a vibration trend",
      },
      {
        id: "lift",
        title: "Cargo lift · bay 2",
        message:
          "Yesterday the lift was completely dead. They replaced the contactor; it has run every load today without a hitch.",
        check: "Ask for today's operating log",
      },
      {
        id: "filter",
        title: "Air filter · ring C",
        message:
          "The fan sounds normal. Nothing gets through the filter, though. The test strip at the outlet doesn't move.",
        check: "Ask whether air reaches the outlet",
      },
    ],
  },
  {
    id: "temporary-fix",
    title: "A temporary fix",
    concept: "Define your judgment",
    briefing:
      "You inherit a system that treats any restart as a repair. Edit the repair question and its criteria before the next reports arrive.",
    policy:
      "Dispatch if equipment is unusable OR deteriorating, unless a lasting repair is verified.",
    questions: [
      unusable,
      worse,
      {
        ...fixed,
        question: "Has anyone got the equipment running again?",
        yes: "Any successful restart counts as a fix.",
        no: "Nobody has got it running.",
      },
    ],
    inventory: { OR: 1, NOT: 1, AND: 1 },
    starter: combined,
    reference: combined,
    hint: "C should mean a lasting, checked repair. Edit its question and true/false criteria. A restart alone should not satisfy C.",
    diagnosis: {
      cause: "question",
      prompt:
        "The inherited circuit cancels dispatch after an unstable restart. Its gates correctly implement the policy. Where is the defect?",
      explanation:
        "The repair judgment has the wrong meaning. Keep the rule, but require a verified lasting repair instead of any restart.",
    },
    reports: [
      {
        id: "coolant",
        title: "Coolant loop · reset 3",
        message:
          "It's running again after the third reset. Pressure is dropping faster each time. We haven't replaced anything or checked the repair.",
        check: "Ask whether a lasting repair passed inspection",
      },
      {
        id: "seal",
        title: "Hatch seal · signed off",
        message:
          "Earlier the seal couldn't hold pressure. The damaged ring is replaced, and the two-hour leak test passed. Normal service is restored.",
        check: "Read the repair inspection",
      },
      {
        id: "relay",
        title: "Relay rack · bypass",
        message:
          "We've bridged the relay so the lights come on. The actual controller is still dead and the bypass is not rated for operation.",
        check: "Ask whether normal operation is possible",
      },
    ],
  },
  {
    id: "shared-signal",
    title: "An echo is not evidence",
    concept: "Preserve identity",
    briefing:
      "Two channels repeat the same sensor report. Route A into both gate inputs. A second wire must not become a second observation.",
    policy:
      "Dispatch when the single report indicates a current fault. Feed A through both inputs of the required AND gate.",
    questions: [
      q(
        "A",
        "Current fault",
        "Does the equipment currently have a fault requiring repair?",
        "The report describes a current operational defect.",
        "The equipment is operating normally; repetition alone is not evidence of a fault.",
      ),
    ],
    inventory: { AND: 1 },
    starter: { gates: [], wires: [] },
    reference: {
      gates: [g("g1", "AND")],
      wires: [w("A", "g1"), w("A", "g1", 1), w("g1", "out")],
    },
    hint: "A → AND input 1; A → AND input 2. The output probability stays P(A), not P(A) squared.",
    diagnosis: {
      cause: "dependence",
      prompt:
        "A previous display multiplied a 65% judgment by itself and showed 42.25%. What went wrong?",
      explanation:
        "Both branches use the same variable. They are not independent observations. Conjevture preserves the shared identity.",
    },
    reports: [
      {
        id: "echo",
        title: "Duplicated transmission",
        message:
          "East hatch won't latch. Maintenance repeated the same operator message on channel two. There is still only one report, and the hatch is still open.",
        check: "Ask for a fresh physical check",
      },
      {
        id: "old-log",
        title: "An old report forwarded",
        message:
          "Forwarded twice: 'motor failed Tuesday'. Current update: new motor fitted Wednesday, all checks passed; it is working normally.",
        check: "Confirm the current status",
      },
      {
        id: "bearing",
        title: "Bearing · one observation",
        message:
          "One mechanic heard the bearing grinding. The recording has been replayed on two channels. Nobody has repaired it and grinding continues.",
        check: "Request a fresh bearing reading",
      },
    ],
  },
  {
    id: "shared-cause",
    title: "One report, two claims",
    concept: "Declare dependence",
    briefing:
      "A fault and loss of backup can have the same cause. The inherited system assumes independence. Compare that with Jev's joint judgment.",
    policy:
      "Dispatch only if the main unit is unusable AND its backup is unavailable.",
    questions: [
      q(
        "A",
        "Main unit down",
        "Is the main unit currently unable to operate?",
        "The main unit cannot do its job now.",
        "The main unit is available now.",
      ),
      q(
        "B",
        "No backup",
        "Is the backup currently unavailable?",
        "No functioning backup is available now.",
        "A working backup is available now.",
      ),
    ],
    inventory: { AND: 1 },
    starter: pair("AND"),
    reference: pair("AND"),
    hint: "Both judgments come from the same incident. Choose Joint evidence. Inspect the table rather than multiplying separate answers.",
    diagnosis: {
      cause: "dependence",
      prompt:
        "The main unit and backup share a power feed. The previous system multiplied their separate probabilities without justification. Which assumption needs review?",
      explanation:
        "A common cause can connect the two events. Use a supplied joint distribution. Separate model answers do not establish independence.",
    },
    reports: [
      {
        id: "feed",
        title: "Common power feed",
        message:
          "The feed to this rack is dead. Main and backup both use it; neither unit has power. Switching to backup changes nothing.",
        check: "Ask whether either unit has power",
      },
      {
        id: "reserve",
        title: "Reserve takes over",
        message:
          "The main compressor seized. The independent reserve is online at full output and can carry the load until morning.",
        check: "Ask for reserve capacity",
      },
      {
        id: "unclear",
        title: "The dark panel",
        message:
          "The panel went dark. It may be only the display feed, or the shared feed for both units. We cannot tell from here whether either unit still works.",
        check: "Send one technician to check both units",
      },
    ],
  },
  {
    id: "status-desk",
    title: "One machine, one status",
    concept: "Typed categories",
    briefing:
      "Classify equipment into one of three current states. A machine cannot occupy two status categories in the same possible world.",
    policy:
      "Dispatch when current status is failed OR degraded. Do not dispatch for healthy equipment.",
    questions: [
      q(
        "A",
        "Failed",
        "Is the equipment failed?",
        "It cannot perform its intended job.",
        "It is not failed.",
      ),
      q(
        "B",
        "Degraded",
        "Is the equipment degraded?",
        "It works, but has a current defect or abnormal deterioration.",
        "It is failed or healthy.",
      ),
    ],
    inventory: { OR: 1 },
    category: true,
    starter: pair("AND"),
    reference: pair("OR"),
    hint: "Replace the inherited AND with OR. Failed and degraded are mutually exclusive labels of the same Choice variable.",
    diagnosis: {
      cause: "wiring",
      prompt:
        "The inherited circuit requires status = failed AND status = degraded. It never dispatches. Where is the defect?",
      explanation:
        "The status categories exclude each other. AND is impossible. OR accepts either failed or degraded without counting overlap.",
    },
    reports: [
      {
        id: "antenna",
        title: "Antenna · noisy drive",
        message:
          "It still tracks targets, but its drive is shuddering and the tracking error is increasing. It isn't fully failed yet.",
        check: "Ask for the current operating mode",
      },
      {
        id: "charger",
        title: "Charger · no output",
        message:
          "The indicator is on but none of the sockets supply power. It cannot charge anything, even after a reset.",
        check: "Ask for an output measurement",
      },
      {
        id: "green",
        title: "Diagnostics clear",
        message:
          "A failure warning was printed last week. Today the replacement unit passed every diagnostic and is operating normally.",
        check: "Read today's diagnostics",
      },
    ],
  },
  {
    id: "last-watch",
    title: "The last watch",
    concept: "Build, test, investigate",
    briefing:
      "The handover is informal, the reports are incomplete, and you have one inspection per report. Reuse one system across the shift.",
    policy:
      "Handover: 'Don't waste a drone on a signed-off repair. Otherwise get one out when something can't do its job, or it's going downhill. A quick restart doesn't count as signed off.'",
    questions: [unusable, worse, fixed],
    inventory: { OR: 1, NOT: 1, AND: 1 },
    starter: { gates: [], wires: [] },
    reference: combined,
    hint: "Translate the memo into (A OR B) AND NOT C. Interpret the reports separately. An inspection adds evidence; it does not change the policy.",
    diagnosis: {
      cause: "evidence",
      prompt:
        "A report cannot distinguish a temporary restart from a completed repair. The questions and circuit are correct. What is missing?",
      explanation:
        "The report lacks evidence. Ask for an inspection and evaluate a new state revision. Changing the rule would hide the uncertainty.",
    },
    reports: [
      {
        id: "rumor",
        title: "A second-hand all-clear",
        message:
          "Someone said the unit is 'sorted'. Nobody on this channel knows whether that meant a reset or a tested repair. It was overheating earlier.",
        check: "Ask the engineer what was actually repaired",
      },
      {
        id: "sarc",
        title: "An optimistic operator",
        message:
          "Great news: it only shuts itself down every four minutes now instead of every ten. No repair team has touched it. Perfectly fine, obviously.",
        check: "Ask for the shutdown log",
      },
      {
        id: "cleared",
        title: "Final sign-off",
        message:
          "The fault was getting worse this afternoon. The worn part is now replaced, the sustained load test passed, and engineering has signed off the lasting repair.",
        check: "Verify the signed repair record",
      },
    ],
  },
];
export const REPAIR_QUESTION = fixed;
export function defaultQuestions(shift: Shift): Judgment[] {
  return structuredClone(shift.questions);
}
export function revisedQuestions(shift: Shift): Judgment[] {
  return defaultQuestions(shift).map((question) =>
    shift.id === "temporary-fix" && question.id === "C"
      ? { ...fixed }
      : question,
  );
}
