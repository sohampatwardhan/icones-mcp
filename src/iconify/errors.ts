/**
 * Errors produced while talking to the Iconify API or validating caller input.
 */

/**
 * Stable reason code for an {@link IconifyError}.
 *
 * - `not_found` means the collection or icon does not exist.
 * - `bad_request` means Iconify rejected the query.
 * - `rate_limited` means Iconify returned HTTP 429 and the retries were used up.
 * - `upstream` means a network failure, a 5xx response, or a non-JSON body.
 * - `invalid` means the caller's arguments failed a local check.
 */
export type IconifyErrorCode =
  | "not_found"
  | "bad_request"
  | "rate_limited"
  | "upstream"
  | "invalid";

/**
 * Failure from the Iconify client or from local argument checks.
 *
 * @remarks
 * Tool handlers turn this into an MCP tool error. Other exceptions are logged
 * and still returned as tool errors, so a bad icon id does not crash the server.
 */
export class IconifyError extends Error {
  /**
   * Machine-readable reason.
   */
  readonly code: IconifyErrorCode;

  /**
   * HTTP status from Iconify when the failure came from a response.
   *
   * Absent for local validation failures and for some network errors.
   */
  readonly status?: number;

  /**
   * @param message - Text safe to show to an MCP client.
   * @param code - Reason code.
   * @param status - HTTP status from Iconify, when there was one.
   */
  constructor(message: string, code: IconifyErrorCode, status?: number) {
    super(message);
    this.name = "IconifyError";
    this.code = code;
    this.status = status;
  }
}
