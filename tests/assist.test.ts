import { describe, expect, it } from "vitest";
import { draftScript, tidy, translateScript } from "../web/lib/assist";

function fakeFetch(handlers: { claude?: (body: any) => string; khaya?: (body: any) => Response }) {
  const calls: { url: string; body: any }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, body });
    if (url.includes("anthropic")) return new Response(JSON.stringify({ content: [{ type: "text", text: handlers.claude!(body) }] }));
    return handlers.khaya!(body);
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("script assistant", () => {
  it("drafts with Claude using the brief, brand and call to action", async () => {
    const { f, calls } = fakeFetch({ claude: () => 'Script: "Fresh shea butter just landed at AMA Glow. Order on WhatsApp today!"' });
    const s = await draftScript({ anthropicKey: "k", fetch: f }, { brief: "shea butter, 50 cedis", brand: "AMA Glow", cta: "Order on WhatsApp" });
    expect(s).toBe("Fresh shea butter just landed at AMA Glow. Order on WhatsApp today!");
    expect(calls[0]!.body.model).toBe("claude-haiku-5-5");
    expect(calls[0]!.body.messages[0].content).toContain("50 cedis");
    expect(calls[0]!.body.system).toContain("Never invent prices");
  });

  it("uses Khaya for Twi and Yoruba, Claude for Pidgin, and falls back to Claude if Khaya fails", async () => {
    const { f, calls } = fakeFetch({
      claude: (b) => (b.system.includes("Pidgin") ? "New market don land o!" : "Ọjà tuntun ti dé!"),
      khaya: (b) => (b.lang === "en-tw" ? new Response(JSON.stringify("Nneɛma foforo aba!")) : new Response("down", { status: 503 })),
    });
    const out = await translateScript({ anthropicKey: "k", khayaKey: "kh", fetch: f }, "New stock has arrived!", ["en", "twi", "yo", "pcm"]);
    expect(out).toEqual([
      { code: "twi", text: "Nneɛma foforo aba!", source: "khaya" },
      { code: "yo", text: "Ọjà tuntun ti dé!", source: "claude" },
      { code: "pcm", text: "New market don land o!", source: "claude" },
    ]);
    expect(calls.find((c) => c.url.includes("ghananlp"))!.body).toEqual({ in: "New stock has arrived!", lang: "en-tw" });
  });

  it("without a Khaya key everything goes to Claude, with orthography guidance", async () => {
    const { f, calls } = fakeFetch({ claude: () => "Akwaaba!" });
    await translateScript({ anthropicKey: "k", fetch: f }, "Welcome!", ["twi"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.system).toContain("ɛ and ɔ");
  });

  it("refuses without a key and tidies model output", async () => {
    await expect(draftScript({}, { brief: "x" })).rejects.toThrow(/not_configured/);
    expect(tidy("Translation: “Akwaaba!”")).toBe("Akwaaba!");
  });
});
