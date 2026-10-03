# Night Shift

A game about turning uncertain language into working decision systems.
Jev interprets player-defined questions. Conjevture evaluates the connected logic.
The game scores the resulting decisions against independently authored outcomes.

## Play locally

Use Node.js 22 or later. From the repository root:

```sh
npm ci
npm run game
```

Open <http://127.0.0.1:4173>. The game includes 42 recorded Jev responses,
so the campaign works without credentials. Every replay shows its actual model,
request identifier, and recording time.

For live evaluation, set `TYPESAFE_API_KEY` in the server environment before starting.
The server reads it without sending it to the browser. `JEV_MODEL` defaults to
`jev-latest`. The API endpoint is fixed to `https://api.typesafe.ai/v1/systemone`.
Do not place credentials in browser code or commit them.

Use `PORT=4174 npm run game` to change the port. Use `HOST=0.0.0.0 npm run game`
to listen on your local network. The default listener is `127.0.0.1`.

This version needs the Node.js server, including for recorded campaigns.
Static hosting alone does not provide evaluation, sessions, or independent scoring.

## The game loop

1. Read the shift's policy and the incoming report.
2. Define each judgment's question and its true/false criteria.
3. Connect the supplied gates into a dispatch circuit.
4. Select **Live Jev** or **Recorded replay**, then evaluate the evidence.
5. Inspect the model, probability, and next action. Request an inspection when evidence is missing.
6. Run the system. Its thresholds choose dispatch, wait, or manual review.
7. Handle all three reports and solve the incident investigation to advance.

Each shift supplies two drones and two inspections. A report allows one inspection
and up to 12 successful evaluations. Gates have a fixed inventory.
A source can feed several sockets without creating independent observations.

On phones, the connection form opens automatically. Use its labeled selectors
to wire every socket without dragging. The circuit board scrolls horizontally.
Desktop players can also select output and input dots or move gates by their headings.
**Undo** reverses circuit edits. Escape cancels an unfinished wire.

The two introductory lessons remain at `tutorial.html`: AND and OR gates.
They use illustrative probabilities and are labeled as fixtures.
The main campaign uses actual Jev responses.

## Campaign

| Shift | Task | What it demonstrates |
| --- | --- | --- |
| First watch | Build OR across current failure and deterioration | Interpret reports with typed uncertain judgments |
| A temporary fix | Repair an inherited definition of “fixed” | Questions change the evidence even when gates are correct |
| An echo is not evidence | Reuse A in both AND inputs | Variable identity; `A AND A` remains `A` |
| One report, two claims | Review an inherited independence assumption | Joint evaluation versus independent copies of the same marginals |
| One machine, one status | Replace an impossible AND with OR | Typed, mutually exclusive Choice categories |
| The last watch | Interpret a policy memo and incomplete reports | Compose questions, gates, evidence revisions, and action thresholds |

The incident investigation distinguishes four failure causes: question meaning,
gate connections, dependence assumptions, and missing evidence.
The shift debrief traces each decision back to its expression, questions,
model, source, assumptions, and outcome.

## Scoring

| Decision | Points |
| --- | --- |
| Correct dispatch or wait | +4 |
| Unnecessary dispatch | −3 |
| Missed fault | −5 |
| Manual review | +1 |
| Inspection | −1 on that report |

Earn at least 9 points and solve the investigation to pass a shift.
Sending everything to review cannot pass. A dispatch always consumes a drone.
The thresholds default to wait at or below 30%, dispatch at or above 70%,
and manual review between them. Players can change them within the allowed range.

`outcomes.mjs` contains the independent scenario truth and inspection results.
It stays on the server and is never included in a Jev request.
The server calculates the action itself; it does not trust a browser-supplied score,
probability, or claimed action. Scored snapshots cannot be submitted twice.

## Live calls and recorded replays

Live evaluation sends only the report and judgment definitions to Jev.
Question edits require a new evaluation. The sandbox accepts new reports,
but custom reports cannot earn campaign points.

