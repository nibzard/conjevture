import { evaluate as evaluateExpression } from "conjevture";
import { SHIFTS, defaultQuestions, revisedQuestions } from "./campaign.js";
import type { Judgment, Shift } from "./campaign.js";
import {
  evaluateSystem,
  decisionFor,
  makeModel,
  questionKey,
} from "./night-engine.js";
import type { ModelMode, Snapshot } from "./night-engine.js";
import { GATES } from "./levels.js";
import type { Circuit, GateKind } from "./levels.js";
import { Board, esc } from "./board.js";
interface Result {
  reportId: string;
  reportTitle: string;
  needed: boolean;
  correct: boolean;
  points: number;
  action: string;
  outcome: string;
  consequence: string;
  probability: number;
  expression: string;
  source: string;
  requestId: string;
  model: string;
  modelMode: string;
  assumptions: string[];
  inspected: boolean;
  questions: Judgment[];
}
interface Attempt {
  id: string;
  shiftId: string;
  index: number;
  score: number;
  drones: number;
  checks: number;
  calls: number;
  revision: number;
  diagnosed: boolean;
  results: Result[];
  snapshot: Snapshot | null;
  ended: boolean;
}
interface Session {
  id: string;
  completed: string[];
  attempt: Attempt | null;
}
interface Draft {
  questions: Judgment[];
  circuit: Circuit;
  mode: ModelMode;
  reason: string;
  low: number;
  high: number;
}
interface ApiResult {
  session?: Session;
  snapshot?: Snapshot;
  result?: Result;
  correct?: boolean;
  explanation?: string;
  evidence?: string | null;
}
const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
const percent = (value: number) => `${Number((value * 100).toFixed(1))}%`;
const KEY = "conjevture:night-shift:v2";
let storage: { sessionId: string; drafts: Record<string, Draft> } = {
  sessionId: "",
  drafts: {},
};
try {
  const value = JSON.parse(localStorage.getItem(KEY) ?? "null");
  if (
    value &&
    typeof value.sessionId === "string" &&
    value.drafts &&
    typeof value.drafts === "object"
  )
    storage = value;
} catch {}
let session: Session = { id: "", completed: [], attempt: null };
let selected = 0,
  liveAvailable = false,
  source: "live" | "recorded" = "recorded",
  busy = false,
  board: Board | null = null;
let snapshot: Snapshot | null = null,
  inspection = "",
  customText = "",
  lastMessage = "",
  history: Circuit[] = [];
let draft: Draft;
const shift = (): Shift => SHIFTS[selected]!;
const active = () =>
  session.attempt?.shiftId === shift().id ? session.attempt : null;
