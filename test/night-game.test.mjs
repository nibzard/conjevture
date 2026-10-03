import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SHIFTS,
  defaultQuestions,
  revisedQuestions,
} from "../.game-build/examples/signal-workshop/campaign.js";
import {
  evaluateSystem,
  makeModel,
  normalizeProvider,
  decisionFor,
  buildQuestions,
  parseQuestions,
  validateCircuit,
} from "../.game-build/examples/signal-workshop/night-engine.js";
import {
  getPrediction,
  recordingName,
} from "../examples/signal-workshop/provider.mjs";
import { createGameServer } from "../examples/signal-workshop/serve.mjs";
import {
  OUTCOMES,
  scoreDecision,
} from "../examples/signal-workshop/outcomes.mjs";
const recorded = async (
  shift,
  report,
  revision = 0,
  questions = revisedQuestions(shift),
) =>
  getPrediction({
    shift,
    report,
    revision,
    questions,
    text:
      report.message +
      (revision ? "\nInspection: " + OUTCOMES[report.id][2] : ""),
    source: "recorded",
  });
for (const shift of SHIFTS)
  test(`night: ${shift.id} can pass against independently authored outcomes`, async () => {
    let score = 0,
      drones = 2;
    for (const report of shift.reports) {
      const inspected = shift.id === "last-watch" && report.id === "rumor";
      const snapshot = await recorded(shift, report, inspected ? 1 : 0);
      validateCircuit(shift.reference, shift);
      const result = evaluateSystem(shift, snapshot, shift.reference);
      const action = decisionFor(result.probability, 0.3, 0.7);
      const gold = scoreDecision(report.id, action, inspected);
      assert.equal(
        gold.correct,
        true,
        `${report.id}: ${action} at ${result.probability}`,
      );
      score += gold.points;
      if (action === "dispatch") drones--;
    }
    assert.ok(score >= 9);
    assert.ok(drones >= 0);
  });
