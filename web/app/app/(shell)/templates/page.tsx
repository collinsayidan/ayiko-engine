import type { Metadata } from "next";
import { TemplatesView } from "@/components/app/TemplatesView";

export const metadata: Metadata = { title: "Templates · Ayiko.ai", robots: { index: false } };

export default function TemplatesPage() {
  return <TemplatesView />;
}
