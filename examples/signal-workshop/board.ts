import { GATES } from "./levels.js";
import type { Circuit, GateKind } from "./levels.js";
import type { Judgment } from "./campaign.js";
export const esc = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export class Board {
  pending: string | null = null;
  constructor(
    private root: HTMLElement,
    private questions: Judgment[],
    public circuit: Circuit,
    private changed: (value: Circuit) => void,
    private message: (text: string) => void,
  ) {
    this.render();
  }
  commit(value: Circuit) {
    this.pending = null;
    this.circuit = value;
    this.changed(structuredClone(value));
    this.render();
  }
  add(kind: GateKind) {
    const value = structuredClone(this.circuit);
    let number = 1;
    while (value.gates.some((g) => g.id === `g${number}`)) number++;
    const multi = this.questions.length === 3;
    value.gates.push({
      id: `g${number}`,
      kind,
      x: multi ? (kind === "AND" ? 580 : 290) : 430,
      y: multi ? (kind === "OR" ? 70 : kind === "NOT" ? 280 : 180) : 180,
    });
    this.commit(value);
  }
  connect(from: string, to: string, port: number) {
    if (from === to) {
      this.message("A gate cannot feed itself.");
      return;
    }
    const reaches = (id: string, seen = new Set<string>()): boolean => {
      if (id === from) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return this.circuit.wires
        .filter((w) => w.from === id)
        .some((w) => reaches(w.to, seen));
    };
    if (from && reaches(to)) {
      this.message("That wire creates a loop. Choose an earlier signal.");
      this.render();
      return;
    }
    const value = structuredClone(this.circuit);
    value.wires = value.wires.filter((w) => !(w.to === to && w.port === port));
    if (from) value.wires.push({ from, to, port });
    this.commit(value);
    this.message(
      from
        ? "Connection made. Reusing an output preserves its identity."
        : "Connection removed.",
    );
  }
  name(id: string) {
    return (
      this.questions.find((q) => q.id === id)?.label ??
      this.circuit.gates.find((g) => g.id === id)?.kind ??
      "Dispatch"
    );
  }
  render() {
    const expanded =
      this.root.querySelector<HTMLDetailsElement>(".connections")?.open ??
      matchMedia("(max-width:760px)").matches;
    const focus = (document.activeElement as HTMLElement | null)?.dataset[
      "focus"
    ];
    const port = (id: string, index: number, top: number) =>
      `<button class="port in ${this.circuit.wires.some((w) => w.to === id && w.port === index) ? "wired" : ""}" style="top:${top}%" data-to="${id}" data-port="${index}" aria-label="${esc(id === "out" ? "Dispatch" : id + " " + this.name(id))} input ${index + 1}"></button>`;
    const out = (id: string) =>
      `<button class="port out ${this.pending === id ? "selected" : ""}" data-from="${id}" aria-label="${esc(id + " " + this.name(id))} output"></button>`;
    const ys =
      this.questions.length === 1
        ? [175]
        : this.questions.length === 2
          ? [90, 270]
          : [35, 180, 325];
    this.root.innerHTML = `<div class="board-scroll" tabindex="0" role="region" aria-label="Circuit board. Scroll horizontally on a phone."><div class="board"><svg viewBox="0 0 1000 440" aria-hidden="true"></svg><div class="nodes">${this.questions.map((q, i) => `<div class="node input-node" style="left:3%;top:${ys[i]! / 4.4}%"><small>Judgment ${q.id}</small><strong>${esc(q.label)}</strong>${out(q.id)}</div>`).join("")}${this.circuit.gates.map((g) => `<div class="node gate-node" data-gate="${g.id}" style="left:${g.x / 10}%;top:${g.y / 4.4}%"><span class="drag" data-drag="${g.id}">${g.id.toUpperCase()} · move</span><button class="remove" data-remove="${g.id}" aria-label="Remove ${g.kind} ${g.id}">×</button><strong>${GATES[g.kind].symbol} ${g.kind}</strong>${port(g.id, 0, g.kind === "NOT" ? 55 : 36)}${g.kind === "NOT" ? "" : port(g.id, 1, 78)}${out(g.id)}</div>`).join("")}<div class="node outcome" style="left:81%;top:41%"><small>Policy condition</small><strong>Dispatch</strong>${port("out", 0, 55)}</div>${this.circuit.gates.length ? "" : '<p class="board-empty">Add a gate from the tray.<br>Then connect the judgments.</p>'}</div></div></div><details class="connections" ${expanded ? "open" : ""}><summary>Connect sockets · keyboard and touch</summary><div class="connection-fields">${[
      ...this.circuit.gates.flatMap((g) =>
        Array.from({ length: GATES[g.kind].ports }, (_, port) => ({
          id: g.id,
          port,
          label: `${g.id.toUpperCase()} ${g.kind} · input ${port + 1}`,
        })),
      ),
      { id: "out", port: 0, label: "Dispatch input" },
    ]
      .map((item) => {
        const selected = this.circuit.wires.find(
          (w) => w.to === item.id && w.port === item.port,
        )?.from;
        return `<label>${item.label}<select data-connect="${item.id}" data-port="${item.port}" data-focus="${item.id}-${item.port}"><option value="">Not connected</option>${[
          ...this.questions.map((q) => q.id),
          ...this.circuit.gates.map((g) => g.id),
        ]
          .filter((id) => id !== item.id)
          .map(
            (id) =>
              `<option value="${id}" ${id === selected ? "selected" : ""}>${esc(id.toUpperCase() + " · " + this.name(id))}</option>`,
          )
          .join("")}</select></label>`;
      })
      .join("")}</div></details>`;
    this.root.querySelectorAll<HTMLButtonElement>("[data-from]").forEach(
      (button) =>
        (button.onclick = () => {
          this.pending =
            this.pending === button.dataset["from"]
              ? null
              : button.dataset["from"]!;
          this.render();
          this.message(
            this.pending
              ? "Output selected. Choose an input dot. Escape cancels."
              : "Connection cancelled.",
          );
        }),
    );
    this.root.querySelectorAll<HTMLButtonElement>("[data-to]").forEach(
      (button) =>
        (button.onclick = () => {
          const to = button.dataset["to"]!,
            port = Number(button.dataset["port"]);
          if (this.pending) this.connect(this.pending, to, port);
          else if (
            this.circuit.wires.some((w) => w.to === to && w.port === port)
          )
            this.connect("", to, port);
          else this.message("Choose an output dot first, then this input.");
        }),
    );
    this.root.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach(
      (button) =>
        (button.onclick = () => {
          const id = button.dataset["remove"];
          this.commit({
            gates: this.circuit.gates.filter((g) => g.id !== id),
            wires: this.circuit.wires.filter(
              (w) => w.from !== id && w.to !== id,
            ),
          });
        }),
    );
    this.root
      .querySelectorAll<HTMLSelectElement>("[data-connect]")
      .forEach(
        (select) =>
          (select.onchange = () =>
            this.connect(
              select.value,
              select.dataset["connect"]!,
              Number(select.dataset["port"]),
            )),
      );
    this.root.querySelectorAll<HTMLElement>("[data-drag]").forEach(
      (handle) =>
        (handle.onpointerdown = (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          handle.setPointerCapture(event.pointerId);
          const before = structuredClone(this.circuit),
            gate = this.circuit.gates.find(
              (g) => g.id === handle.dataset["drag"],
            )!;
          const x = gate.x,
            y = gate.y,
            startX = event.clientX,
            startY = event.clientY,
            rect = this.root.querySelector(".board")!.getBoundingClientRect();
          handle.onpointermove = (e) => {
            gate.x = Math.max(
              220,
              Math.min(680, x + ((e.clientX - startX) / rect.width) * 1000),
            );
            gate.y = Math.max(
              20,
              Math.min(330, y + ((e.clientY - startY) / rect.height) * 440),
            );
            const node = handle.parentElement!;
            node.style.left = `${gate.x / 10}%`;
            node.style.top = `${gate.y / 4.4}%`;
            this.draw();
          };
          const finish = () => {
            handle.onpointermove = null;
            handle.onpointerup = null;
            handle.onpointercancel = null;
            const after = structuredClone(this.circuit);
            this.circuit = before;
            this.commit(after);
          };
          handle.onpointerup = finish;
          handle.onpointercancel = finish;
        }),
    );
    if (focus)
      this.root
        .querySelector<HTMLElement>(`[data-focus="${focus}"]`)
        ?.focus({ preventScroll: true });
    this.draw();
  }
  draw() {
    const board = this.root.querySelector(".board")!;
    const rect = board.getBoundingClientRect();
    const point = (selector: string) => {
      const element = this.root.querySelector(selector);
      if (!element) return null;
      const p = element.getBoundingClientRect();
      return {
        x: ((p.x + p.width / 2 - rect.x) / rect.width) * 1000,
        y: ((p.y + p.height / 2 - rect.y) / rect.height) * 440,
      };
    };
    this.root.querySelector("svg")!.innerHTML = this.circuit.wires
      .map((w) => {
        const a = point(`[data-from="${w.from}"]`),
          b = point(`[data-to="${w.to}"][data-port="${w.port}"]`);
        if (!a || !b) return "";
        const bend = Math.max(45, Math.abs(b.x - a.x) * 0.45);
        return `<path d="M${a.x},${a.y} C${a.x + bend},${a.y} ${b.x - bend},${b.y} ${b.x},${b.y}"/>`;
      })
      .join("");
  }
}
