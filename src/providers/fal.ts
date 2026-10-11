import { createFalClient, type FalClient } from "@fal-ai/client";
import { ProviderError, type ImageToVideoRequest, type VideoProvider, type VideoResult } from "./types";

/**
 * Image-to-video through fal.ai. Any fal image-to-video endpoint works
 * (Kling, Seedance, Veo...) as long as it accepts `image_url` + `prompt`
 * and returns `{ video: { url } }`, which is the common fal shape.
 */
export class FalVideoProvider implements VideoProvider {
  readonly id = "fal";
  private client: FalClient;

  constructor(apiKey: string, private readonly model: string) {
    this.client = createFalClient({ credentials: apiKey });
  }

  async imageToVideo(req: ImageToVideoRequest): Promise<VideoResult> {
    try {
      const blob = new Blob([req.image.bytes as BlobPart], { type: req.image.mime });
      const imageUrl = await this.client.storage.upload(blob);

      const result = await this.client.subscribe(this.model, {
        input: { image_url: imageUrl, prompt: req.prompt, duration: String(req.durationS) },
      });
      const data = result.data as { video?: { url?: string } };
      const url = data.video?.url;
      if (!url) throw new ProviderError(this.id, `no video url in response from ${this.model}`);

      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new ProviderError(this.id, `download failed: HTTP ${res.status}`, res.status);
      return {
        bytes: new Uint8Array(await res.arrayBuffer()),
        mime: "video/mp4",
        ext: "mp4",
        provider: this.id,
        model: this.model,
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(this.id, err instanceof Error ? err.message : String(err));
    }
  }
}
