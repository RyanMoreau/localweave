export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/** Bounded exponential polling delay with symmetric jitter. */
export class PollBackoff {
  private current: number

  constructor(
    private readonly minimum = 250,
    private readonly maximum = 4_000,
    private readonly jitter = 0.2,
    private readonly random = Math.random
  ) {
    this.current = minimum
  }

  reset() { this.current = this.minimum }

  next() {
    const base = this.current
    this.current = Math.min(this.maximum, this.current * 2)
    const spread = base * this.jitter
    return Math.round(base - spread + this.random() * spread * 2)
  }
}
