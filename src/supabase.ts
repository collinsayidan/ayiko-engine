import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "./config";
import { InsufficientCreditsError, type Ledger, type LedgerReason } from "./credits";
import type { GenerationRecord, JobRecord, JobStore } from "./jobs";

/** Server-only client with the service role. Never ship this key to the browser. */
export function supabaseAdmin(config: Config): SupabaseClient {
  const key = config.SUPABASE_SECRET_KEY ?? config.SUPABASE_SERVICE_ROLE_KEY;
  if (!config.SUPABASE_URL || !key) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY).");
  }
  return createClient(config.SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export class SupabaseLedger implements Ledger {
  constructor(private readonly db: SupabaseClient) {}

  async balance(userId: string) {
    const { data, error } = await this.db.from("credit_balances").select("balance").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return (data?.balance as number | undefined) ?? 0;
  }

  async spend(userId: string, amount: number, jobId: string) {
    const { data, error } = await this.db.rpc("spend_credits", { p_user: userId, p_amount: amount, p_job: jobId });
    if (error) {
      if (error.message.includes("insufficient_credits")) {
        throw new InsufficientCreditsError(amount, Number(error.details ?? 0));
      }
      throw error;
    }
    return data as number;
  }

  async refund(jobId: string) {
    const { data, error } = await this.db.rpc("refund_job", { p_job: jobId });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  async grant(userId: string, amount: number, reason: LedgerReason, stripePaymentId?: string) {
    const { error } = await this.db.rpc("grant_credits", {
      p_user: userId, p_amount: amount, p_reason: reason, p_stripe_payment_id: stripePaymentId ?? null,
    });
    if (error) throw error;
  }
}

const STEP_KIND = { voice: "audio", video: "video", captions: "captions", render: "render" } as const;

export class SupabaseJobStore implements JobStore {
  constructor(private readonly db: SupabaseClient) {}

  async create(input: Pick<JobRecord, "userId" | "projectId" | "language" | "request">): Promise<JobRecord> {
    const { data, error } = await this.db
      .from("jobs")
      .insert({ user_id: input.userId, project_id: input.projectId ?? null, language: input.language, request: input.request })
      .select()
      .single();
    if (error) throw error;
    return toJob(data);
  }

  async update(id: string, patch: Partial<Omit<JobRecord, "id" | "userId">>) {
    const row: Record<string, unknown> = {};
    if ("status" in patch) row.status = patch.status;
    if ("currentStep" in patch) row.current_step = patch.currentStep ?? null;
    if ("creditsCharged" in patch) row.credits_charged = patch.creditsCharged;
    if ("error" in patch) row.error = patch.error ?? null;
    if ("finishedAt" in patch) row.finished_at = patch.finishedAt ?? null;
    if (patch.outputKey) {
      const job = await this.get(id);
      row.output_asset_id = await this.insertAsset(job!.userId, job!.projectId, "render", patch.outputKey);
    }
    const { error } = await this.db.from("jobs").update(row).eq("id", id);
    if (error) throw error;
  }

  async addGeneration(g: GenerationRecord) {
    let outputAssetId: string | null = null;
    if (g.outputKey && g.step !== "render") {
      const job = await this.get(g.jobId);
      outputAssetId = await this.insertAsset(job!.userId, job!.projectId, STEP_KIND[g.step], g.outputKey);
    }
    const { error } = await this.db.from("generations").insert({
      job_id: g.jobId, step: g.step, provider: g.provider, model: g.model ?? null, language: g.language ?? null,
      voice_id: g.voiceId ?? null, status: g.status, provider_cost_usd: g.costUsd ?? null,
      latency_ms: g.latencyMs ?? null, output_asset_id: outputAssetId, error: g.error ?? null,
    });
    if (error) throw error;
  }

  async get(id: string) {
    const { data, error } = await this.db.from("jobs").select().eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? toJob(data) : undefined;
  }

  private async insertAsset(userId: string, projectId: string | undefined, kind: string, storageKey: string) {
    const { data, error } = await this.db
      .from("assets")
      .insert({ user_id: userId, project_id: projectId ?? null, kind, storage_key: storageKey })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }
}

function toJob(r: Record<string, any>): JobRecord {
  return {
    id: r.id, userId: r.user_id, projectId: r.project_id ?? undefined, kind: "captioned_short",
    status: r.status, currentStep: r.current_step ?? undefined, language: r.language, request: r.request,
    creditsCharged: r.credits_charged, error: r.error ?? undefined, createdAt: r.created_at,
    finishedAt: r.finished_at ?? undefined,
  };
}