const save = () => {
  storage.sessionId = session.id;
  storage.drafts[shift().id] = structuredClone(draft);
  try {
    localStorage.setItem(KEY, JSON.stringify(storage));
  } catch {
    notice(
      "Browser storage is unavailable. Keep this tab open to retain your session.",
    );
  }
};
function loadDraft() {
  const old = storage.drafts[shift().id];
  if (
    old &&
    Array.isArray(old.questions) &&
    Array.isArray(old.circuit?.gates) &&
    Array.isArray(old.circuit?.wires) &&
    old.circuit.gates.length <= 8 &&
    old.circuit.wires.length <= 20 &&
    old.questions.length === shift().questions.length
  ) {
    // Only use saved drafts with known identities and finite coordinates. Invalid drafts reset locally.
    try {
      if (
        old.circuit.gates.some(
          (g) =>
            !/^g\d{1,8}$/.test(g.id) ||
            !Object.hasOwn(GATES, g.kind) ||
            !Number.isFinite(g.x) ||
            !Number.isFinite(g.y),
        )
      )
        throw new Error();
      if (
        old.circuit.wires.some(
          (w) =>
            !/^([ABC]|g\d{1,8})$/.test(w.from) ||
            !/^((g\d{1,8})|out)$/.test(w.to) ||
            !Number.isInteger(w.port),
        )
      )
        throw new Error();
      if (
        old.questions.some(
          (q, i) =>
            q.id !== shift().questions[i]!.id ||
            ["question", "yes", "no"].some(
              (k) => typeof q[k as keyof Judgment] !== "string",
            ),
        )
      )
        throw new Error();
      decisionFor(0.5, old.low, old.high);
      draft = structuredClone(old);
      return;
    } catch {}
  }
  draft = {
    questions: defaultQuestions(shift()),
    circuit: structuredClone(shift().starter),
    mode: shift().id === "shared-cause" ? "independent" : "joint",
    reason:
      shift().id === "shared-cause"
        ? "Inherited assumption: the two units fail independently."
        : "",
    low: 0.3,
    high: 0.7,
  };
}
function notice(message: string, error = false) {
  const node = $("notice");
  node.textContent = message;
  node.hidden = !message;
  node.classList.toggle("error", error);
}
async function api<T = ApiResult>(
  path: string,
  data: unknown = {},
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Night-Session": session.id || storage.sessionId,
    },
    body: JSON.stringify(data),
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok)
    throw new Error(
      result.error ?? "The server could not complete the request.",
    );
  return result as T;
}
async function perform(action: () => Promise<void>) {
  if (busy) return;
  busy = true;
  notice("Working…");
  lock();
  try {
    await action();
  } catch (error) {
    notice(
      error instanceof Error ? error.message : "The request failed.",
      true,
    );
  } finally {
    busy = false;
    render();
  }
}
function lock() {
  document.body.classList.add("busy");
  $("app")
    .querySelectorAll<
      | HTMLButtonElement
      | HTMLSelectElement
      | HTMLInputElement
      | HTMLTextAreaElement
    >("button,select,input,textarea")
    .forEach((el) => (el.disabled = true));
}
function accept(result: ApiResult) {
  if (result.session) session = result.session;
  save();
}
function snapshotMatches() {
  return (
    snapshot &&
    questionKey(snapshot.questions) === questionKey(draft.questions) &&
    snapshot.reportId === shift().reports[active()?.index ?? 0]?.id &&
    snapshot.revision === (active()?.revision ?? 0)
  );
}
function nav() {
  return `<aside class="journey"><h2>Your watch · ${session.completed.length} / ${SHIFTS.length}</h2><nav aria-label="Choose a shift">${SHIFTS.map((s, i) => `<button class="shift-button" data-shift="${i}" ${i === selected ? 'aria-current="step"' : ""} ${i > 0 && !session.completed.includes(SHIFTS[i - 1]!.id) ? "disabled" : ""} aria-label="Shift ${i + 1}: ${s.title}${session.completed.includes(s.id) ? ", completed" : ""}"><span class="shift-number">${i + 1}</span><span class="shift-label">${s.title}<small>${session.completed.includes(s.id) ? "Complete" : i === selected ? s.concept : i > 0 && !session.completed.includes(SHIFTS[i - 1]!.id) ? "Locked" : s.concept}</small></span></button>`).join("")}</nav><p class="journey-note">The words are uncertain.<br>The rule is yours.<a href="./tutorial.html">New to gates? Start with two short lessons →</a></p></aside>`;
}
function briefing() {
  return `<section class="brief"><div class="brief-top"><div><p class="shift-counter">Shift ${selected + 1} / ${SHIFTS.length}</p><h1>${shift().title}</h1></div><span class="status">${shift().concept}</span></div><p>${shift().briefing}</p><div class="policy"><small>Your dispatch policy</small>${esc(shift().policy)}</div></section>`;
}
function investigation() {
  const a = active();
  return `<section class="investigate"><div class="section-heading"><h2>Investigate an incident</h2><span class="status">${a?.diagnosed ? "Solved" : "Required to advance"}</span></div><p>${esc(shift().diagnosis.prompt)}</p>${
    a?.diagnosed
      ? `<p class="diagnosis-result">${esc(shift().diagnosis.explanation)}</p>`
      : `<div class="causes">${[
          ["question", "Question meaning"],
          ["wiring", "Gate connections"],
          ["dependence", "Dependence assumption"],
          ["evidence", "Missing evidence"],
        ]
          .map(([id, name]) => `<button data-cause="${id}">${name}</button>`)
          .join("")}</div>`
  }</section>`;
}
function questionEditor() {
  return `<section class="questions"><h2>${shift().category ? "Define the status categories" : "Define the judgments"}</h2><p>${shift().category ? "One Choice variable: failed, degraded, or healthy. Edit the category criteria below." : "Jev interprets these questions for each report. Edit the question and the boundary between true and false."}</p>${draft.questions.map((q, i) => `<details class="question" ${shift().id === "temporary-fix" && q.id === "C" ? "open" : ""}><summary>${q.id} · ${esc(q.label)} <em id="marginal-${q.id}">—</em></summary>${(shift().category ? ["yes"] : ["question", "yes", "no"]).map((field) => `<label>${field === "question" ? "Question" : field === "yes" ? (shift().category ? "Category definition" : "True means") : "False means"}<textarea data-question="${i}" data-field="${field}" maxlength="600">${esc(q[field as keyof Judgment])}</textarea></label>`).join("")}</details>`).join("")}<div class="question-actions"><button id="restore-questions">Restore original questions</button>${shift().id === "temporary-fix" ? '<button id="precise-questions">Use precise repair criteria</button>' : ""}</div></section>`;
}
function probabilityPanel() {
  return `<section aria-label="Evaluation"><div class="evaluation-controls"><label>Evidence source<select id="source"><option value="live" ${source === "live" ? "selected" : ""} ${!liveAvailable ? "disabled" : ""}>Live Jev</option><option value="recorded" ${source === "recorded" ? "selected" : ""}>Recorded replay</option></select></label><button id="evaluate" class="primary">${source === "live" ? "Evaluate with Jev" : "Load recorded evidence"}</button></div><div class="probability"><strong id="probability">—</strong><div><p>Probability that the dispatch rule holds</p><small id="expression">Connect the circuit and evaluate the report.</small></div></div><p id="provenance" class="provenance">${source === "live" ? "A live call sends the report and your questions to TypeSafe." : "A replay uses a genuine saved Jev response to matching questions."}</p><div class="model-panel"><label for="model-mode">Probability model</label><select id="model-mode" ${shift().category || draft.questions.length === 1 ? "disabled" : ""}><option value="joint" ${draft.mode === "joint" ? "selected" : ""}>${shift().category ? "One categorical variable" : draft.questions.length === 1 ? "One variable, reused by identity" : "Joint evidence · related judgments"}</option>${!shift().category && draft.questions.length > 1 ? `<option value="independent" ${draft.mode === "independent" ? "selected" : ""}>Assume independence · compare the same marginals</option>` : ""}</select><label id="reason-label" ${draft.mode === "independent" ? "" : "hidden"}>Why is independence justified?<input id="reason" maxlength="300" value="${esc(draft.reason)}"></label><p id="model-note">${shift().category ? "Failed, degraded, and healthy exclude each other." : draft.questions.length === 1 ? "Connecting A twice does not create two independent observations." : "Jev supplies probabilities for complete assignments. The library does not infer dependence from separate answers."}</p><div id="model-data"></div></div><section class="decision-panel"><h3>Turn the probability into a decision</h3><div class="thresholds"><label>Wait at or below <input id="low" type="number" min="5" max="85" step="1" value="${Math.round(draft.low * 100)}">%</label><label>Dispatch at or above <input id="high" type="number" min="15" max="95" step="1" value="${Math.round(draft.high * 100)}">%</label></div><p>Between the thresholds, send to manual review. Inspections add evidence before you decide.</p><div id="next-action" class="next-action">Evaluate first to see the next action.</div><button id="run" class="primary" disabled>Run this system on the report</button></section></section>`;
}
function renderActive() {
  const a = active()!,
    report = shift().reports[a.index]!;
  return `<div class="stats"><div><span>Report</span><strong>${a.index + 1} / 3</strong></div><div><span>Drones left</span><strong>${a.drones} / 2</strong></div><div><span>Inspections left</span><strong>${2 - a.checks} / 2</strong></div><div><span>Score · need 9</span><strong>${a.score}</strong></div><button id="restart">Restart shift</button></div>${lastMessage ? `<div class="result-banner">${esc(lastMessage)}</div>` : ""}<div class="columns"><div class="evidence-column"><div class="section-heading"><h2>Incoming transmission</h2><span class="status">Revision ${a.revision + 1}</span></div><div class="report-nav" aria-hidden="true">${[0, 1, 2].map((i) => `<span class="${i === a.index ? "current" : i < a.index ? "done" : ""}"></span>`).join("")}</div><article class="report"><small>Station log · ${report.id}</small><h3>${report.title}</h3><blockquote>${esc(report.message)}</blockquote>${inspection ? `<p class="inspection"><strong>Inspection:</strong> ${esc(inspection)}</p>` : ""}</article><button id="inspect" class="inspect-button" ${a.revision || a.checks >= 2 || a.calls >= 12 ? "disabled" : ""}>${a.revision ? "Inspection received" : report.check + " →"}</button><p class="evidence-note">One inspection per report. Each costs 1 point. Current report: ${a.calls} / 12 evaluations.</p><details class="sandbox"><summary>Try your own report · unscored</summary><label for="custom-text">Leave empty to use the campaign report<textarea id="custom-text" maxlength="2500" placeholder="Write an unfamiliar report for your system…">${esc(customText)}</textarea></label><p>Custom text uses Live Jev. Return to the campaign report before running a scored decision.</p></details>${questionEditor()}</div><div class="system-column"><section class="workbench"><div class="workbench-heading"><h2>Your circuit</h2><div><button id="undo" ${history.length ? "" : "disabled"}>Undo</button><button id="reset">Clear</button></div></div><div id="inventory" class="inventory"></div><div id="board-host"></div><p class="board-hint" id="board-message">Scroll the board sideways if needed. Connect sockets with the controls below it.</p></section><details class="score-rules"><summary>Need a wiring hint?</summary><p>${shift().hint}</p></details>${probabilityPanel()}</div></div>${investigation()}<details class="score-rules"><summary>Scoring and the independent answer key</summary><p>Correct: +4. Unnecessary dispatch: −3. Missed fault: −5. Manual review: +1. Inspection: −1. Finish with at least 9 points and solve the investigation. Outcomes were authored independently and are not sent to Jev.</p></details>`;
}
function debrief() {
  const a = active()!,
    won = session.completed.includes(shift().id) && a.score >= 9 && a.diagnosed;
  return `<section class="debrief"><h2>${won ? "Watch complete." : a.score >= 9 ? "The station is safe. Finish the investigation." : "Review the shift. Improve your system."}</h2><p><strong>${a.score} points</strong> · ${a.results.filter((r) => r.correct).length} / 3 correct decisions · ${a.drones} drones left</p><p>${a.score >= 9 ? "Your decisions meet the 9-point target." : "You need at least 9 points. Inspect the decisions below, edit your system, and retry."}</p>${a.results.map((r) => `<article><h3>${esc(r.reportTitle)} · ${r.points > 0 ? "+" : ""}${r.points}</h3><p><strong>${r.action === "dispatch" ? "Dispatched" : r.action === "wait" ? "Waited" : "Sent to review"}</strong> at ${percent(r.probability)}. ${esc(r.consequence)}</p><p>${esc(r.outcome)}</p><p><code>${esc(r.expression)}</code></p><details><summary>Trace this decision</summary><p>${r.source === "live" ? "Live Jev" : "Recorded Jev"} · ${esc(r.model)} · ${esc(r.requestId)}</p><p>Model: ${esc(r.modelMode)}. ${esc(r.assumptions.join(" "))}</p>${r.questions.map((q) => `<p><strong>${q.id}:</strong> ${esc(q.question)}<br>True: ${esc(q.yes)}</p>`).join("")}</details></article>`).join("")}<div class="debrief-actions">${won && selected < SHIFTS.length - 1 ? '<button id="next" class="primary">Take the next watch →</button>' : ""}${won && selected === SHIFTS.length - 1 ? "<p>You completed all six shifts. Your station is ready for a new watch.</p>" : ""}<button id="retry">Restart shift</button></div></section>${investigation()}`;
}
function render() {
  document.body.classList.remove("busy");
  const a = active();
  $("app").innerHTML =
    nav() +
    `<div class="desk">${briefing()}${!a ? `<section class="start-screen"><h2>Take the desk.</h2><p>Build a reusable decision system. Jev reads the reports; your circuit and thresholds decide what happens.</p><div class="welcome-flow"><b>Report</b><span>→</span><b>Jev judgments</b><span>→</span><b>Your circuit</b><span>→</span><b>Station outcome</b></div><ol><li>Define ${shift().questions.length} judgment${shift().questions.length === 1 ? "" : "s"} and connect ${Object.values(shift().inventory).reduce((sum, n) => sum + n, 0)} supplied gate(s).</li><li>Handle three reports with two drones and two inspections.</li><li>Earn 9 points and investigate an earlier failure.</li></ol><button id="start" class="primary">Start this shift →</button></section>` : a.ended ? debrief() : renderActive()}<footer><span>Jev interprets. Conjevture calculates. You decide the rule.</span><span>Exact calculation within the supplied probability model.</span></footer></div>`;
  $("app")
    .querySelectorAll<HTMLButtonElement>("[data-shift]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          perform(async () => {
            save();
            selected = Number(button.dataset["shift"]);
            loadDraft();
            history = [];
            snapshot = active()?.snapshot ?? null;
            customText = "";
            inspection = "";
            lastMessage = "";
            if (active()?.revision) {
              const r = await api("evidence", { attemptId: active()!.id });
              inspection = r.evidence ?? "";
            }
            notice("");
          })),
    );
  $("start")?.addEventListener("click", () => start());
  $("retry")?.addEventListener("click", () => start());
  $("restart")?.addEventListener("click", () => start());
  $("next")?.addEventListener("click", () =>
    perform(async () => {
      selected++;
      loadDraft();
      history = [];
      snapshot = null;
      inspection = "";
      customText = "";
      lastMessage = "";
      notice("Next shift unlocked.");
    }),
  );
  $("app")
    .querySelectorAll<HTMLButtonElement>("[data-cause]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          perform(async () => {
            const r = await api("diagnose", {
              attemptId: active()!.id,
              cause: button.dataset["cause"],
            });
            accept(r);
            notice(r.explanation ?? "", !r.correct);
          })),
    );
  if (a && !a.ended) {
    board = new Board(
      $("board-host"),
      draft.questions,
      structuredClone(draft.circuit),
      (value) => {
        history.push(structuredClone(draft.circuit));
        if (history.length > 50) history.shift();
        draft.circuit = value;
        save();
        renderInventory();
        updateEvaluation();
      },
      (message) => {
        $("board-message").textContent = message;
      },
    );
    renderInventory();
    $("undo").onclick = () => {
      const previous = history.pop();
      if (previous) {
        draft.circuit = previous;
        save();
        render();
      }
    };
    $("reset").onclick = () => {
      history.push(structuredClone(draft.circuit));
      draft.circuit = { gates: [], wires: [] };
      save();
      render();
    };
    $("app")
      .querySelectorAll<HTMLTextAreaElement>("[data-question]")
      .forEach(
        (input) =>
          (input.oninput = () => {
            const question =
              draft.questions[Number(input.dataset["question"])]!;
            question[input.dataset["field"] as "question" | "yes" | "no"] =
              input.value;
            snapshot = null;
            save();
            updateEvaluation();
          }),
      );
    $("restore-questions").onclick = () => {
      draft.questions = defaultQuestions(shift());
      snapshot = null;
      save();
      render();
      notice("Original questions restored. Evaluate again.");
    };
    $("precise-questions")?.addEventListener("click", () => {
      draft.questions = revisedQuestions(shift());
      snapshot = null;
      save();
      render();
      notice(
        "Repair criteria now require a verified lasting repair. Evaluate again.",
      );
    });
    $("source").onchange = () => {
      source = ($("source") as HTMLSelectElement).value as typeof source;
      $("evaluate").textContent =
        source === "live" ? "Evaluate with Jev" : "Load recorded evidence";
    };
    $("custom-text").oninput = () => {
      customText = ($("custom-text") as HTMLTextAreaElement).value;
      snapshot = null;
      updateEvaluation();
    };
    $("model-mode").onchange = () => {
      draft.mode = ($("model-mode") as HTMLSelectElement).value as ModelMode;
      $("reason-label").hidden = draft.mode !== "independent";
      save();
      updateEvaluation();
    };
    $("reason").oninput = () => {
      draft.reason = ($("reason") as HTMLInputElement).value;
      save();
      updateEvaluation();
    };
    for (const field of ["low", "high"] as const)
      $(`${field}`).oninput = () => {
        draft[field] = Number(($(`${field}`) as HTMLInputElement).value) / 100;
        save();
        updateEvaluation();
      };
    $("inspect").onclick = () =>
      perform(async () => {
        const r = await api("inspect", { attemptId: a.id });
        accept(r);
        inspection = r.evidence ?? "";
        snapshot = null;
        notice(
          "Inspection received. Evaluate the new evidence before running the system.",
        );
      });
    $("evaluate").onclick = () =>
      perform(async () => {
        notice(
          source === "live"
            ? "Jev is reading this report with your questions…"
            : "Loading the matching recorded Jev response…",
        );
        const r = await api("evaluate", {
          attemptId: a.id,
          questions: draft.questions,
          source,
          text: customText,
        });
        accept(r);
        snapshot = r.snapshot ?? null;
        notice(
          snapshot?.source === "live"
            ? "Live Jev response received. Inspect the result before running your system."
            : "Recorded Jev response loaded. The provenance and exact questions are available below.",
        );
      });
    $("run").onclick = () =>
      perform(async () => {
        const r = await api("run", {
          attemptId: a.id,
          snapshotId: snapshot?.id,
          questions: draft.questions,
          circuit: draft.circuit,
          modelMode: draft.mode,
          reason: draft.reason,
          low: draft.low,
          high: draft.high,
        });
        accept(r);
        snapshot = null;
        inspection = "";
        customText = "";
        lastMessage = r.result
          ? `${r.result.correct ? "Correct decision." : r.result.action === "review" ? "Sent to review." : "Decision missed the policy outcome."} ${r.result.consequence} ${r.result.points > 0 ? "+" : ""}${r.result.points} points.`
          : "";
        notice(lastMessage);
      });
    updateEvaluation();
  } else board = null;
  if (busy) lock();
}
function renderInventory() {
  const root = $("inventory");
  if (!root) return;
  root.innerHTML = Object.entries(shift().inventory)
    .map(([kind, count]) => {
      const left =
        count - draft.circuit.gates.filter((g) => g.kind === kind).length;
      return `<button data-add="${kind}" ${left < 1 ? "disabled" : ""} aria-label="Add ${kind} gate"><span aria-hidden="true">${GATES[kind as GateKind].symbol}</span>${kind} × ${Math.max(0, left)}</button>`;
    })
    .join("");
  root
    .querySelectorAll<HTMLButtonElement>("[data-add]")
    .forEach(
      (button) =>
        (button.onclick = () => board?.add(button.dataset["add"] as GateKind)),
    );
  $("undo").toggleAttribute("disabled", history.length === 0);
}
function updateEvaluation() {
  if (!$("probability")) return;
  $("run").setAttribute("disabled", "");
  draft.questions.forEach((q) => {
    $(`marginal-${q.id}`).textContent = "—";
  });
  if (!snapshot || !snapshotMatches()) {
    $("probability").textContent = "—";
    $("expression").textContent = "Evaluate the current report and questions.";
    $("next-action").textContent = "Evaluate first to see the next action.";
    $("model-data").innerHTML = "";
    $("provenance").textContent =
      "No current evidence. Changes to questions require a new evaluation.";
    return;
  }
  $("provenance").textContent =
    `${snapshot.source === "live" ? "Live Jev" : "Recorded Jev response"} · ${snapshot.response.model} · ${new Date(snapshot.recordedAt).toLocaleString()} · request ${snapshot.requestId}${snapshot.custom ? " · unscored custom report" : ""}${snapshot.adjustments?.length ? " · " + snapshot.adjustments.join(" ") : ""}`;
  try {
    const context = makeModel(shift(), snapshot, draft.mode, draft.reason);
    for (const [id, variable] of context.variables)
      $(`marginal-${id}`).textContent = percent(
        evaluateExpression(variable, context.model).probability,
      );
    const joint = makeModel(shift(), snapshot, "joint", "").model;
    const rows = joint.kind === "joint" ? joint.rows : [];
    $("model-data").innerHTML =
      `<details><summary>Inspect the evidence distribution</summary><div class="table-scroll"><table><thead><tr>${shift().category ? "<th>Status</th>" : draft.questions.map((q) => `<th>${q.id}</th>`).join("")}<th>Probability</th></tr></thead><tbody>${rows.map((row) => `<tr>${row.values.map((value) => `<td>${esc(typeof value === "boolean" ? (value ? "True" : "False") : String(value))}</td>`).join("")}<td>${percent(row.probability)}</td></tr>`).join("")}</tbody></table></div><p>This is the supplied joint ${shift().category ? "status" : "evidence"} distribution.${draft.mode === "independent" ? " The active comparison replaces dependence with independent marginals from this same table." : ""}</p></details><details><summary>Exact questions and response</summary><pre>${esc(JSON.stringify({ report: snapshot.text, questions: snapshot.questions, answers: snapshot.response.answers, originalResponse: snapshot.rawResponse, adjustments: snapshot.adjustments }, null, 2))}</pre></details>`;
    $("model-note").textContent =
      context.model.kind === "independent"
        ? context.model.assumptions[0]!.reason
        : shift().category
          ? "One categorical variable. Failed AND degraded has probability zero."
          : draft.questions.length === 1
            ? "One variable. A AND A has the same probability as A."
            : "Joint evidence preserves the supplied relationships. Exact evaluation does not guarantee that the model interpreted the report correctly.";
    const result = evaluateSystem(
      shift(),
      snapshot,
      draft.circuit,
      draft.mode,
      draft.reason,
    );
    $("probability").textContent = percent(result.probability);
    $("expression").textContent = result.expression;
    result.marginals.forEach((item) => {
      $(`marginal-${item.id}`).textContent = percent(item.probability);
    });
    let comparison = "";
    if (draft.questions.length > 1 && !shift().category) {
      const alternative = evaluateSystem(
        shift(),
        snapshot,
        draft.circuit,
        draft.mode === "joint" ? "independent" : "joint",
        "Comparison only: replace dependence with independent marginals.",
      );
      comparison = ` ${draft.mode === "joint" ? "Independent comparison" : "Joint comparison"}: ${percent(alternative.probability)}.`;
    }
    const action = decisionFor(result.probability, draft.low, draft.high);
    $("next-action").textContent =
      `Next action: ${action === "dispatch" ? "dispatch a drone" : action === "wait" ? "wait" : "manual review"}.${comparison}`;
    $("run").toggleAttribute(
      "disabled",
      snapshot.custom ||
        Boolean(customText.trim()) ||
        (action === "dispatch" && active()!.drones < 1),
    );
    if (snapshot.custom)
      $("next-action").textContent +=
        " Unscored sandbox: clear your custom text and evaluate the campaign report to continue.";
  } catch (error) {
    $("probability").textContent = "—";
    $("expression").textContent =
      error instanceof Error ? error.message : "Complete the circuit.";
    $("next-action").textContent =
      "Resolve the circuit or model issue before running the system.";
  }
}
function start() {
  return perform(async () => {
    const r = await api("start", { shiftId: shift().id });
    accept(r);
    snapshot = null;
    inspection = "";
    customText = "";
    lastMessage = "";
    history = [];
    notice(
      "Shift started. Define the questions, wire the rule, and evaluate the first report.",
    );
  });
}
$("help").onclick = () => ($("help-dialog") as HTMLDialogElement).showModal();
$("close-help").onclick = () => ($("help-dialog") as HTMLDialogElement).close();
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && board?.pending) {
    board.pending = null;
    board.render();
    notice("Connection cancelled.");
  }
});
window.addEventListener("resize", () => board?.draw());
async function boot() {
  try {
    const [status, state] = await Promise.all([
      fetch("/api/status").then((r) => r.json()) as Promise<{
        live: boolean;
        model: string;
      }>,
      api<Session>("session"),
    ]);
    session = state;
    liveAvailable = status.live;
    source = liveAvailable ? "live" : "recorded";
    $("service").textContent = liveAvailable
      ? "Live Jev connected"
      : "Recorded mode · live not configured";
    selected = Math.max(
      0,
      SHIFTS.findIndex((s) => s.id === session.attempt?.shiftId),
    );
    loadDraft();
    snapshot = active()?.snapshot ?? null;
    if (snapshot && !snapshotMatches()) snapshot = null;
    if (active()?.revision) {
      const r = await api("evidence", { attemptId: active()!.id });
      inspection = r.evidence ?? "";
    }
    save();
    render();
  } catch (error) {
    $("app").innerHTML =
      '<div class="loading"><h1>The station is offline.</h1><p>Start the game server with <code>npm run game</code>, then reload this page.</p><button id="reload">Retry connection</button></div>';
    $("reload").onclick = () => void boot();
    notice(
      error instanceof Error ? error.message : "Cannot reach the game server.",
      true,
    );
  }
}
void boot();
