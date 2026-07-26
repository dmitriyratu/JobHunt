import OpenAI from "openai";
import { getModelForTier, type ModelTier } from "@/lib/models";

/**
 * The server-side OPENAI_API_KEY is a local-development convenience only.
 *
 * In production the app is a public URL with no authentication and no rate
 * limiting, so falling back to the owner's key would let any visitor spend
 * their credits. Deployed builds therefore require each visitor to supply
 * their own key, which is stored only in their own browser.
 *
 * Set ALLOW_SERVER_OPENAI_KEY=true to deliberately opt back in (e.g. a
 * private deployment behind other access controls).
 */
function serverFallbackKey(): string | undefined {
  const optedIn = process.env.ALLOW_SERVER_OPENAI_KEY === "true";
  if (process.env.NODE_ENV === "production" && !optedIn) return undefined;
  return process.env.OPENAI_API_KEY;
}

export function getOpenAIClient(apiKey?: string): OpenAI {
  const key = apiKey?.trim() || serverFallbackKey();
  if (!key) {
    throw new Error(
      "Add your OpenAI API key in AI settings to use this app. It stays in your browser."
    );
  }
  return new OpenAI({ apiKey: key });
}

export function resolveModel(modelTier?: ModelTier): string {
  return getModelForTier(modelTier);
}
