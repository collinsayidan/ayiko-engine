import { describe, expect, it } from "vitest";
import { BasicModerator, OpenAIModerator, buildModerator } from "../src/moderation";
import { renderReadyEmail } from "../src/email";

const reply = (categories: Record<string, boolean>, status = 200) =>
  (async () => new Response(JSON.stringify({ results: [{ flagged: Object.values(categories).some(Boolean), categories }] }), { status })) as unknown as typeof fetch;

describe("moderation", () => {
  const img = { bytes: new Uint8Array([1, 2, 3]), mime: "image/png", ext: "png" };

  it("blocks serious categories in any language, allows the rest", async () => {
    expect(await new OpenAIModerator("k", { fetch: reply({ hate: true }) }).checkScript("…")).toMatchObject({ ok: false });
    expect(await new OpenAIModerator("k", { fetch: reply({ violence: true }) }).checkScript("Action film night!")).toEqual({ ok: true });
    expect(await new OpenAIModerator("k", { fetch: reply({ sexual: true }) }).checkImage(img)).toMatchObject({ ok: false, reason: expect.stringMatching(/photo/) });
    expect(await new OpenAIModerator("k", { fetch: reply({}) }).checkImage(img)).toEqual({ ok: true });
  });

  it("sends the photo as a data URL and the right model", async () => {
    let body: any;
    const f = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response(JSON.stringify({ results: [{ flagged: false, categories: {} }] })); }) as unknown as typeof fetch;
    await new OpenAIModerator("k", { fetch: f }).checkImage(img);
    expect(body.model).toBe("omni-moderation-latest");
    expect(body.input[0].image_url.url).toBe("data:image/png;base64,AQID");
  });

  it("falls back safely when the API is down", async () => {
    const down = (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
    const m = new OpenAIModerator("k", { fetch: down });
    expect(await m.checkScript("Akwaaba! New stock.")).toEqual({ ok: true });
    expect(await m.checkScript("buy a bomb")).toMatchObject({ ok: false }); // basic rules still apply
    expect(await m.checkImage(img)).toEqual({ ok: true });
    expect(await new OpenAIModerator("k", { fetch: reply({}, 500) }).checkScript("Hello")).toEqual({ ok: true });
  });

  it("uses basic rules without a key", () => {
    expect(buildModerator(undefined)).toBeInstanceOf(BasicModerator);
    expect(buildModerator("sk-x")).toBeInstanceOf(OpenAIModerator);
  });
});

describe("ready email", () => {
  it("names the languages, mentions refunds and escapes user text", () => {
    const m = renderReadyEmail({ to: "a@b.c", name: "Ama Mensah", title: "<Shea> promo", siteUrl: "https://ayiko.ai/", videos: [{ language: "twi", ok: true }, { language: "yo", ok: true }, { language: "pcm", ok: false }] });
    expect(m.subject).toBe("Your 2 videos are ready: <Shea> promo");
    expect(m.html).toContain("&lt;Shea&gt; promo");
    expect(m.html).not.toContain("<Shea>");
    expect(m.html).toContain("Twi, Yorùbá");
    expect(m.text).toContain("Pidgin didn't work, so those credits were refunded");
    expect(m.text).toContain("https://ayiko.ai/app");
    expect(m.text.startsWith("Hi Ama,")).toBe(true);
    expect(renderReadyEmail({ to: "x", title: "T", siteUrl: "s", videos: [{ language: "en", ok: false }] }).subject).toMatch(/couldn't make/);
  });
});
