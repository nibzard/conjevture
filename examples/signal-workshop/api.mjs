import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { SHIFTS } from "../../.game-build/examples/signal-workshop/campaign.js";
import {
  parseQuestions,
  validateCircuit,
  evaluateSystem,
  decisionFor,
  questionKey,
} from "../../.game-build/examples/signal-workshop/night-engine.js";
import { getPrediction } from "./provider.mjs";
import { OUTCOMES, scoreDecision } from "./outcomes.mjs";
export async function createApi({
  statePath = new URL("../../.night-shift/sessions.json", import.meta.url),
  predict = getPrediction,
} = {}) {
  let sessions = {};
  try {
    sessions = JSON.parse(await readFile(statePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const session of Object.values(sessions))
    if (session.attempt) session.attempt.busy = false;
  let writes = Promise.resolve();
  function persist() {
    for (const session of Object.values(sessions)) publicSession(session);
    const data = JSON.stringify(sessions);
    writes = writes
      .catch(() => {})
      .then(async () => {
        const path = statePath instanceof URL ? statePath.pathname : statePath;
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path + ".tmp", data, { mode: 0o600 });
        await rename(path + ".tmp", path);
      });
    return writes;
  }
  function publicSession(session) {
    const current = session.attempt;
    if (
      current?.ended &&
      current.score >= 9 &&
      current.diagnosed &&
      !session.completed.includes(current.shiftId)
    )
      session.completed.push(current.shiftId);
    const attempt = session.attempt;
    return {
      id: session.id,
      completed: session.completed,
      attempt: attempt ? { ...attempt, busy: undefined } : null,
    };
  }
  async function body(request) {
    let bytes = 0;
    const chunks = [];
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 24000) throw new Error("Request is too large.");
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      throw new Error("Send a valid JSON request.");
    }
  }
  return async function api(request, response, path) {
    const send = (status, data) => {
      response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(JSON.stringify(data));
    };
    try {
      if (
        request.headers.origin &&
        new URL(request.headers.origin).host !== request.headers.host
      )
        return send(403, { error: "Use this game from its own origin." });
      if (path === "/api/status" && request.method === "GET")
        return send(200, {
          live: Boolean(process.env.TYPESAFE_API_KEY),
          model: process.env.JEV_MODEL || "jev-latest",
        });
      if (path === "/api/session" && request.method === "POST") {
        const token = request.headers["x-night-session"];
        const previous =
          typeof token === "string" && Object.hasOwn(sessions, token)
            ? sessions[token]
            : null;
        if (previous) return send(200, publicSession(previous));
        if (Object.keys(sessions).length >= 500)
          return send(503, {
            error: "This server has reached its session limit.",
          });
        const session = { id: randomUUID(), completed: [], attempt: null };
        sessions[session.id] = session;
        await persist();
        return send(200, publicSession(session));
      }
      const token = request.headers["x-night-session"];
      const session =
        typeof token === "string" && Object.hasOwn(sessions, token)
          ? sessions[token]
          : null;
      if (!session)
        return send(401, {
          error:
            "Your session expired. Reload the page to start a new session.",
        });
      if (request.method !== "POST")
        return send(405, { error: "This endpoint requires POST." });
      const input = await body(request);
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("Send an object.");
      if (session.attempt?.busy)
        return send(409, {
          error: "An evaluation is still running. Wait for it to finish.",
        });
      if (path === "/api/start") {
        const index = SHIFTS.findIndex((shift) => shift.id === input.shiftId);
        if (
          index < 0 ||
          (index > 0 && !session.completed.includes(SHIFTS[index - 1].id))
        )
          throw new Error("Complete the previous shift first.");
        session.attempt = {
          id: randomUUID(),
          shiftId: input.shiftId,
          index: 0,
          score: 0,
          drones: 2,
          checks: 0,
          calls: 0,
          revision: 0,
          diagnosed: false,
          results: [],
          snapshot: null,
          ended: false,
        };
        await persist();
        return send(200, { session: publicSession(session) });
      }
      const attempt = session.attempt;
      if (!attempt) throw new Error("Start a shift first.");
      const shift = SHIFTS.find((item) => item.id === attempt.shiftId);
      const report = shift.reports[attempt.index];
      if (input.attemptId !== attempt.id)
        return send(409, {
          error:
            "This action belongs to an older shift. Reload to restore the current shift.",
        });
      if (path === "/api/diagnose") {
        if (
          !["question", "wiring", "dependence", "evidence"].includes(
            input.cause,
          )
        )
          throw new Error("Choose a cause to investigate.");
        const correct = input.cause === shift.diagnosis.cause;
        if (correct) attempt.diagnosed = true;
        await persist();
        return send(200, {
          correct,
          explanation: correct
            ? shift.diagnosis.explanation
            : "Re-read the incident. Separate what the question means, what the gates do, the model assumption, and the available evidence.",
          session: publicSession(session),
        });
      }
      if (attempt.ended)
        throw new Error(
          "This shift is complete. Start the next shift or retry this one.",
        );
      if (path === "/api/inspect") {
        if (attempt.calls >= 12)
          throw new Error(
            "No evaluations remain for new evidence. Run the current report or retry the shift.",
          );
        if (attempt.revision || attempt.checks >= 2)
          throw new Error(
            "Inspection budget used. Each report allows one inspection; each shift allows two.",
          );
        attempt.revision = 1;
        attempt.checks++;
        attempt.snapshot = null;
        await persist();
        return send(200, {
          evidence: OUTCOMES[report.id][2],
          session: publicSession(session),
        });
      }
      if (path === "/api/evidence")
        return send(200, {
          evidence: attempt.revision ? OUTCOMES[report.id][2] : null,
        });
      if (path === "/api/evaluate") {
        if (!["live", "recorded"].includes(input.source))
          throw new Error("Choose Live Jev or Recorded replay.");
        if (attempt.calls >= 12)
          throw new Error(
            "This report has used its 12 evaluations. Run the system, or restart the shift.",
          );
        const questions = parseQuestions(input.questions, shift);
        const custom =
          typeof input.text === "string" && input.text.trim().length > 0;
        if (
          custom &&
          (input.text.length > 2500 || input.text.trim().length < 10)
        )
          throw new Error("Custom reports need 10–2500 characters.");
        const text = custom
          ? input.text.trim()
          : report.message +
            (attempt.revision ? "\nInspection: " + OUTCOMES[report.id][2] : "");
        attempt.busy = true;
        try {
          const snapshot = await predict({
            shift,
            report,
            revision: attempt.revision,
            questions,
            text,
            source: input.source,
            custom,
          });
          attempt.snapshot = snapshot;
          attempt.calls++;
          await persist();
          return send(200, { snapshot, session: publicSession(session) });
        } finally {
          attempt.busy = false;
        }
      }
      if (path === "/api/run") {
        if (!attempt.snapshot || input.snapshotId !== attempt.snapshot.id)
          throw new Error(
            "Evaluate the current evidence before running the system.",
          );
        if (attempt.snapshot.custom)
          throw new Error(
            "Custom reports are a sandbox. Evaluate the campaign report before scoring.",
          );
        if (
          questionKey(parseQuestions(input.questions, shift)) !==
          questionKey(attempt.snapshot.questions)
        )
          throw new Error(
            "The questions changed. Evaluate them again before running the system.",
          );
        const circuit = validateCircuit(input.circuit, shift);
        if (!["joint", "independent"].includes(input.modelMode))
          throw new Error("Choose a valid probability model.");
        const result = evaluateSystem(
          shift,
          attempt.snapshot,
          circuit,
          input.modelMode,
          typeof input.reason === "string" ? input.reason : "",
        );
        const action = decisionFor(result.probability, input.low, input.high);
        if (action === "dispatch" && attempt.drones < 1)
          throw new Error(
            "No drones remain. Adjust the system or retry this shift.",
          );
        const scored = scoreDecision(
          report.id,
          action,
          Boolean(attempt.revision),
        );
        if (action === "dispatch") attempt.drones--;
        attempt.score += scored.points;
        attempt.results.push({
          ...scored,
          reportId: report.id,
          reportTitle: report.title,
          probability: result.probability,
          expression: result.expression,
          source: attempt.snapshot.source,
          requestId: attempt.snapshot.requestId,
          model: attempt.snapshot.response.model,
          questions: attempt.snapshot.questions,
          modelMode: input.modelMode,
          assumptions: result.assumptions,
          inspected: Boolean(attempt.revision),
        });
        attempt.index++;
        attempt.revision = 0;
        attempt.calls = 0;
        attempt.snapshot = null;
        if (attempt.index === shift.reports.length) attempt.ended = true;
        await persist();
        return send(200, { result: scored, session: publicSession(session) });
      }
      if (path === "/api/finish")
        throw new Error("Finish by running the system on every report.");
      return send(404, { error: "Unknown endpoint." });
    } catch (error) {
      return send(400, { error: error.message || "The operation failed." });
    }
  };
}
