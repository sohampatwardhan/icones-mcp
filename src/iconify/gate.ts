/**
 * Spacing between calls to the public Iconify API.
 */

/**
 * Serializes upstream calls and keeps a minimum gap between them so a
 * contact sheet does not burst the public Iconify API.
 *
 * @remarks
 * Acquires run one at a time. Each successful acquire schedules the next one
 * `minIntervalMs` after it started waiting, measured on the injected clock.
 */
export class RequestGate {
  /**
   * Earliest timestamp at which the next request may start.
   */
  private nextAt = 0;

  /**
   * Tail of the acquire queue. Rejections are swallowed here so one failed
   * wait does not block later callers.
   */
  private chain: Promise<void> = Promise.resolve();

  /**
   * @param minIntervalMs - Minimum time between the start of consecutive requests.
   * @param sleep - Delay used while waiting for the next slot. Defaults to `setTimeout`.
   * @param now - Clock in milliseconds. Defaults to `Date.now`.
   */
  constructor(
    private readonly minIntervalMs: number,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Waits until this caller's slot is open, then reserves the following slot.
   *
   * @returns A promise that resolves when the caller may send a request.
   */
  async acquire(): Promise<void> {
    const ticket = this.chain.then(async () => {
      const wait = Math.max(0, this.nextAt - this.now());
      if (wait > 0) await this.sleep(wait);
      this.nextAt = this.now() + this.minIntervalMs;
    });
    this.chain = ticket.then(
      () => undefined,
      () => undefined,
    );
    await ticket;
  }
}
