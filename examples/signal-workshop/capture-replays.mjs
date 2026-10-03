import {
  SHIFTS,
  defaultQuestions,
  revisedQuestions,
} from "../../.game-build/examples/signal-workshop/campaign.js";
import { getPrediction, recordPrediction } from "./provider.mjs";
import { OUTCOMES } from "./outcomes.mjs";
import { access } from "node:fs/promises";
import { recordingName } from "./provider.mjs";
const tasks = [];
for (const shift of SHIFTS)
  for (const report of shift.reports)
    for (const revision of [0, 1]) {
      const variants =
        shift.id === "temporary-fix"
          ? [defaultQuestions(shift), revisedQuestions(shift)]
          : [defaultQuestions(shift)];
      for (const questions of variants)
        tasks.push({
          shift,
          report,
          revision,
          questions,
          text:
            report.message +
            (revision ? "\nInspection: " + OUTCOMES[report.id][2] : ""),
          source: "live",
        });
    }
let failures = 0;
async function worker() {
  while (tasks.length) {
    const task = tasks.shift();
    const name = recordingName(
      task.shift,
      task.report,
      task.revision,
      task.questions,
    );
    try {
      await access(new URL("./recordings/" + name, import.meta.url));
      console.log("Exists:", name);
      continue;
    } catch {}
    try {
      const snapshot = await getPrediction(task);
      await recordPrediction(snapshot, task.shift, task.report);
      console.log("Recorded:", name, snapshot.response.model);
    } catch (error) {
      failures++;
      console.error("Failed:", name, error.message);
    }
  }
}
await Promise.all([worker(), worker()]);
process.exitCode = failures ? 1 : 0;
