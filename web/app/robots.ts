import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ayiko.ai";
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/app", "/auth/", "/admin"] }, sitemap: `${site}/sitemap.xml` };
}