A recording matches the exact question definitions, report, and evidence revision.
If no matching recording exists, the game asks for live evaluation or restored questions.
It never substitutes a fixture for a failed live call.
The temporary-fix shift includes recordings for both the inherited and precise repair criteria.

Recorded responses come from `jev-1.13.0`. New live responses can differ.
Predictions do not define the answer key. In the recorded final shift, the model
is too reassuring about a second-hand “sorted” report. An inspection reveals the
missing fact and makes a better decision possible.

To capture missing recordings with a configured API key:

```sh
npm run record:game
```

This makes real TypeSafe requests. Existing recordings are preserved.
Delete a specific recording deliberately if you want to replace it with a new prediction.

## Probability models

Each evaluation creates a fresh scope for a report and its evidence revision.
Boolean inputs use `fromNoul`; related inputs use `fromJointChoice`.
The status shift uses `fromChoice` and typed `eq` expressions.
All gates compile to Conjevture expressions and use `evaluate`.

A joint question describes every Boolean assignment. It supplies an estimated
joint distribution; it does not prove that the model's interpretation is correct.
The independence comparison uses marginals derived from that same joint table,
so the comparison isolates the dependence assumption. An explicit reason is required.
Separate Noul answers remain inspectable but do not silently replace joint marginals.

Some provider Choice responses contain rounded weights totaling 0.99 or 1.01.
The application normalizes a positive finite distribution only when its total differs
from one by at most 0.025. It retains the raw response and displays every adjustment.
Other malformed weights fail. The library's strict validation remains unchanged.

## Persistence and hosting

The browser stores circuit drafts, judgment definitions, and an opaque session identifier.
The server stores attempts, predictions, scores, and progression in
`.night-shift/sessions.json`, outside the served directory. This file is ignored by Git.
A server restart preserves sessions. Browser storage must remain available to reconnect
to the same session; without it, keep the current tab open.

The build is under `.game-build/`. The server exposes that directory and its `/api/` routes.
It does not serve recordings, outcome files, credentials, or session files directly.

The existing deployment uses a user service named `conjevture-night-shift.service`.
Its private environment file is outside this repository, under
`~/.config/conjevture-night-shift/environment`.
Tailscale Serve proxies port 8447 to the loopback server on port 4173.

```sh
npm run build:game
systemctl --user restart conjevture-night-shift.service
systemctl --user status conjevture-night-shift.service
```

The hosted game is available to connected tailnet devices at:
<https://claude-code-vm.tailef8c96.ts.net:8447/examples/signal-workshop/>

## Development and validation

```sh
npm test
npm run build:game
```

`npm test` builds the browser code, checks TypeScript, and runs the library,
circuit, replay, and server tests. Tests use recorded responses; they make no paid calls.
Browser checks cover all six shifts, live questions, custom text, mobile controls,
keyboard connections, and the retained introductory lessons.

| File | Role |
| --- | --- |
| `campaign.ts` | Public reports, judgment definitions, gate budgets, and investigations |
| `night-engine.ts` | Typed question construction, probability models, circuit evaluation, and thresholds |
| `board.ts` | Circuit editor with pointer and form controls |
| `main.ts` | Campaign interface and browser drafts |
| `api.mjs` | Sessions, budgets, evaluation requests, independent scoring, and progression |
| `provider.mjs` | Server-only live calls and exact replay lookup |
| `outcomes.mjs` | Independently authored outcomes; never sent to Jev |
| `recordings/` | Actual saved Jev responses with provenance |
| `capture-replays.mjs` | Reproducible capture of missing recordings |
| `tutorial.html`, `tutorial.ts` | Two introductory gate lessons |
| `engine.ts`, `levels.ts` | Shared graph compiler and original lesson definitions |
| `../../test/night-game.test.mjs` | Campaign, API, probability, and replay tests |

The server is intended for a small tailnet game. It supports up to 500 stored sessions.
It does not provide account management or multi-instance storage coordination.
