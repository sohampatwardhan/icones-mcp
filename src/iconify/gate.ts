/**
 * Serializes upstream calls and keeps a minimum gap between them so a
 * contact sheet does not burst the public Iconify API.
 */
export class RequestGate {
  private nextAt = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly minIntervalMs: number,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
    private readonly now: () => number = Date.now,
  ) {}

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
