const articleAuthorSchema = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        position: { type: "string" },
        scope: { type: "string", enum: ["league"] },
      },
      required: ["name", "position", "scope"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        position: { type: "string" },
        scope: { type: "string", enum: ["conference"] },
        conferenceId: { type: "string" },
        conferenceName: { type: "string" },
      },
      required: ["name", "position", "scope", "conferenceId", "conferenceName"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        position: { type: "string" },
        scope: { type: "string", enum: ["team"] },
        teamId: { type: "string" },
        teamName: { type: "string" },
      },
      required: ["name", "position", "scope", "teamId", "teamName"],
    },
  ],
} as const;

export const WEEKLY_EDITION_OPENAI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string" },
    deck: { type: "string" },
    sections: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: {
            type: "string",
            enum: [
              "article_1",
              "article_2",
              "article_3",
              "article_4",
              "article_5",
              "article_6",
            ],
          },
          kind: {
            type: "string",
            enum: ["primary_article", "standard_article"],
          },
          eyebrow: { type: "string" },
          headline: { type: "string" },
          body: { type: "string" },
          author: articleAuthorSchema,
          links: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                label: { type: "string" },
                href: { type: "string" },
              },
              required: ["label", "href"],
            },
          },
        },
        required: [
          "id",
          "kind",
          "eyebrow",
          "headline",
          "body",
          "author",
          "links",
        ],
      },
    },
  },
  required: ["headline", "deck", "sections"],
} as const;

export function buildWeeklyEditionOpenAiRequest({
  model,
  prompt,
}: {
  model: string;
  prompt: string;
}) {
  return {
    model,
    store: false,
    max_output_tokens: 8000,
    instructions:
      "Write one grounded GSHL Press Box edition. Follow the supplied fact, voice, author, link, and length rules exactly. Return JSON matching the response schema and nothing else.",
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "gshl_weekly_edition",
        strict: true,
        schema: WEEKLY_EDITION_OPENAI_SCHEMA,
      },
    },
  };
}

type OpenAiOutputContent = {
  type?: unknown;
  text?: unknown;
};

type OpenAiOutputItem = {
  type?: unknown;
  content?: unknown;
};

export function extractWeeklyEditionOpenAiText(value: unknown): string {
  if (!value || typeof value !== "object") {
    throw new Error("OpenAI returned an unreadable response");
  }

  const directText = (value as { output_text?: unknown }).output_text;
  if (typeof directText === "string" && directText.trim()) {
    return directText.trim();
  }

  const output = (value as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    throw new Error("OpenAI returned no newsletter content");
  }

  const contentItems: unknown[] = [];
  for (const item of output as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const content = (item as OpenAiOutputItem).content;
    if (Array.isArray(content)) contentItems.push(...(content as unknown[]));
  }

  const text = contentItems
    .filter(
      (content): content is OpenAiOutputContent =>
        Boolean(content) && typeof content === "object",
    )
    .filter((content) => content.type === "output_text")
    .map((content) =>
      typeof content.text === "string" ? content.text.trim() : "",
    )
    .filter(Boolean)
    .join("\n");

  if (!text) throw new Error("OpenAI returned no newsletter content");
  return text;
}
