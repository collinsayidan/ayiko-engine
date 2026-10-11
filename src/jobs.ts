import { randomUUID } from "node:crypto";
import type { LanguageCode } from "./languages";

export type JobStatus = "queued" | "running" | "succeeded" | "failed";
export type Step = "voice" | "video" | "captions" | "render";

export interface JobRecord {
  id: string;
  userId: string;
  projectId?: string;
  kind: "captioned_short";
  status: JobStatus;
  currentStep?: Step;
  language: LanguageCode;
  request: Record<string, unknown>;
  outputKey?: string;
  creditsCharged: number;
  error?: string;
  createdAt: string;
  finishedAt?: string;
}

export interface GenerationRecord {
  jobId: string;
  step: Step;
  provider: string;
  model?: string;
  language?: string;
  voiceId?: string;
  status: "succeeded" | "failed";
  latencyMs?: number;
  costUsd?: number;
  outputKey?: string;
  error?: string;
}

export interface JobStore {
  create(input: Pick<JobRecord, "userId" | "projectId" | "language" | "request">): Promise<JobRecord>;
  update(id: string, patch: Partial<Omit<JobRecord, "id" | "userId">>): Promise<void>;
  addGeneration(g: GenerationRecord): Promise<void>;
  get(id: string): Promise<JobRecord | undefined>;
}

export class InMemoryJobStore implements JobStore {
  readonly jobs = new Map<string, JobRecord>();
  readonly generations: GenerationRecord[] = [];

  async create(input: Pick<JobRecord, "userId" | "projectId" | "language" | "request">) {
    const job: JobRecord = {
      id: randomUUID(), kind: "captioned_short", status: "queued", creditsCharged: 0,
      createdAt: new Date().toISOString(), ...input,
    };
    this.jobs.set(job.id, job);
    return job;
  }
  async update(id: string, patch: Partial<Omit<JobRecord, "id" | "userId">>) {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`no job ${id}`);
    Object.assign(job, patch);
  }
  async addGeneration(g: GenerationRecord) {
    this.generations.push(g);
  }
  async get(id: string) {
    return this.jobs.get(id);
  }
}
