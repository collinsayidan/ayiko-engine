import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/app/LoginForm";
import { authConfigured } from "@/lib/env";
import { currentUser } from "@/lib/supabase";
import "../studio.css";

export const metadata: Metadata = { title: "Log in · Ayiko.ai", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/app";
  if (authConfigured() && (await currentUser())) redirect(next);
  return <LoginForm next={next} linkError={sp.error === "link"} configured={authConfigured()} />;
}
