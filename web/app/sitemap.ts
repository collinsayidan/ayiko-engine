import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ayiko.ai";
  return [{ url: site, changeFrequency: "weekly", priority: 1 }];
}
