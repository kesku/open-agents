import type { Metadata } from "next";
import { ModelProvidersSection } from "../model-providers-section";

export const metadata: Metadata = {
  title: "Models",
  description: "Configure OpenAI-compatible model providers.",
};

export default function ModelsPage() {
  return <ModelProvidersSection />;
}
