# Conjevture

**Exact logic for uncertain answers.**

Conjevture is a small TypeScript library that combines uncertain judgments with
Boolean rules. Supply probabilities from Jev or your own data. Conjevture computes
the probability that your rule is satisfied, using the relationships you declare.

## Quick start

Use Node.js 22 or later to run the project from source:

```sh
git clone https://github.com/nibzard/conjevture.git
cd conjevture
npm ci
npm run example
```

The support-ticket example prints:

```text
Probability of priority: 0.81
Assumption: For this example, resolution is independent of urgency and repetition.
```

No credentials are needed. The example uses illustrative probabilities.

## Play Night Shift

Build a system that interprets messy reports and decides when to dispatch repair drones.
The [browser game](examples/signal-workshop/README.md) combines live TypeSafe Jev judgments
with Conjevture circuits, explicit probability models, and independently scored outcomes.

```sh
npm run game
```

Open <http://127.0.0.1:4173>. The game includes two gate lessons and six campaign shifts.
Players edit judgment questions, wire gates, inspect uncertain evidence, and investigate failures.
It supports phones, touch input, and keyboard controls.

Set `TYPESAFE_API_KEY` in the server environment for live calls and custom reports.
Without a key, play with the included recorded Jev responses. Replays are labeled and
require matching questions and evidence. See the [design and variations](examples/signal-workshop/CONCEPTS.md).

## A first circuit

Create a variable, give it a probability, and evaluate a rule:

```ts
import {
  and, bernoulli, createScope, evaluate, not,
} from "conjevture";

const scope = createScope({ stateId: "ticket:42", revision: "1" });
const urgent = scope.boolean("urgent");
const model = bernoulli(urgent, 0.8);

evaluate(urgent, model).probability;              // 0.8
evaluate(not(urgent), model).probability;         // Approximately 0.2
evaluate(and(urgent, urgent), model).probability; // 0.8
```

Reusing `urgent` preserves the same uncertain proposition. When you combine
different variables, supply a joint distribution or explicitly declare independence.

The package has zero runtime dependencies. It exports ECMAScript modules (ESM)
and TypeScript declarations.

## What you can build

- Combine Boolean judgments with `and`, `or`, `xor`, and `not`.
- Represent categories such as billing or technical support with typed labels.
- Describe related variables in a joint probability table.
- Declare independence between groups with a recorded reason.
- Convert Jev Noul and Choice answers while keeping prediction provenance.

Jev converters live in `conjevture/jev`. They accept answers from your existing
client. The library makes no network requests and leaves action policies to your
application.

## Learn more

| Topic | Example or guide |
| --- | --- |
| Combine related judgments | [Support-ticket circuit](docs/guide.md#define-a-circuit) |
| Understand dependence | [Identity and dependence](docs/guide.md#preserve-identity-and-dependence) |
| Work with categories | [Categorical variables](docs/guide.md#use-categorical-variables) |
| Use Jev predictions | [Jev converters](docs/guide.md#convert-jev-answers) |
| Inspect results and errors | [Evaluation and validation](docs/guide.md#evaluation-and-validation) |
| Run complete examples | [Support ticket](examples/support-ticket.ts) and [routing](examples/routing.ts) |

## Limits

Version 0.1 enumerates possible worlds, with a default limit of 65,536 assignments.
You can configure this limit. Probabilities use JavaScript floating-point numbers.

The result depends on the supplied probabilities and dependence assumptions.
Missing variables or invalid distributions produce errors. Probability bounds,
conditional learned gates, sampling, and Score conversion remain outside this version.

## Development

```sh
npm ci
npm test
npm run example
npm pack --dry-run
```

`npm test` builds the library and game, checks TypeScript contracts, and runs the test suite.
Tests cover logical identities, correlated variables, validation, and Jev converters.
Game tests cover gate inventories, invalid connections, rule equivalence, all campaign shifts,
recorded evidence, independent scoring, and server progression. Tests require no credentials
and make no model requests.

After the test command, run the categorical example with:

```sh
node .test-build/examples/routing.js
```

Source modules separate variables, expressions, distributions, evaluation, and Jev
conversion. See [the public exports](src/index.ts) and [the detailed guide](docs/guide.md).

## License

[MIT](LICENSE) © 2026 Nikola Balic.
