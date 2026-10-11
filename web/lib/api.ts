import "server-only";
import { NextResponse } from "next/server";
import { supabaseAdmin, currentUser } from "./supabase";

export const fail = (status: number, error: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ error, ...extra }, { status });

/** Signed-in user + admin client, or an error response. */
export async function requireUser() {
  const db = supabaseAdmin();
  if (!db) return { res: fail(503, "Ayiko isn't connected to its database yet.") } as const;
  const user = await currentUser();
  if (!user) return { res: fail(401, "Please log in again.") } as const;
  return { db, user } as const;
}
