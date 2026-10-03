// Independent scenario truth. This file is server-only and is never sent to Jev.
// These outcomes are authored before model calls and do not depend on its predictions.
export const OUTCOMES = {
  pump: [
    true,
    "The pump bearing was deteriorating. A drone prevents a shutdown.",
    "Vibration is twice the morning reading and rising. The reset did not repair the bearing.",
  ],
  lift: [
    false,
    "The repaired lift needed no drone. Normal deliveries continue.",
    "Every load test today passed. The contactor replacement is verified.",
  ],
  filter: [
    true,
    "The blocked filter prevented airflow. A drone restores ventilation.",
    "The outlet has zero airflow. The fan turning does not mean the filter works.",
  ],
  coolant: [
    true,
    "The leak remained active after the reset. A drone seals it.",
    "No component was repaired. Pressure continues to fall. The restart was temporary.",
  ],
  seal: [
    false,
    "The lasting seal repair was verified. No drone was needed.",
    "The replacement seal passed the full sustained pressure test and was signed off.",
  ],
  relay: [
    true,
    "The dead controller could not operate normally. A drone replaces it.",
    "Only the indicator lights work. The controller cannot run the equipment. No lasting repair exists.",
  ],
  echo: [
    true,
    "The hatch remained defective. Repeated messages described one real fault.",
    "A fresh inspection finds the latch broken and the hatch unable to close.",
  ],
  "old-log": [
    false,
    "The messages repeated an old fault. The replacement motor was healthy.",
    "The replacement motor is running normally. The Tuesday failure is historical.",
  ],
  bearing: [
    true,
    "The bearing was damaged. Its repeated recording did not create additional evidence.",
    "A fresh measurement confirms grinding and a worn bearing requiring repair.",
  ],
  feed: [
    true,
    "The shared feed disabled both units. A drone restores the feed.",
    "Neither unit has voltage at its supply. The shared feed is broken.",
  ],
  reserve: [
    false,
    "The backup carried the load. The policy did not require a drone.",
    "The reserve delivers full rated output and is available for the whole shift.",
  ],
  unclear: [
    true,
    "The common feed had failed. Inspection established that both units were down.",
    "Both units are stopped. The display was dark because the shared power feed failed.",
  ],
  antenna: [
    true,
    "The degraded antenna needed a repair before its drive failed.",
    "It still tracks, but the bearing defect is worsening. Current state: degraded.",
  ],
  charger: [
    true,
    "The failed charger needed repair. Its indicator was misleading.",
    "Every output measures zero under load. Current state: failed.",
  ],
  green: [
    false,
    "The replacement unit was healthy. An old warning did not justify dispatch.",
    "Current diagnostics and sustained operation all pass. Current state: healthy.",
  ],
  rumor: [
    true,
    "“Sorted” meant a restart. The fault remained and required a drone.",
    "The engineer only restarted it. The heat fault is still worsening; no repair was completed or tested.",
  ],
  sarc: [
    true,
    "The shutdown rate was increasing. The optimistic wording was sarcasm.",
    "Shutdowns increased from every ten minutes to every four. It cannot maintain service; no repair has been made.",
  ],
  cleared: [
    false,
    "The verified lasting repair made another drone unnecessary.",
    "The repair record is signed. Sustained load passed after replacement of the worn part.",
  ],
};
export function scoreDecision(reportId, action, inspected) {
  const [needed, outcome] = OUTCOMES[reportId] ?? [];
  if (typeof needed !== "boolean") throw new Error("Unknown report.");
  const correct =
    action === "dispatch" ? needed : action === "wait" ? !needed : false;
  const points =
    (action === "review" ? 1 : correct ? 4 : action === "dispatch" ? -3 : -5) -
    (inspected ? 1 : 0);
  return {
    needed,
    outcome,
    action,
    correct,
    points,
    consequence:
      action === "review"
        ? "Manual review uses two minutes. The report remains unautomated."
        : correct
          ? needed
            ? "One drone used. Fault contained."
            : "Drone saved. Normal service continues."
          : needed
            ? "Missed fault. Station service is interrupted."
            : "Unnecessary dispatch. One drone wasted.",
  };
}
