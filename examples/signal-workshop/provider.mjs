import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  buildQuestions,
  parseProvider,
  makeModel,
  questionKey,
  normalizeProvider,
} from "../../.game-build/examples/signal-workshop/night-engine.js";
const recordings = new URL("./recordings/", import.meta.url);
export function recordingName(shift, report, revision, questions) {
  const hash = createHash("sha256")
    .update(questionKey(questions))
    .digest("hex")
    .slice(0, 16);
  return `${shift.id}-${report.id}-${revision}-${hash}.json`;
}
export async function getPrediction({
  shift,
  report,
  revision,
  questions,
  text,
  source,
  custom = false,
}) {
  const name = recordingName(shift, report, revision, questions);
  if (source === "recorded") {
    if (custom)
      throw new Error(
        "Custom reports require Live Jev. Recorded evidence cannot answer new text.",
      );
    let record;
    try {
      record = JSON.parse(await readFile(new URL(name, recordings), "utf8"));
    } catch {
      throw new Error(
        "No recording matches these exact questions and evidence. Use Live Jev, or restore the recorded questions.",
      );
    }
    if (
      record.text !== text ||
      questionKey(record.questions) !== questionKey(questions)
    )
      throw new Error(
        "The recording does not match this evidence. Use Live Jev.",
      );
    const snapshot = { ...record, id: randomUUID(), source: "recorded" };
    makeModel(shift, snapshot, "joint", "");
    return snapshot;
  }
  const key = process.env.TYPESAFE_API_KEY;
  if (!key)
    throw new Error(
      "Live Jev is not configured on this server. Set TYPESAFE_API_KEY or choose a recorded replay.",
    );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.JEV_MODEL || "jev-latest",
        state: { report: text },
        questions: buildQuestions(shift, questions),
      }),
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(
        `Jev request failed (HTTP ${response.status}). Your work is saved; try again or use a recorded replay.`,
      );
    const rawResponse = parseProvider(await response.json());
    const normalized = normalizeProvider(rawResponse);
    const data = normalized.response;
    const snapshot = {
      id: randomUUID(),
      shiftId: shift.id,
      reportId: report.id,
      revision,
      source: "live",
      recordedAt: new Date().toISOString(),
      requestId: response.headers.get("x-request-id") || randomUUID(),
      questions,
      response: data,
      rawResponse,
      adjustments: normalized.adjustments,
      text,
      custom,
    };
    makeModel(shift, snapshot, "joint", "");
    return snapshot;
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error(
        "Jev took too long to answer. Your work is saved. Retry the request.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export async function recordPrediction(snapshot, shift, report) {
  if (snapshot.source !== "live" || snapshot.custom)
    throw new Error("Only actual campaign predictions can be recorded.");
  await mkdir(recordings, { recursive: true });
  await writeFile(
    new URL(
      recordingName(shift, report, snapshot.revision, snapshot.questions),
      recordings,
    ),
    JSON.stringify(snapshot, null, 2) + "\n",
  );
}
