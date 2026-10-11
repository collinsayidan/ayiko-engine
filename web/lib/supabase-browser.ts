"use client";
import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "./env";

let client: ReturnType<typeof createBrowserClient> | undefined;
export function supabaseBrowser() {
  client ??= createBrowserClient(publicEnv.url, publicEnv.publishableKey);
  return client;
}
