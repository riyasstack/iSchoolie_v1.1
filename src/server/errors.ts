export type ErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "SESSION_REQUIRED"
  | "SESSION_EXPIRED"
  | "AUTH_NOT_CONFIGURED"
  | "CSRF"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA"
  | "BLOCKED"
  | "PROTECTED"
  | "GONE"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  SESSION_REQUIRED: 401,
  SESSION_EXPIRED: 401,
  AUTH_NOT_CONFIGURED: 503,
  CSRF: 403,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  BLOCKED: 403,
  PROTECTED: 403,
  GONE: 410,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  get status() {
    return STATUS[this.code];
  }
}

export const notFound = (what = "That page") => new AppError("NOT_FOUND", `${what} doesn’t exist.`);
export const forbidden = (msg = "You can’t do that.") => new AppError("FORBIDDEN", msg);
export const invalid = (msg: string, details?: unknown) => new AppError("VALIDATION", msg, details);
