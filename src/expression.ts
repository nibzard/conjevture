import { ConjevtureError } from "./errors.js";
import type { Value, Variable } from "./scope.js";

export type Expression =
  | Variable<boolean>
  | { readonly kind: "constant"; readonly value: boolean }
  | { readonly kind: "not"; readonly operand: Expression }
  | { readonly kind: "and" | "or" | "xor"; readonly left: Expression; readonly right: Expression }
  | { readonly kind: "equals"; readonly variable: Variable; readonly value: Value };

export function constant(value: boolean): Expression {
  return Object.freeze({ kind: "constant", value });
}

export function not(operand: Expression): Expression {
  return Object.freeze({ kind: "not", operand });
}

export function and(left: Expression, right: Expression): Expression {
  return Object.freeze({ kind: "and", left, right });
}

export function or(left: Expression, right: Expression): Expression {
  return Object.freeze({ kind: "or", left, right });
}

export function xor(left: Expression, right: Expression): Expression {
  return Object.freeze({ kind: "xor", left, right });
}

/** Compare a variable with one member of its domain. */
export function eq<T extends Value>(variable: Variable<T>, value: NoInfer<T>): Expression {
  if (!variable.domain.includes(value)) {
    throw new ConjevtureError("INVALID_VARIABLE", `Value "${value}" is outside the domain of "${variable.name}".`);
  }
  return Object.freeze({ kind: "equals", variable, value });
}