test("night: all 42 replay variants are real, validated, exactly matched responses", async () => {
  let count = 0;
  for (const shift of SHIFTS)
    for (const report of shift.reports)
      for (const revision of [0, 1])
        for (const questions of shift.id === "temporary-fix"
          ? [defaultQuestions(shift), revisedQuestions(shift)]
          : [defaultQuestions(shift)]) {
          const snapshot = await recorded(shift, report, revision, questions);
          count++;
          assert.equal(snapshot.source, "recorded");
          assert.ok(snapshot.requestId);
          assert.match(snapshot.response.model, /^jev-/);
          assert.ok(Number.isFinite(Date.parse(snapshot.recordedAt)));
          makeModel(shift, snapshot, "joint", "");
        }
  assert.equal(count, 42);
  const shift = SHIFTS[0],
    report = shift.reports[0];
  const questions = defaultQuestions(shift);
  questions[0].question = "Is the moon made of cheese?";
  await assert.rejects(
    () => recorded(shift, report, 0, questions),
    /No recording matches/,
  );
  await assert.rejects(
    () =>
      getPrediction({
        shift,
        report,
        questions: defaultQuestions(shift),
        revision: 0,
        text: "new user text",
        source: "recorded",
        custom: true,
      }),
    /Custom reports require Live/,
  );
});
test("night: repeated variables, category exclusion, and dependence are evaluated by the library", async () => {
  const echo = SHIFTS[2],
    snapshot = await recorded(echo, echo.reports[0]);
  const result = evaluateSystem(echo, snapshot, echo.reference);
  assert.equal(result.probability, result.marginals[0].probability);
  const category = SHIFTS[4],
    categorical = await recorded(category, category.reports[0]);
  assert.equal(
    evaluateSystem(category, categorical, category.starter).probability,
    0,
  );
  const shift = SHIFTS[3],
    related = await recorded(shift, shift.reports[2]);
  const joint = evaluateSystem(shift, related, shift.reference);
  const independent = evaluateSystem(
    shift,
    related,
    shift.reference,
    "independent",
    "A deliberate comparison using the same marginals.",
  );
  assert.deepEqual(joint.marginals, independent.marginals);
  assert.notEqual(joint.probability, independent.probability);
  assert.throws(
    () => evaluateSystem(shift, related, shift.reference, "independent", ""),
    /Record why/,
  );
});
test("night: player criteria change actual recorded model judgments", async () => {
  const shift = SHIFTS[1],
    report = shift.reports[0];
  const loose = await recorded(shift, report, 0, defaultQuestions(shift)),
    precise = await recorded(shift, report);
  assert.notEqual(
    evaluateSystem(shift, loose, shift.reference).probability,
    evaluateSystem(shift, precise, shift.reference).probability,
  );
});
test("night: small rounding adjustments remain explicit, and malformed weights fail", () => {
  const raw = {
    model: "test",
    answers: { joint: { type: "choice", probabilities: { a: 0.32, b: 0.67 } } },
  };
  const normalized = normalizeProvider(raw);
  assert.equal(raw.answers.joint.probabilities.a, 0.32);
  assert.equal(normalized.adjustments.length, 1);
  assert.ok(
    Math.abs(
      Object.values(normalized.response.answers.joint.probabilities).reduce(
        (a, b) => a + b,
        0,
      ) - 1,
    ) < 1e-12,
  );
  for (const weights of [
    { a: 0.1, b: 0.1 },
    { a: -0.1, b: 1.1 },
    { a: "0.3", b: 0.7 },
    { a: NaN, b: 0.7 },
  ])
    assert.throws(() =>
      normalizeProvider({
        model: "test",
        answers: { joint: { type: "choice", probabilities: weights } },
      }),
    );
});
test("night: question requests exclude outcomes and preserve explicit criteria", () => {
  const shift = SHIFTS[0];
  const questions = defaultQuestions(shift);
  questions[0].yes = "A test criterion chosen by a player.";
  const request = buildQuestions(shift, questions);
  assert.equal(request.A.criteria.true, questions[0].yes);
  assert.equal(Object.keys(request.joint.criteria).length, 4);
  assert.ok(!JSON.stringify(request).includes(OUTCOMES.pump[1]));
  assert.throws(() => parseQuestions([], shift));
  assert.throws(() => parseQuestions([{ id: "A", question: "x" }], shift));
  assert.throws(() => decisionFor(0.5, 0.8, 0.7));
  assert.equal(decisionFor(0.5, 0.3, 0.7), "review");
});
async function harness(predict = getPrediction) {
  const dir = await mkdtemp(join(tmpdir(), "night-test-"));
  const statePath = join(dir, "sessions.json");
  const server = await createGameServer({ statePath, predict });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let token = "";
  async function post(path, body = {}) {
    const response = await fetch(base + "/api/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Night-Session": token },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return { status: response.status, ...data };
  }
  const session = await post("session");
  token = session.id;
  return {
    post,
    base,
    token,
    statePath,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await rm(dir, { recursive: true, force: true });
    },
  };
}
test("night server: game links work with or without a trailing slash", async () => {
  const h = await harness();
  try {
    for (const path of ["/", "/examples/signal-workshop"]) {
      const redirect = await fetch(h.base + path + "?source=link", {
        redirect: "manual",
      });
      assert.equal(redirect.status, 302);
      assert.equal(
        redirect.headers.get("location"),
        "/examples/signal-workshop/?source=link",
      );
      const page = await fetch(h.base + path);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /Night Shift/);
    }
    const head = await fetch(h.base + "/examples/signal-workshop", {
      method: "HEAD",
    });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    const missing = await fetch(h.base + "/missing.html");
    assert.equal(missing.status, 404);
    assert.equal(await missing.text(), "Page not found.");
  } finally {
    await h.close();
  }
});
test("night API: all shifts score, unlock, and persist through the real routes", async () => {
  const h = await harness();
  try {
    assert.equal(
      (await h.post("start", { shiftId: SHIFTS[1].id })).status,
      400,
    );
    for (const shift of SHIFTS) {
      let r = await h.post("start", { shiftId: shift.id });
      assert.equal(r.status, 200);
      const attemptId = r.session.attempt.id;
      const wrong = await h.post("diagnose", {
        attemptId,
        cause: shift.diagnosis.cause === "evidence" ? "wiring" : "evidence",
      });
      assert.equal(wrong.correct, false);
      for (const report of shift.reports) {
        if (report.id === "rumor")
          assert.equal((await h.post("inspect", { attemptId })).status, 200);
        const evidence = await h.post("evaluate", {
          attemptId,
          questions: revisedQuestions(shift),
          source: "recorded",
        });
        assert.equal(evidence.status, 200, JSON.stringify(evidence));
        assert.ok(!evidence.snapshot.text.includes(OUTCOMES[report.id][1]));
        const body = {
          attemptId,
          snapshotId: evidence.snapshot.id,
          questions: revisedQuestions(shift),
          circuit: shift.reference,
          modelMode: "joint",
          reason: "",
          low: 0.3,
          high: 0.7,
        };
        r = await h.post("run", body);
        assert.equal(r.status, 200, JSON.stringify(r));
        assert.equal(r.result.correct, true);
        assert.equal(
          (await h.post("run", body)).status,
          400,
          "Cannot score a snapshot twice",
        );
      }
      assert.equal(r.session.attempt.ended, true);
      assert.ok(
        !r.session.completed.includes(shift.id),
        "Diagnosis still required",
      );
      r = await h.post("diagnose", { attemptId, cause: shift.diagnosis.cause });
      assert.ok(r.session.completed.includes(shift.id));
    }
    const saved = JSON.parse(await readFile(h.statePath, "utf8"));
    assert.equal(saved[h.token].completed.length, 6);
    const resumed = await h.post("session");
    assert.equal(resumed.completed.length, 6);
    for (const path of [
      "/examples/signal-workshop/outcomes.mjs",
      "/.night-shift/sessions.json",
      "/examples/signal-workshop/recordings/",
    ])
      assert.equal((await fetch(h.base + path)).status, 404);
  } finally {
    await h.close();
  }
});
test("night API: edited questions, stale evidence, budgets, and live/replay boundaries are enforced", async () => {
  const h = await harness();
  try {
    const shift = SHIFTS[0];
    const start = await h.post("start", { shiftId: shift.id });
    const attemptId = start.session.attempt.id;
    const evidence = await h.post("evaluate", {
      attemptId,
      source: "recorded",
      questions: defaultQuestions(shift),
    });
    const changed = defaultQuestions(shift);
    changed[0].question += " Now consider a different interpretation.";
    const run = {
      attemptId,
      snapshotId: evidence.snapshot.id,
      questions: changed,
      circuit: shift.reference,
      modelMode: "joint",
      reason: "",
      low: 0.3,
      high: 0.7,
    };
    assert.match((await h.post("run", run)).error, /questions changed/);
    assert.equal((await h.post("inspect", { attemptId })).status, 200);
    assert.equal((await h.post("inspect", { attemptId })).status, 400);
    assert.match(
      (await h.post("run", { ...run, questions: defaultQuestions(shift) }))
        .error,
      /Evaluate/,
    );
    assert.equal(
      (
        await h.post("evaluate", {
          attemptId: "stale",
          source: "recorded",
          questions: defaultQuestions(shift),
        })
      ).status,
      409,
    );
    assert.match(
      (
        await h.post("evaluate", {
          attemptId,
          source: "recorded",
          questions: defaultQuestions(shift),
          text: "A completely custom report.",
        })
      ).error,
      /Custom reports/,
    );
    const cross = await fetch(h.base + "/api/start", {
      method: "POST",
      headers: {
        Origin: "https://another.example",
        "X-Night-Session": h.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ shiftId: shift.id }),
    });
    assert.equal(cross.status, 403);
  } finally {
    await h.close();
  }
});
test("night API: provider failure preserves the report and allows a retry", async () => {
  let calls = 0;
  const h = await harness(async (input) => {
    if (calls++ === 0) throw new Error("Provider temporarily unavailable.");
    return getPrediction({ ...input, source: "recorded" });
  });
  try {
    const shift = SHIFTS[0];
    const start = await h.post("start", { shiftId: shift.id });
    const input = {
      attemptId: start.session.attempt.id,
      questions: defaultQuestions(shift),
      source: "recorded",
    };
    assert.equal((await h.post("evaluate", input)).status, 400);
    const retry = await h.post("evaluate", input);
    assert.equal(retry.status, 200);
    assert.equal(retry.session.attempt.index, 0);
    assert.equal(retry.session.attempt.calls, 1);
  } finally {
    await h.close();
  }
});
test("night: tutorial contains exactly two introductory gate lessons", async () => {
  const source = await readFile(
    new URL("../examples/signal-workshop/tutorial.ts", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("ALL_LEVELS.slice(0, 2)"));
  const names = await readdir(
    new URL("../examples/signal-workshop/recordings/", import.meta.url),
  );
  assert.equal(names.filter((n) => n.endsWith(".json")).length, 42);
  assert.ok(
    recordingName(
      SHIFTS[0],
      SHIFTS[0].reports[0],
      0,
      defaultQuestions(SHIFTS[0]),
    ).endsWith(".json"),
  );
});

test("night API: evaluation and total inspection budgets cannot be exceeded", async () => {
  const h = await harness();
  try {
    const shift = SHIFTS[0],
      start = await h.post("start", { shiftId: shift.id }),
      attemptId = start.session.attempt.id;
    const input = {
      attemptId,
      source: "recorded",
      questions: defaultQuestions(shift),
    };
    let evidence;
    for (let i = 0; i < 12; i++) {
      evidence = await h.post("evaluate", input);
      assert.equal(evidence.status, 200);
    }
    assert.match((await h.post("evaluate", input)).error, /12 evaluations/);
    assert.match(
      (await h.post("inspect", { attemptId })).error,
      /No evaluations remain/,
    );
    const run = {
      attemptId,
      snapshotId: evidence.snapshot.id,
      questions: defaultQuestions(shift),
      circuit: shift.reference,
      modelMode: "joint",
      reason: "",
      low: 0.3,
      high: 0.7,
    };
    assert.equal((await h.post("run", run)).status, 200);
    // New reports receive a new call budget. The shift inspection total persists.
    assert.equal((await h.post("inspect", { attemptId })).status, 200);
    evidence = await h.post("evaluate", input);
    assert.equal(evidence.session.attempt.calls, 1);
    assert.equal(
      (await h.post("run", { ...run, snapshotId: evidence.snapshot.id }))
        .status,
      200,
    );
    assert.equal((await h.post("inspect", { attemptId })).status, 200);
    assert.equal((await h.post("inspect", { attemptId })).status, 400);
    evidence = await h.post("evaluate", input);
    assert.equal(evidence.session.attempt.checks, 2);
  } finally {
    await h.close();
  }
});

test("night API: dispatch cannot spend a third drone", async () => {
  const h = await harness(async (input) => {
    const snapshot = await recorded(
      input.shift,
      input.report,
      0,
      defaultQuestions(input.shift),
    );
    snapshot.response = {
      model: "test-fixture",
      answers: {
        A: { type: "noul", noul: 1 },
        B: { type: "noul", noul: 1 },
        joint: {
          type: "choice",
          probabilities: { world_0: 0, world_1: 0, world_2: 0, world_3: 1 },
        },
      },
    };
    return snapshot;
  });
  try {
    const shift = SHIFTS[0],
      start = await h.post("start", { shiftId: shift.id }),
      attemptId = start.session.attempt.id;
    for (let i = 0; i < 3; i++) {
      const evidence = await h.post("evaluate", {
        attemptId,
        source: "recorded",
        questions: defaultQuestions(shift),
      });
      const result = await h.post("run", {
        attemptId,
        snapshotId: evidence.snapshot.id,
        questions: defaultQuestions(shift),
        circuit: shift.reference,
        modelMode: "joint",
        reason: "",
        low: 0.3,
        high: 0.7,
      });
      if (i < 2) assert.equal(result.status, 200);
      else assert.match(result.error, /No drones remain/);
    }
  } finally {
    await h.close();
  }
});

test("night API: a new server instance restores the same evidence and session", async () => {
  const h = await harness();
  let restored;
  try {
    const shift = SHIFTS[0],
      start = await h.post("start", { shiftId: shift.id }),
      attemptId = start.session.attempt.id;
    const evidence = await h.post("evaluate", {
      attemptId,
      source: "recorded",
      questions: defaultQuestions(shift),
    });
    restored = await createGameServer({ statePath: h.statePath });
    await new Promise((resolve) => restored.listen(0, "127.0.0.1", resolve));
    const response = await fetch(
      `http://127.0.0.1:${restored.address().port}/api/session`,
      { method: "POST", headers: { "X-Night-Session": h.token } },
    );
    const state = await response.json();
    assert.equal(state.attempt.id, attemptId);
    assert.equal(state.attempt.snapshot.id, evidence.snapshot.id);
    assert.equal(state.attempt.calls, 1);
  } finally {
    if (restored) await new Promise((resolve) => restored.close(resolve));
    await h.close();
  }
});
