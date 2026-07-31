import type OpenAI from "openai";

type StructuredCompletionOptions = {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  schemaName: string;
  schema: Record<string, unknown>;
  temperature?: number;
  /**
   * Room for the JSON that comes back. Reasoning tokens are not counted against
   * it — see the reserve below.
   */
  maxTokens?: number;
  /** Reasoning-tier models (e.g. gpt-5.6-*) only support the default temperature (1). */
  supportsTemperature?: boolean;
  /**
   * Whether this model thinks before it answers. Set it from the model spec, not
   * from a guess at the id.
   */
  reasoning?: boolean;
};

/**
 * Extra completion budget for a model that reasons.
 *
 * The API counts reasoning tokens against max_completion_tokens, so a budget
 * sized for the document alone can be spent entirely on thinking and return an
 * empty message — which is exactly what gpt-5.6-sol did to the resume step at
 * 4000: 2874 completion tokens, no content, a 500 back to the user. The reserve
 * is on top of the caller's budget so that number keeps meaning "room for the
 * answer" at every call site, and it scales with the answer because a longer
 * document is a longer thing to think about.
 */
function completionBudget(maxTokens: number, reasoning: boolean): number {
  return reasoning ? maxTokens + Math.max(4000, maxTokens * 2) : maxTokens;
}

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
    reasoning = false,
  }: StructuredCompletionOptions
): Promise<StructuredCompletionResult<T>> {
  const completion = await client.chat.completions.create({
    model,
    messages,
    ...(supportsTemperature ? { temperature: temperature ?? 0.3 } : {}),
    max_completion_tokens: completionBudget(maxTokens ?? 2000, reasoning),
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
    // Distinguished because the two have different fixes: running out of room
    // is a budget to raise here, while an empty stop is a retry.
    throw new Error(
      completion.choices[0]?.finish_reason === "length"
        ? `${model} ran out of completion budget before it produced anything. Raise maxTokens for this step.`
        : "Model returned an empty response. Try again."
    );
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
