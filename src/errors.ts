export type ErrorCode =
  | "INVALID_INPUT"
  | "INVALID_UNIVERSE"
  | "INVALID_ELEMENT"
  | "ELEMENT_NOT_IN_UNIVERSE"
  | "DUPLICATE_CANDIDATE_ID"
  | "INVALID_COST"
  | "UNKNOWN_CANDIDATE_ID"
  | "NOT_FOUND"
  | "EXHAUSTIVE_TOO_LARGE"
  | "BAD_REQUEST";

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function errorBody(err: unknown): { status: number; body: object } {
  if (err instanceof ApiError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message, details: err.details ?? null } },
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { status: 500, body: { error: { code: "INTERNAL", message } } };
}
