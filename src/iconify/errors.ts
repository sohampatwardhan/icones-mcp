export type IconifyErrorCode =
  | "not_found"
  | "bad_request"
  | "rate_limited"
  | "upstream"
  | "invalid";

export class IconifyError extends Error {
  readonly code: IconifyErrorCode;
  readonly status?: number;

  constructor(message: string, code: IconifyErrorCode, status?: number) {
    super(message);
    this.name = "IconifyError";
    this.code = code;
    this.status = status;
  }
}
