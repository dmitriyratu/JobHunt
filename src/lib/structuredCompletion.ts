import type OpenAI from "openai";

type StructuredCompletionOptions = {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  schemaName: string;
  schema: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  /** Reasoning-tier models (e.g. gpt-5.6-*) only support the default temperature (1). */
  supportsTemperature?: boolean;
};

export type UsageStats = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type StructuredCompletionResult<T> = {
  result: T;
  usage: UsageStats;
};

export async function createStructuredCompletion<T>(
  client: OpenAI,
  {
    model,
    messages,
    schemaName,
    schema,
    temperature,
    maxTokens,
    supportsTemperature = true,
  }: StructuredCompletionOptions
): Promise<StructuredCompletionResult<T>> {
  const completion = await client.chat.completions.create({
    model,
    messages,
    ...(supportsTemperature ? { temperature: temperature ?? 0.3 } : {}),
    max_completion_tokens: maxTokens ?? 2000,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: schemaName,
        strict: true,
        schema,
      },
    },
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Model returned an empty response. Try again.");
  }

  let result: T;
  try {
    result = JSON.parse(content) as T;
  } catch {
    throw new Error("Model returned malformed JSON. Try again.");
  }

  const usage: UsageStats = {
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    totalTokens: completion.usage?.total_tokens ?? 0,
  };

  return { result, usage };
}
