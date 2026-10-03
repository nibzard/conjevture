import { ConjevtureError } from "./errors.js";

const variableBrand: unique symbol = Symbol("Conjevture variable");

export type Value = boolean | string;

export interface ScopeInfo {
  readonly stateId: string;
  readonly revision: string;
}

/** Identity is the variable object, not its name or probability. */
export interface Variable<T extends Value = Value> {
  readonly [variableBrand]: true;
  readonly kind: "variable";
  readonly name: string;
  readonly domain: readonly T[];
  readonly scope: ScopeInfo;
}

export interface Scope {
  readonly info: ScopeInfo;
  boolean(name: string): Variable<boolean>;
  categorical<const T extends readonly string[]>(
    name: string,
    labels: T,
  ): Variable<T[number]>;
}

/** Create one scope per immutable state snapshot. */
export function createScope(info: ScopeInfo): Scope {
  if (!nonempty(info.stateId) || !nonempty(info.revision)) {
    throw new ConjevtureError("INVALID_VARIABLE", "A scope needs a nonempty stateId and revision.");
  }

  const snapshot = Object.freeze({ stateId: info.stateId, revision: info.revision });
  const variables = new Map<string, Variable>();

  function declare<T extends Value>(name: string, domain: readonly T[]): Variable<T> {
    if (!nonempty(name) || domain.length === 0 || new Set(domain).size !== domain.length) {
      throw new ConjevtureError(
        "INVALID_VARIABLE",
        "A variable needs a name and a nonempty domain without duplicates.",
      );
    }

    const existing = variables.get(name);
    if (existing) {
      if (
        existing.domain.length !== domain.length ||
        !domain.every((value) => existing.domain.includes(value))
      ) {
        throw new ConjevtureError("INVALID_VARIABLE", `Variable "${name}" already has a different domain.`);
      }
      // The domain check establishes the same value type for this declaration.
      return existing as Variable<T>;
    }

    const variable: Variable<T> = Object.freeze({
      [variableBrand]: true as const,
      kind: "variable" as const,
      name,
      domain: Object.freeze([...domain]),
      scope: snapshot,
    });
    variables.set(name, variable);
    return variable;
  }

  return Object.freeze({
    info: snapshot,
    boolean: (name: string) => declare(name, [false, true]),
    categorical: <const T extends readonly string[]>(name: string, labels: T) => {
      if (!Array.from(labels).every(nonempty)) {
        throw new ConjevtureError("INVALID_VARIABLE", "Categorical labels must be nonempty strings.");
      }
      return declare<T[number]>(name, labels);
    },
  });
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
