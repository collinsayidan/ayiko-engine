import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Config } from "./config";
import type { MediaBytes } from "./providers/types";

export interface Storage {
  put(key: string, media: MediaBytes): Promise<string>;
  get(key: string): Promise<MediaBytes>;
  /** A URL the browser can load (signed and short-lived for R2). */
  url(key: string, ttlS?: number): Promise<string>;
}

export const keys = {
  upload: (userId: string, name: string) => `users/${userId}/uploads/${Date.now()}-${name.replace(/[^\w.-]/g, "_")}`,
  voice: (userId: string, jobId: string) => `users/${userId}/jobs/${jobId}/voice.mp3`,
  clip: (userId: string, jobId: string) => `users/${userId}/jobs/${jobId}/clip.mp4`,
  output: (userId: string, jobId: string) => `users/${userId}/jobs/${jobId}/ayiko.mp4`,
};

const MIME: Record<string, string> = {
  mp3: "audio/mpeg", wav: "audio/wav", mp4: "video/mp4", png: "image/png",
  jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
};

function mediaFromKey(key: string, bytes: Uint8Array): MediaBytes {
  const ext = (key.split(".").pop() ?? "bin").toLowerCase();
  return { bytes, ext, mime: MIME[ext] ?? "application/octet-stream" };
}

function assertSafeKey(key: string) {
  if (key.includes("..") || key.startsWith("/")) throw new Error(`unsafe storage key: ${key}`);
}

export class LocalStorage implements Storage {
  private readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  private path(key: string) {
    assertSafeKey(key);
    return resolve(this.root, key);
  }
  async put(key: string, media: MediaBytes) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, media.bytes);
    return key;
  }
  async get(key: string) {
    return mediaFromKey(key, await readFile(this.path(key)));
  }
  async url(key: string) {
    return pathToFileURL(this.path(key)).toString();
  }
}

/** Cloudflare R2 through its S3-compatible API. */
export class R2Storage implements Storage {
  private s3: S3Client;
  constructor(accountId: string, accessKeyId: string, secretAccessKey: string, private readonly bucket: string) {
    this.s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  async put(key: string, media: MediaBytes) {
    assertSafeKey(key);
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: media.bytes, ContentType: media.mime }));
    return key;
  }
  async get(key: string) {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`empty object: ${key}`);
    return mediaFromKey(key, await res.Body.transformToByteArray());
  }
  async url(key: string, ttlS = 3600) {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: ttlS });
  }
}

export function buildStorage(config: Config): Storage {
  if (config.STORAGE === "local") return new LocalStorage(config.LOCAL_STORAGE_DIR);
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = config;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("STORAGE=r2 needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.");
  }
  return new R2Storage(R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET);
}
