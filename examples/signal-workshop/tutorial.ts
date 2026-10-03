import { LEVELS as ALL_LEVELS, GATES } from "./levels.js";
import type { Circuit, GateKind, Level } from "./levels.js";
import { checkCircuit, previewCircuit, targetProbability } from "./engine.js";

const LEVELS = ALL_LEVELS.slice(0, 2);
type Mode = "build" | "decode";
interface Save {
  build: string[];
  decode: string[];
  drafts: Record<string, Circuit>;
  level: Record<Mode, number>;
}
const STORAGE_KEY = "conjevture:night-shift:training:v1";
const emptyCircuit = (): Circuit => ({ gates: [], wires: [] });
const clone = (value: Circuit): Circuit => structuredClone(value);
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
};
const escape = (value: string): string => value.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);
const percent = (value: number): string => `${Number((value * 100).toFixed(2))}%`;
const isGateKind = (value: string): value is GateKind => Object.hasOwn(GATES, value);
function validDraft(value: unknown, level: Level): value is Circuit {
  if (!value || typeof value !== "object") return false;
  const circuit = value as Circuit;
  if (!Array.isArray(circuit.gates) || !Array.isArray(circuit.wires) || circuit.gates.length > 3 || circuit.wires.length > 8) return false;
  const ids = new Set(level.inputs.map(input => input.id));
  for (const gate of circuit.gates) {
    if (!gate || typeof gate.id !== "string" || !/^g\d{1,8}$/.test(gate.id) || ids.has(gate.id)
      || !isGateKind(gate.kind) || !level.inventory[gate.kind] || !Number.isFinite(gate.x) || !Number.isFinite(gate.y)
      || gate.x < 220 || gate.x > 690 || gate.y < 20 || gate.y > 340) return false;
    ids.add(gate.id);
  }
  if (Object.keys(GATES).some(kind => circuit.gates.filter(gate => gate.kind === kind).length > (level.inventory[kind as GateKind] ?? 0))) return false;
  return circuit.wires.every(wire => wire && ids.has(wire.from) && (wire.to === "out" || circuit.gates.some(gate => gate.id === wire.to))
    && Number.isInteger(wire.port) && wire.port >= 0 && wire.port < (wire.to === "out" ? 1 : GATES[circuit.gates.find(gate => gate.id === wire.to)!.kind].ports));
}
let storageAvailable = true;
function loadSave(): Save {
  const clean: Save = { build: [], decode: [], drafts: {}, level: { build: 0, decode: 0 } };
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Save> | null;
    if (!data || typeof data !== "object") return clean;
    for (const mode of ["build", "decode"] as const) {
      if (Array.isArray(data[mode])) clean[mode] = [...new Set(data[mode].filter(id => LEVELS.some(level => level.id === id)))];
      const index = data.level?.[mode];
      if (typeof index === "number" && Number.isInteger(index) && index >= 0 && index < LEVELS.length
        && (index === 0 || clean[mode].includes(LEVELS[index - 1]!.id))) clean.level[mode] = index;
    }
    for (const level of LEVELS) {
      const draft = data.drafts?.[level.id];
      if (validDraft(draft, level)) clean.drafts[level.id] = draft;
    }
  } catch { /* Invalid saved data is discarded. Storage can be unavailable in private contexts. */ }
  return clean;
}
const save = loadSave();
let mode: Mode = "build";
let levelIndex = save.level.build;
let circuit = clone(save.drafts[LEVELS[levelIndex]!.id] ?? emptyCircuit());
let history: Circuit[] = [];
let pending: string | null = null;
let serial = Math.max(0, ...circuit.gates.map(gate => Number(gate.id.slice(1))));
const level = (): Level => LEVELS[levelIndex]!;
const shownCircuit = (): Circuit => mode === "build" ? circuit : level().blueprint;
function persist(): void {
  save.level[mode] = levelIndex;
  if (mode === "build") save.drafts[level().id] = clone(circuit);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(save)); }
  catch {
    storageAvailable = false;
    $("connection-help").textContent = "Browser storage is unavailable. You can play, but progress lasts only for this session.";
  }
}
function record(): void {
  history.push(clone(circuit));
  if (history.length > 50) history.shift();
}
function notify(message: string): void { $("connection-help").textContent = message; }
function invalidate(): void {
  $("result").hidden = true;
  $("next-button").hidden = true;
}
function updateCircuit(message = "Choose an output dot, then an input dot. Select a connected input to remove its wire."): void {
  invalidate();
  pending = null;
  renderInventory();
  renderBoard();
  renderConnections();
  renderPreview();
  notify(message);
  persist();
}
function renderLevels(): void {
  $("level-list").innerHTML = LEVELS.map((item, index) => {
    const complete = save[mode].includes(item.id);
    const unlocked = index === 0 || save[mode].includes(LEVELS[index - 1]!.id);
    return `<button class="level-button ${complete ? "complete" : ""}" data-level="${index}" ${index === levelIndex ? 'aria-current="step"' : ""} ${unlocked ? "" : "disabled"} aria-label="Level ${index + 1}: ${item.title}${complete ? ", completed" : unlocked ? "" : ", locked"}"><span class="level-number">${complete ? "✓" : String(index + 1).padStart(2, "0")}</span><span class="level-name">${item.title}<small>${complete ? "Complete" : index === levelIndex ? "In progress" : unlocked ? "Ready to play" : "Locked"}</small></span></button>`;
  }).join("");
  $("progress-count").textContent = `${save[mode].length} / ${LEVELS.length}`;
  $("progress-fill").style.transform = `scaleX(${save[mode].length / LEVELS.length})`;
}
function renderInventory(): void {
  const total = Object.values(level().inventory).reduce((sum, count) => sum + count, 0);
  $("gate-count").textContent = mode === "decode" ? `${total} gate${total === 1 ? "" : "s"}` : `${circuit.gates.length} / ${total} gates placed`;
  $("inventory").hidden = mode === "decode";
  $("inventory").innerHTML = Object.entries(level().inventory).map(([kind, count]) => {
    const remaining = count - circuit.gates.filter(gate => gate.kind === kind).length;
    return `<button class="gate-token" data-add="${kind}" ${remaining ? "" : "disabled"} aria-label="Add ${kind} gate, ${remaining} available"><span class="token-symbol" aria-hidden="true">${GATES[kind as GateKind].symbol}</span><strong>${kind}</strong><small>× ${remaining}</small><span aria-hidden="true">＋</span></button>`;
  }).join("");
  $("undo-button").hidden = mode === "decode";
  $("reset-button").hidden = mode === "decode";
  $("undo-button").toggleAttribute("disabled", history.length === 0);
}
function sourceName(id: string): string {
  const source = level().inputs.find(input => input.id === id);
  if (source) return `${source.id} · ${source.label}`;
  const gate = shownCircuit().gates.find(item => item.id === id);
  return gate ? `${gate.id.toUpperCase()} · ${gate.kind}` : id;
}
function outputPort(id: string): string {
  return `<button class="port output-port" data-from="${id}" aria-label="${escape(sourceName(id))} output" ${mode === "decode" ? "disabled" : ""}></button>`;
}
function inputPort(id: string, port: number, top: number): string {
  const connected = shownCircuit().wires.some(wire => wire.to === id && wire.port === port);
  const label = id === "out" ? level().output : sourceName(id);
  return `<button class="port input-port ${connected ? "connected" : ""}" style="top:${top}%" data-to="${id}" data-port="${port}" aria-label="${escape(label)} input ${port + 1}${connected ? ", connected" : ""}" ${mode === "decode" ? "disabled" : ""}></button>`;
}
function renderBoard(): void {
  const active = document.activeElement?.getAttribute("aria-label");
  const data = shownCircuit();
  const positions = level().inputs.length === 1 ? [185] : level().inputs.length === 2 ? [95, 265] : [35, 180, 325];
  $("nodes").innerHTML = level().inputs.map((input, index) => `<div class="node input-node" style="left:3.5%;top:${positions[index]! / 440 * 100}%"><span class="node-id">Input ${input.id}</span><span class="node-label">${input.label}</span><span class="node-probability">${percent(input.probability)}</span>${outputPort(input.id)}</div>`).join("")
    + data.gates.map(gate => `<div class="node gate-node" data-gate="${gate.id}" style="left:${gate.x / 10}%;top:${gate.y / 440 * 100}%"><div class="gate-head" data-drag="${gate.id}">${gate.id.toUpperCase()}${mode === "build" ? " · drag" : ""}</div>${mode === "build" ? `<button class="remove-gate" data-remove="${gate.id}" aria-label="Remove ${gate.kind} gate ${gate.id.toUpperCase()}">×</button>` : ""}<div class="gate-face"><span aria-hidden="true">${GATES[gate.kind].symbol}</span>${gate.kind}</div>${inputPort(gate.id, 0, gate.kind === "NOT" ? 50 : 36)}${gate.kind === "NOT" ? "" : inputPort(gate.id, 1, 77)}${outputPort(gate.id)}</div>`).join("")
    + `<div class="node output-node" style="left:81.5%;top:${185 / 440 * 100}%"><span class="node-id">Outcome</span><span class="node-label">${level().output}</span><span class="node-probability" id="out-value">Connect me</span>${inputPort("out", 0, 50)}</div>`;
  $("board-tip").hidden = data.gates.length > 0;
  $("board-tip").innerHTML = "<span aria-hidden=\"true\">↓</span>A little logic goes here.<br>Add a gate from the tray above.";
  $("cancel-wire").hidden = true;
  if (active) [...$("nodes").querySelectorAll<HTMLButtonElement>("button")].find(button => button.getAttribute("aria-label") === active)?.focus({ preventScroll: true });
  drawWires();
}
function point(selector: string): { x: number; y: number } | null {
  const element = $("nodes").querySelector<HTMLElement>(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const board = $("board").getBoundingClientRect();
  return { x: (rect.x + rect.width / 2 - board.x) / board.width * 1000, y: (rect.y + rect.height / 2 - board.y) / board.height * 440 };
}
function path(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const bend = Math.max(45, Math.abs(to.x - from.x) * .45);
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
}
function drawWires(cursor?: { x: number; y: number }): void {
  const paths = shownCircuit().wires.map(wire => {
    const from = point(`[data-from="${wire.from}"]`);
    const to = point(`[data-to="${wire.to}"][data-port="${wire.port}"]`);
    return from && to ? `<path class="wire" d="${path(from, to)}"/>` : "";
  });
  if (pending && cursor) {
    const from = point(`[data-from="${pending}"]`);
    if (from) paths.push(`<path class="wire pending" d="${path(from, cursor)}"/>`);
  }
  document.getElementById("wires")!.innerHTML = paths.join("");
}
function renderConnections(): void {
  const data = shownCircuit();
  const destinations = [...data.gates.flatMap(gate => Array.from({ length: GATES[gate.kind].ports }, (_, port) => ({ id: gate.id, port, label: `${gate.id.toUpperCase()} ${gate.kind} · input ${port + 1}` }))), { id: "out", port: 0, label: level().output }];
  $("connection-fields").innerHTML = destinations.map(destination => {
    const selected = data.wires.find(wire => wire.to === destination.id && wire.port === destination.port)?.from ?? "";
    const sources = [...level().inputs.map(input => input.id), ...data.gates.map(gate => gate.id)].filter(id => id !== destination.id);
    return `<label class="connection-field">${destination.label}<select data-connect="${destination.id}" data-port="${destination.port}" ${mode === "decode" ? "disabled" : ""}><option value="">Not connected</option>${sources.map(id => `<option value="${id}" ${selected === id ? "selected" : ""}>${escape(sourceName(id))}</option>`).join("")}</select></label>`;
  }).join("");
}
function renderSignals(): void {
  $("signals").innerHTML = level().inputs.map(input => `<div class="signal"><div class="signal-label"><span class="signal-letter">${input.id}</span>${input.label}</div><div class="signal-value"><span>Probability of true</span><strong>${percent(input.probability)}</strong></div><div class="signal-track"><span style="width:${input.probability * 100}%"></span></div></div>`).join("");
  $("model-title").textContent = level().joint ? "Related signals" : level().inputs.length === 1 ? "One signal, one identity" : "Independent signals";
  $("model-description").textContent = level().joint
    ? `A and B share a joint distribution.${level().inputs.length === 3 ? " C is assumed independent of this pair." : " Use their joint probability, not the product of their separate probabilities."}`
    : level().inputs.length === 1 ? "Reusing a signal does not create a new, independent observation." : "This puzzle assumes the input signals are independent. One signal does not change the probability of another.";
  $("joint-table").innerHTML = level().joint ? `<table><caption class="sr-only">Joint probabilities of A and B</caption><thead><tr><th>A</th><th>B</th><th>Probability</th></tr></thead><tbody>${level().joint!.map((probability, index) => `<tr><td>${index & 1 ? "True" : "False"}</td><td>${index & 2 ? "True" : "False"}</td><td>${percent(probability)}</td></tr>`).join("")}</tbody></table>` : "";
  $("model-api").innerHTML = level().joint ? "Uses <code>fromJointChoice()</code> for the pair and <code>fromNoul()</code> for any remaining input." : "Uses <code>fromNoul()</code> to convert each answer and records each independence assumption.";
  $("gate-guide").innerHTML = Object.keys(level().inventory).map(kind => {
    const gate = GATES[kind as GateKind];
    const values = kind === "NOT" ? [[0, 1], [1, 0]] : [0, 1, 2, 3].map(mask => {
      const a = mask & 1 ? 1 : 0; const b = mask & 2 ? 1 : 0;
      return [a, b, kind === "AND" ? a & b : kind === "OR" ? a | b : a ^ b];
    });
    return `<div class="guide-item"><strong>${gate.symbol} ${kind}</strong><p>${gate.description}</p><table><caption class="sr-only">${kind} truth table; 1 is true, 0 is false</caption><thead><tr><th>In</th>${kind === "NOT" ? "" : "<th>In</th>"}<th>Out</th></tr></thead><tbody>${values.map(row => `<tr>${row.map(value => `<td>${value}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }).join("");
}
function renderPreview(): void {
  if (mode === "decode") {
    $("live-probability").textContent = "?";
    $("out-value").textContent = "What chance?";
    $("preview-caption").textContent = "Use the signals and their relationships.";
    return;
  }
  try {
    const result = previewCircuit(level(), circuit);
    $("live-probability").textContent = percent(result.probability);
    $("out-value").textContent = percent(result.probability);
    $("preview-caption").textContent = "Live result · test the rule to verify it.";
  } catch {
    $("live-probability").textContent = "—";
    $("out-value").textContent = "Connect me";
    $("preview-caption").textContent = "Complete the connections to see a result.";
  }
}
function renderDecode(): void {
  $("decode-panel").hidden = mode !== "decode";
  if (mode !== "decode") return;
  // Rotate correct answers so the first option is not always correct.
  const options = [level().sentence, ...level().alternatives];
  const offset = (levelIndex + 1) % 3;
  $("sentence-options").innerHTML = options.map((_, index) => {
    const value = (index + offset) % 3;
    return `<label class="answer-option"><input type="radio" name="meaning" value="${value}"><span>${escape(options[value]!)}</span></label>`;
  }).join("");
  const target = Number((targetProbability(level()) * 100).toFixed(2));
  const values = [...new Set([target, Number((100 - target).toFixed(2)), 0, 100, Number((target * .7).toFixed(2))])].sort((a, b) => a - b);
  $("probability-answer").innerHTML = '<option value="">Choose a probability</option>' + values.map(value => `<option value="${value}">${value}%</option>`).join("");
}
function render(): void {
  invalidate();
  pending = null;
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset["mode"] === mode)));
  $("level-counter").textContent = `Level ${String(levelIndex + 1).padStart(2, "0")} / ${String(LEVELS.length).padStart(2, "0")}`;
  $("level-title").textContent = level().title;
  $("lesson-tag").textContent = level().lesson;
  $("sentence").innerHTML = mode === "build" ? escape(level().sentence).replace(/\b(AND|OR|NOT|SAME)\b/g, '<span class="logic-word">$1</span>') : "Every circuit tells a story.<br>Read this one from left to right.";
  const count = Object.values(level().inventory).reduce((sum, value) => sum + value, 0);
  $("mission-goal").textContent = mode === "build" ? `Use all ${count} gate${count === 1 ? "" : "s"} · Match all ${2 ** level().inputs.length} input combinations` : "Choose the matching rule and the exact probability.";
  $("hint").hidden = true;
  $("hint").textContent = mode === "build" ? level().hint : "Read each gate in order. A repeated input is still the same signal. Use the joint table for related inputs.";
  $("hint-button").textContent = "Show a hint";
  $("hint-button").setAttribute("aria-expanded", "false");
  $("workbench-title").textContent = mode === "build" ? "Your workbench" : "The circuit to read";
  $("check-button").innerHTML = `${mode === "build" ? "Test circuit" : "Check answer"} <span aria-hidden="true">↗</span>`;
  renderLevels(); renderInventory(); renderBoard(); renderConnections(); renderSignals(); renderPreview(); renderDecode();
  notify(mode === "build" ? (circuit.gates.length ? "Choose an output dot, then an input dot. You can also use the Connections controls." : "Add a gate to begin. Then connect an output dot to an input dot.") : "Follow each wire from an input, through the gates, to the outcome.");
  if (!storageAvailable) notify("Browser storage is unavailable. Progress lasts only for this session.");
}
function chooseLevel(index: number): void {
  if (!LEVELS[index] || (index !== 0 && !save[mode].includes(LEVELS[index - 1]!.id))) return;
  persist();
  levelIndex = index;
  circuit = clone(save.drafts[level().id] ?? emptyCircuit());
  serial = Math.max(serial, ...circuit.gates.map(gate => Number(gate.id.slice(1))));
  history = [];
  render(); persist();
}
function connect(from: string, to: string, port: number): void {
  if (mode !== "build") return;
  if (from === to) { notify("A gate cannot connect to itself. Choose another output."); return; }
  // Reject indirect loops before changing the graph.
  const downstream = (id: string, visited = new Set<string>()): boolean => {
    if (id === from) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    return circuit.wires.filter(wire => wire.from === id).some(wire => downstream(wire.to, visited));
  };
  if (from && downstream(to)) { notify("That wire would create a loop. Choose an earlier signal."); renderConnections(); return; }
  record();
  circuit.wires = circuit.wires.filter(wire => !(wire.to === to && wire.port === port));
  if (from) circuit.wires.push({ from, to, port });
  updateCircuit(from ? `Connected ${sourceName(from)} to ${to === "out" ? level().output : to.toUpperCase()} input ${port + 1}.` : "Connection removed.");
}
function showResult(passed: boolean, title: string, message: string): void {
  const panel = $("result");
  panel.hidden = false; panel.className = `result ${passed ? "success" : "failure"}`;
  $("result-title").textContent = title;
  $("result-message").textContent = message;
  $("result-score").textContent = "";
  $("result-expression").textContent = "";
  $("truth-table").innerHTML = "";
  $("next-button").hidden = !passed || levelIndex === LEVELS.length - 1;
  if (passed) {
    if (!save[mode].includes(level().id)) save[mode].push(level().id);
    renderLevels(); persist();
    if (save[mode].length === LEVELS.length) $("result-title").textContent = `${mode === "build" ? "Builder" : "Circuit reader"} journey complete!`;
  }
  panel.setAttribute("tabindex", "-1"); panel.focus({ preventScroll: true });
  panel.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "nearest" });
}
function check(): void {
  if (mode === "decode") {
    const meaning = document.querySelector<HTMLInputElement>('input[name="meaning"]:checked');
    const answer = $("probability-answer") as HTMLSelectElement;
    if (!meaning || answer.value === "") { showResult(false, "Two pieces to the answer", "Choose a rule and a probability before checking."); return; }
    const correctMeaning = meaning.value === "0";
    const correctProbability = Math.abs(Number(answer.value) / 100 - targetProbability(level())) < 1e-9;
    const passed = correctMeaning && correctProbability;
    showResult(passed, passed ? "You read it right." : "Take another look.", passed ? level().explanation : `${correctMeaning ? "The rule is correct." : "The rule does not match the circuit."} ${correctProbability ? "The probability is correct." : "Recheck the probability using the signals and their relationships."}`);
    if (passed) { $("live-probability").textContent = percent(targetProbability(level())); $("out-value").textContent = percent(targetProbability(level())); }
    return;
  }
  try {
    const result = checkCircuit(level(), circuit);
    const mismatch = result.rows.find(row => row.actual !== row.expected);
    const counterexample = mismatch ? level().inputs.map((input, index) => `${input.id} is ${mismatch.values[index] ? "true" : "false"}`).join(", ") : "";
    showResult(result.passed, result.passed ? "Everything connects." : "The rule needs another look.", result.passed ? level().explanation : `When ${counterexample}, the outcome should be ${mismatch!.expected ? "true" : "false"}. Your circuit returns ${mismatch!.actual ? "true" : "false"}.`);
    $("result-score").textContent = `${result.rows.filter(row => row.actual === row.expected).length} / ${result.rows.length} checks passed`;
    $("result-expression").textContent = `${result.expression} → ${percent(result.evaluation.probability)}`;
    $("truth-table").innerHTML = `<table><caption class="sr-only">Every input combination, expected outcome, and your circuit outcome</caption><thead><tr>${level().inputs.map(input => `<th>${input.id}</th>`).join("")}<th>Expected</th><th>Your circuit</th><th>Check</th></tr></thead><tbody>${result.rows.map(row => `<tr class="${row.expected === row.actual ? "" : "mismatch"}">${row.values.map(value => `<td>${value ? "True" : "False"}</td>`).join("")}<td>${row.expected ? "True" : "False"}</td><td>${row.actual ? "True" : "False"}</td><td>${row.expected === row.actual ? "✓ Pass" : "× Fail"}</td></tr>`).join("")}</tbody></table>`;
  } catch (error) { showResult(false, "Check your circuit.", error instanceof Error ? error.message : "Check the connections and try again."); }
}

$("inventory").addEventListener("click", event => {
  const kind = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-add]")?.dataset["add"];
  if (!kind || !isGateKind(kind) || circuit.gates.filter(gate => gate.kind === kind).length >= (level().inventory[kind] ?? 0)) return;
  record();
  const multi = Object.keys(level().inventory).length > 1;
  const position = multi ? kind === "AND" ? [590, 185] : kind === "NOT" ? [300, 285] : [300, 85] : [430, 185];
  const id = `g${++serial}`;
  circuit.gates.push({ id, kind, x: position[0]!, y: position[1]! });
  updateCircuit(`${kind} added. Connect a signal output to one of its inputs.`);
  $("nodes").querySelector<HTMLButtonElement>(`[data-to="${id}"]`)?.focus({ preventScroll: true });
});
$("nodes").addEventListener("click", event => {
  if (mode !== "build") return;
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!target) return;
  const remove = target.dataset["remove"];
  if (remove) {
    record(); circuit.gates = circuit.gates.filter(gate => gate.id !== remove);
    circuit.wires = circuit.wires.filter(wire => wire.from !== remove && wire.to !== remove);
    updateCircuit("Gate returned to the tray. Its wires were removed.");
    $("inventory").querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  } else if (target.dataset["from"]) {
    pending = pending === target.dataset["from"] ? null : target.dataset["from"];
    document.querySelectorAll<HTMLElement>("[data-from]").forEach(button => button.classList.toggle("selected", button.dataset["from"] === pending));
    $("cancel-wire").hidden = pending === null;
    notify(pending ? `${sourceName(pending)} selected. Choose an input socket. Press Escape to cancel.` : "Connection cancelled.");
    drawWires();
  } else if (target.dataset["to"]) {
    const to = target.dataset["to"]; const port = Number(target.dataset["port"]);
    if (pending) connect(pending, to, port);
    else if (circuit.wires.some(wire => wire.to === to && wire.port === port)) connect("", to, port);
    else notify("Choose an output dot first, then this input dot.");
  }
});
$("connection-fields").addEventListener("change", event => {
  const select = event.target as HTMLSelectElement;
  const to = select.dataset["connect"];
  if (!to) return;
  const port = Number(select.dataset["port"]);
  connect(select.value, to, port);
  $("connection-fields").querySelector<HTMLSelectElement>(`[data-connect="${to}"][data-port="${port}"]`)?.focus({ preventScroll: true });
});
let drag: { id: string; pointer: number; startX: number; startY: number; x: number; y: number; before: Circuit; moved: boolean } | null = null;
$("nodes").addEventListener("pointerdown", event => {
  const handle = (event.target as HTMLElement).closest<HTMLElement>("[data-drag]");
  if (mode !== "build" || !handle || event.button !== 0) return;
  const gate = circuit.gates.find(item => item.id === handle.dataset["drag"])!;
  drag = { id: gate.id, pointer: event.pointerId, startX: event.clientX, startY: event.clientY, x: gate.x, y: gate.y, before: clone(circuit), moved: false };
  $("nodes").setPointerCapture(event.pointerId);
  event.preventDefault();
});
$("board").addEventListener("pointermove", event => {
  const rect = $("board").getBoundingClientRect();
  if (drag) {
    const gate = circuit.gates.find(item => item.id === drag!.id)!;
    const dx = (event.clientX - drag.startX) / rect.width * 1000;
    const dy = (event.clientY - drag.startY) / rect.height * 440;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    gate.x = Math.max(220, Math.min(690, drag.x + dx)); gate.y = Math.max(20, Math.min(340, drag.y + dy));
    const node = $("nodes").querySelector<HTMLElement>(`[data-gate="${gate.id}"]`)!;
    node.style.left = `${gate.x / 10}%`; node.style.top = `${gate.y / 440 * 100}%`;
    drawWires();
  } else if (pending) drawWires({ x: (event.clientX - rect.x) / rect.width * 1000, y: (event.clientY - rect.y) / rect.height * 440 });
});
function endDrag(): void {
  if (drag?.moved) { history.push(drag.before); if (history.length > 50) history.shift(); $("undo-button").removeAttribute("disabled"); persist(); }
  drag = null;
}
$("nodes").addEventListener("pointerup", endDrag);
$("nodes").addEventListener("pointercancel", endDrag);
$("nodes").addEventListener("lostpointercapture", endDrag);
$("level-list").addEventListener("click", event => {
  const index = (event.target as HTMLElement).closest<HTMLElement>("[data-level]")?.dataset["level"];
  if (index !== undefined) chooseLevel(Number(index));
});
document.querySelectorAll<HTMLElement>("[data-mode]").forEach(button => button.addEventListener("click", () => {
  const nextMode = button.dataset["mode"] as Mode;
  if (nextMode === mode) return;
  persist(); mode = nextMode; levelIndex = save.level[mode];
  circuit = clone(save.drafts[level().id] ?? emptyCircuit()); history = [];
  serial = Math.max(serial, ...circuit.gates.map(gate => Number(gate.id.slice(1))));
  render(); persist();
}));
$("undo-button").addEventListener("click", () => { const previous = history.pop(); if (previous) { circuit = previous; updateCircuit("Last change undone."); } });
$("reset-button").addEventListener("click", () => { record(); circuit = emptyCircuit(); updateCircuit("Workbench cleared. Use Undo to restore it."); });
function cancelWire(): void { pending = null; $("cancel-wire").hidden = true; document.querySelectorAll(".port.selected").forEach(port => port.classList.remove("selected")); drawWires(); notify("Connection cancelled. Choose an output to begin again."); }
$("cancel-wire").addEventListener("click", cancelWire);
document.addEventListener("keydown", event => { if (event.key === "Escape" && pending) cancelWire(); });
$("hint-button").addEventListener("click", () => { const hint = $("hint"); hint.hidden = !hint.hidden; $("hint-button").setAttribute("aria-expanded", String(!hint.hidden)); $("hint-button").textContent = hint.hidden ? "Show a hint" : "Hide hint"; });
$("check-button").addEventListener("click", check);
$("next-button").addEventListener("click", () => { chooseLevel(levelIndex + 1); $("level-title").scrollIntoView({ block: "start" }); });
$("sentence-options").addEventListener("change", invalidate);
$("probability-answer").addEventListener("change", invalidate);
$("help-button").addEventListener("click", () => ($("help-dialog") as HTMLDialogElement).showModal());
$("close-help").addEventListener("click", () => ($("help-dialog") as HTMLDialogElement).close());
new ResizeObserver(() => drawWires()).observe($("board"));
// The form is the primary way to connect sockets on a narrow screen.
$("connection-editor").toggleAttribute("open", matchMedia("(max-width: 760px)").matches);
render();
