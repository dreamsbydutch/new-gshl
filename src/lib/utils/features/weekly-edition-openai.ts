import type {
  WeeklyEditionArticleCount,
  WeeklyEditionAuthor,
  WeeklyEditionStoryPitch,
  WeeklyEditionStorySubmission,
} from "@gshl-types";
import {
  buildWeeklyEditionArticleSlots,
  DEFAULT_WEEKLY_EDITION_ARTICLE_COUNT,
} from "./weekly-edition-articles";

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

const pitchScoreSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    consequence: { type: "integer", minimum: 1, maximum: 5 },
    readerInterest: { type: "integer", minimum: 1, maximum: 5 },
    evidenceStrength: { type: "integer", minimum: 1, maximum: 5 },
    freshness: { type: "integer", minimum: 1, maximum: 5 },
  },
  required: ["consequence", "readerInterest", "evidenceStrength", "freshness"],
} as const;

export const WEEKLY_EDITION_PITCH_OPENAI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    submissions: {
      type: "array",
      minItems: 1,
      maxItems: 64,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          author: articleAuthorSchema,
          pitches: {
            type: "array",
            minItems: 0,
            maxItems: 2,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                pitchId: { type: "string" },
                leadCandidateId: { type: "string" },
                supportingCandidateIds: {
                  type: "array",
                  minItems: 0,
                  maxItems: 2,
                  items: { type: "string" },
                },
                proposedHeadline: { type: "string" },
                angle: { type: "string" },
                scores: pitchScoreSchema,
              },
              required: [
                "pitchId",
                "leadCandidateId",
                "supportingCandidateIds",
                "proposedHeadline",
                "angle",
                "scores",
              ],
            },
          },
        },
        required: ["author", "pitches"],
      },
    },
  },
  required: ["submissions"],
} as const;

export function buildWeeklyEditionOpenAiSchema(
  articleCount: WeeklyEditionArticleCount = DEFAULT_WEEKLY_EDITION_ARTICLE_COUNT,
) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      headline: { type: "string" },
      deck: { type: "string" },
      sections: {
        type: "array",
        minItems: articleCount,
        maxItems: articleCount,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: {
              type: "string",
              enum: buildWeeklyEditionArticleSlots(articleCount).map(
                (slot) => slot.id,
              ),
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
}

export function buildWeeklyEditionOpenAiRequest({
  model,
  prompt,
  articleCount = DEFAULT_WEEKLY_EDITION_ARTICLE_COUNT,
}: {
  model: string;
  prompt: string;
  articleCount?: WeeklyEditionArticleCount;
}) {
  return {
    model,
    store: false,
    max_output_tokens: 8000 + (articleCount - 6) * 1000,
    instructions:
      "Write one grounded GSHL Press Box edition. Follow the supplied fact, voice, author, link, and length rules exactly. Return JSON matching the response schema and nothing else.",
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "gshl_weekly_edition",
        strict: true,
        schema: buildWeeklyEditionOpenAiSchema(articleCount),
      },
    },
  };
}

export function buildWeeklyEditionPitchOpenAiRequest({
  model,
  prompt,
}: {
  model: string;
  prompt: string;
}) {
  return {
    model,
    store: false,
    max_output_tokens: 12000,
    instructions:
      "Run the GSHL Press Box pitch meeting. Every supplied writer must inspect only their eligible beat and return zero to two grounded pitches. Return JSON matching the response schema and nothing else.",
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "gshl_newsroom_pitches",
        strict: true,
        schema: WEEKLY_EDITION_PITCH_OPENAI_SCHEMA,
      },
    },
  };
}

function nonEmptyString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`OpenAI pitch response has an invalid ${field}`);
  }
  return value.trim();
}

function authorFromJson(value: unknown): WeeklyEditionAuthor {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("OpenAI pitch response has an invalid author");
  }
  const row = value as Record<string, unknown>;
  const scope = row.scope;
  if (scope !== "league" && scope !== "conference" && scope !== "team") {
    throw new Error("OpenAI pitch response has an invalid author scope");
  }
  const author: WeeklyEditionAuthor = {
    name: nonEmptyString(row.name, "author name"),
    position: nonEmptyString(row.position, "author position"),
    scope,
  };
  if (scope === "conference") {
    author.conferenceId = nonEmptyString(
      row.conferenceId,
      "author conferenceId",
    );
    author.conferenceName = nonEmptyString(
      row.conferenceName,
      "author conferenceName",
    );
  }
  if (scope === "team") {
    author.teamId = nonEmptyString(row.teamId, "author teamId");
    author.teamName = nonEmptyString(row.teamName, "author teamName");
  }
  return author;
}

function pitchScore(value: unknown, field: string) {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5) {
    throw new Error(`OpenAI pitch response has an invalid ${field} score`);
  }
  return Number(value);
}

function pitchFromJson(value: unknown): WeeklyEditionStoryPitch {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("OpenAI pitch response contains an invalid pitch");
  }
  const row = value as Record<string, unknown>;
  const supportingCandidateIds = row.supportingCandidateIds;
  const scores = row.scores;
  if (
    !Array.isArray(supportingCandidateIds) ||
    supportingCandidateIds.length > 2 ||
    !supportingCandidateIds.every(
      (candidateId) => typeof candidateId === "string" && candidateId.trim(),
    )
  ) {
    throw new Error(
      "OpenAI pitch response has invalid supporting candidate IDs",
    );
  }
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
    throw new Error("OpenAI pitch response has invalid pitch scores");
  }
  const scoreRow = scores as Record<string, unknown>;
  return {
    pitchId: nonEmptyString(row.pitchId, "pitchId"),
    leadCandidateId: nonEmptyString(row.leadCandidateId, "leadCandidateId"),
    supportingCandidateIds: supportingCandidateIds.map((candidateId) =>
      String(candidateId).trim(),
    ),
    proposedHeadline: nonEmptyString(row.proposedHeadline, "proposedHeadline"),
    angle: nonEmptyString(row.angle, "angle"),
    scores: {
      consequence: pitchScore(scoreRow.consequence, "consequence"),
      readerInterest: pitchScore(scoreRow.readerInterest, "readerInterest"),
      evidenceStrength: pitchScore(
        scoreRow.evidenceStrength,
        "evidenceStrength",
      ),
      freshness: pitchScore(scoreRow.freshness, "freshness"),
    },
  };
}

export function parseWeeklyEditionStorySubmissions(
  raw: string,
): WeeklyEditionStorySubmission[] {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("OpenAI returned unreadable newsroom pitches");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("OpenAI returned an invalid newsroom pitch desk");
  }
  const submissions = (value as { submissions?: unknown }).submissions;
  if (!Array.isArray(submissions) || submissions.length === 0) {
    throw new Error("OpenAI returned no newsroom pitch submissions");
  }
  return submissions.map((submission) => {
    if (!submission || typeof submission !== "object") {
      throw new Error("OpenAI returned an invalid newsroom submission");
    }
    const row = submission as { author?: unknown; pitches?: unknown };
    if (!Array.isArray(row.pitches) || row.pitches.length > 2) {
      throw new Error("OpenAI returned an invalid newsroom pitch list");
    }
    return {
      author: authorFromJson(row.author),
      pitches: row.pitches.map(pitchFromJson),
    };
  });
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
