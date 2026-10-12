import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/api";
import { draftScript, LANGUAGE_INFO, translateScript, type AssistKeys } from "@/lib/assist";
import { templateById } from "@/lib/catalog";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAILY_LIMIT = 40;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

const keys = (): AssistKeys => ({
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  anthropicModel: process.env.ANTHROPIC_MODEL,
  khayaKey: process.env.KHAYA_API_KEY,
  khayaBaseUrl: process.env.KHAYA_BASE_URL,
});

/** Draft a script, or translate one into the chosen languages. Free, with a daily limit per account. */
export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return fail(503, "The script assistant isn't switched on yet.");
  const auth = await requireUser();
  if ("res" in auth) return auth.res;
  const { db, user } = auth;

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const mode = b.mode === "translate" ? "translate" : "draft";

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await db.from("assist_usage").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) return fail(429, "You've used the script assistant a lot today. It resets in 24 hours.");

  try {
    if (mode === "draft") {
      const brief = clip(b.brief, 600);
      if (brief.length < 8) return fail(400, "Tell us a bit more: what are you promoting, and any price, date or place?");
      const tpl = templateById(clip(b.template, 40));
      const script = await draftScript(keys(), { brief, template: tpl?.name, brand: clip(b.brand, 40), cta: clip(b.cta, 40) });
      await db.from("assist_usage").insert({ user_id: user.id, kind: "draft" });
      return NextResponse.json({ script });
    }

    const text = clip(b.text, 1200);
    if (!text) return fail(400, "Write or draft the English script first.");
    const targets = (Array.isArray(b.to) ? b.to : []).map(String).filter((c) => c in LANGUAGE_INFO && c !== "en").slice(0, 6);
    if (!targets.length) return fail(400, "Pick a language to translate into.");
    const translations = await translateScript(keys(), text, targets);
    await db.from("assist_usage").insert({ user_id: user.id, kind: "translate" });
    return NextResponse.json({ translations });
  } catch (err) {
    console.error("assist failed", err);
    return fail(502, "The script assistant is busy. Try again in a moment, or write it yourself.");
  }
}
