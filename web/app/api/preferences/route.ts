import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/api";

export const runtime = "nodejs";

/** Account preferences. For now: "email me when videos are ready". */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("res" in auth) return auth.res;
  const b = (await req.json().catch(() => ({}))) as { emailUpdates?: unknown };
  if (typeof b.emailUpdates !== "boolean") return fail(400, "Nothing to update.");
  const { error } = await auth.db.from("profiles").update({ email_updates: b.emailUpdates }).eq("id", auth.user.id);
  if (error) return fail(500, "We couldn't save that. Try again.");
  return NextResponse.json({ ok: true, emailUpdates: b.emailUpdates });
}
