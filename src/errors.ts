export type ErrorCode =
  | "INVALID_VARIABLE"
  | "SCOPE_MISMATCH"
  | "INVALID_DISTRIBUTION"
  | "OVERLAPPING_VARIABLES"
  | "MISSING_VARIABLE"
  | "MISSING_DEPENDENCE"
  | "WORLD_LIMIT_EXCEEDED"
  | "INVALID_JEV_ANSWER";

/** A model or input error with a stable code for callers. */
export class ConjevtureError extends Error {
  override readonly name = "ConjevtureError";

  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
