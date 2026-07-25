import type OpenAI from "openai";

type StructuredCompletionOptions = {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  schemaName: string;
  schema: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
};

export async function createStructuredCompletion<T>(
  client: OpenAI,
  { model, messages, schemaName, schema, temperature, maxTokens }: StructuredCompletionOptions
): Promise<T> {
  const completion = await client.chat.completions.create({
    model,
    messages,
    temperature: temperature ?? 0.3,
    max_tokens: maxTokens ?? 2000,
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

  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error("Model returned malformed JSON. Try again.");
  }
}
