import OpenAI from "openai";
import { getModelForTier, type ModelTier } from "@/lib/models";

export function getOpenAIClient(apiKey?: string): OpenAI {
  const key = apiKey?.trim() || process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OpenAI API key is required. Paste your key in Settings or add it to .env."
    );
  }
  return new OpenAI({ apiKey: key });
}

export function resolveModel(modelTier?: ModelTier): string {
  return getModelForTier(modelTier);
}
