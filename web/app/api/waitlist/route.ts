import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { WAITLIST_LANGS, WAITLIST_ROLES } from "@/lib/content";

export const runtime = "nodejs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send the form as JSON." }, { status: 400 });
  }

  // Bots fill the hidden "website" field; pretend it worked.
  if (clip(body.website, 200)) return NextResponse.json({ ok: true });

  const name = clip(body.name, 120);
  const email = clip(body.email, 200).toLowerCase();
  const language = WAITLIST_LANGS.includes(clip(body.language, 40)) ? clip(body.language, 40) : "Other";
  const role = WAITLIST_ROLES.includes(clip(body.role, 60)) ? clip(body.role, 60) : "Other";
  const idea = clip(body.idea, 300);

  if (!name) return NextResponse.json({ error: "Add your name so we know who you are." }, { status: 400 });
  if (!EMAIL.test(email)) return NextResponse.json({ error: "Enter a valid email, like ama@example.com." }, { status: 400 });

  const db = supabaseServer();
  if (!db) {
    return NextResponse.json({ error: "The waitlist opens in a few days. Please check back soon." }, { status: 503 });
  }

  const { error } = await db.from("waitlist").upsert(
    {
      name, email, language, role, idea,
      country: req.headers.get("x-vercel-ip-country") ?? null,
      source: clip(req.headers.get("referer"), 300) || null,
    },
    { onConflict: "email", ignoreDuplicates: true },
  );
  if (error) {
    console.error("waitlist insert failed", error.message);
    return NextResponse.json({ error: "We couldn't save that. Try again in a moment." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
