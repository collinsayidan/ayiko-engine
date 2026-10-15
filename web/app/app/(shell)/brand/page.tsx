import type { Metadata } from "next";
import { BrandKitView } from "@/components/app/BrandKitView";

export const metadata: Metadata = { title: "Brand kit · Ayiko.ai", robots: { index: false } };

export default function BrandPage() {
  return <BrandKitView />;
}
