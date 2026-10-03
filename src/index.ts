export { createScope } from "./scope.js";
export type { Scope, ScopeInfo, Value, Variable } from "./scope.js";
export { and, or, xor, not, eq, constant } from "./expression.js";
export type { Expression } from "./expression.js";
export { joint, bernoulli, assumeIndependent } from "./distribution.js";
export type {
  Assignment,
  JointRow,
  JointDistribution,
  IndependentModel,
  IndependenceAssumption,
  ProbabilityModel,
  Provenance,
} from "./distribution.js";
export { evaluate } from "./evaluate.js";
export type { Evaluation, EvaluationOptions } from "./evaluate.js";
export { ConjevtureError } from "./errors.js";
export type { ErrorCode } from "./errors.js";
