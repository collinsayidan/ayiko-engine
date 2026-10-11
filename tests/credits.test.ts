import { describe, expect, it } from "vitest";
import { InMemoryLedger, InsufficientCreditsError, quoteShort } from "../src/credits";

describe("quoteShort", () => {
  it("prices a full short", () => {
    expect(quoteShort({ script: "Welcome! New fabrics just landed.", videoDurationS: 5 }).total).toBe(13);
  });

  it("charges only voice and render when the clip is reused", () => {
    expect(quoteShort({ script: "Welcome!", videoDurationS: 5, reuseVideo: true }).total).toBe(3);
  });

  it("charges more voice blocks for long scripts", () => {
    const long = Array(100).fill("word").join(" "); // ~40s of speech
    expect(quoteShort({ script: long, videoDurationS: 5 }).total).toBe(4 + 10 + 1);
  });
});

describe("InMemoryLedger", () => {
  it("spends, blocks overdraws and refunds once", async () => {
    const l = new InMemoryLedger();
    await l.grant("u", 20, "signup_bonus");
    expect(await l.spend("u", 13, "job1")).toBe(7);
    await expect(l.spend("u", 13, "job2")).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(await l.refund("job1")).toBe(13);
    expect(await l.refund("job1")).toBe(0);
    expect(await l.balance("u")).toBe(20);
  });

  it("never credits the same Stripe payment twice", async () => {
    const l = new InMemoryLedger();
    await l.grant("u", 60, "purchase", "pi_123");
    await l.grant("u", 60, "purchase", "pi_123");
    expect(await l.balance("u")).toBe(60);
  });
});
