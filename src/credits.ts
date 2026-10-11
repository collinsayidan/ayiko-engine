import { estimateSpeechSeconds } from "./providers/mock";

/**
 * Credit prices, set at roughly 3x expected provider cost.
 * Recalibrate after week-1 tests using the generations table.
 */
export const PRICES = {
  voicePer30s: 2,
  video5s: 10,
  video10s: 18,
  render: 1,
} as const;

export interface QuoteLine {
  item: string;
  credits: number;
}

export interface Quote {
  total: number;
  lines: QuoteLine[];
}

export interface ShortQuoteInput {
  script: string;
  videoDurationS: 5 | 10;
  reuseVideo?: boolean;
  reuseVoice?: boolean;
}

/** What a captioned short costs. Reused parts (e.g. same clip, new language) are free. */
export function quoteShort(input: ShortQuoteInput): Quote {
  const lines: QuoteLine[] = [];
  if (!input.reuseVoice) {
    const blocks = Math.max(1, Math.ceil(estimateSpeechSeconds(input.script) / 30));
    lines.push({ item: `Voiceover (${blocks * 30}s block${blocks > 1 ? "s" : ""})`, credits: blocks * PRICES.voicePer30s });
  }
  if (!input.reuseVideo) {
    lines.push({
      item: `AI video clip (${input.videoDurationS}s)`,
      credits: input.videoDurationS === 10 ? PRICES.video10s : PRICES.video5s,
    });
  }
  lines.push({ item: "Captions and render", credits: PRICES.render });
  return { total: lines.reduce((n, l) => n + l.credits, 0), lines };
}

export class InsufficientCreditsError extends Error {
  constructor(public readonly needed: number, public readonly balance: number) {
    super(`This needs ${needed} credits but the balance is ${balance}.`);
    this.name = "InsufficientCreditsError";
  }
}

export type LedgerReason = "signup_bonus" | "purchase" | "subscription" | "generation" | "refund" | "admin";

export interface Ledger {
  balance(userId: string): Promise<number>;
  /** Charge for a job. Throws InsufficientCreditsError. Returns the new balance. */
  spend(userId: string, amount: number, jobId: string): Promise<number>;
  /** Refund a job's charge. Safe to call twice. Returns credits refunded. */
  refund(jobId: string): Promise<number>;
  grant(userId: string, amount: number, reason: LedgerReason, stripePaymentId?: string): Promise<void>;
}

interface Entry {
  userId: string;
  delta: number;
  reason: LedgerReason;
  jobId?: string;
  stripePaymentId?: string;
}

/** Same rules as the Postgres functions, for tests and local runs. */
export class InMemoryLedger implements Ledger {
  readonly entries: Entry[] = [];

  async balance(userId: string): Promise<number> {
    return this.entries.filter((e) => e.userId === userId).reduce((n, e) => n + e.delta, 0);
  }

  async spend(userId: string, amount: number, jobId: string): Promise<number> {
    if (amount <= 0) throw new Error("amount must be positive");
    if (this.entries.some((e) => e.jobId === jobId && e.reason === "generation")) throw new Error(`job ${jobId} already charged`);
    const bal = await this.balance(userId);
    if (bal < amount) throw new InsufficientCreditsError(amount, bal);
    this.entries.push({ userId, delta: -amount, reason: "generation", jobId });
    return bal - amount;
  }

  async refund(jobId: string): Promise<number> {
    const charge = this.entries.find((e) => e.jobId === jobId && e.reason === "generation");
    if (!charge || this.entries.some((e) => e.jobId === jobId && e.reason === "refund")) return 0;
    this.entries.push({ userId: charge.userId, delta: -charge.delta, reason: "refund", jobId });
    return -charge.delta;
  }

  async grant(userId: string, amount: number, reason: LedgerReason, stripePaymentId?: string): Promise<void> {
    if (stripePaymentId && this.entries.some((e) => e.stripePaymentId === stripePaymentId)) return;
    this.entries.push({ userId, delta: amount, reason, stripePaymentId });
  }
}
