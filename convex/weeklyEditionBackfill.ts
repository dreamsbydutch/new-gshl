import { internalMutation } from "./_generated/server";
import type {
  WeeklyEditionContent,
  WeeklyEditionFactPacket,
} from "../src/lib/types";
import { buildTemplateWeeklyEdition } from "../src/lib/utils/features/weekly-edition";

function sixArticleContent(
  content: WeeklyEditionContent,
  facts: WeeklyEditionFactPacket,
) {
  const template = buildTemplateWeeklyEdition(facts);
  const existingById = new Map(
    content.sections.map((section) => [section.id, section]),
  );
  return {
    ...content,
    sections: template.sections.map(
      (section) => existingById.get(section.id) ?? section,
    ),
  };
}

export const normalizeArticleGrid = internalMutation({
  args: {},
  handler: async (ctx) => {
    const editions = await ctx.db.query("weeklyEditions").collect();
    let updatedEditions = 0;
    let updatedRevisions = 0;

    for (const edition of editions) {
      const content = sixArticleContent(
        edition.content as WeeklyEditionContent,
        edition.facts as WeeklyEditionFactPacket,
      );
      if (JSON.stringify(content) === JSON.stringify(edition.content)) continue;
      await ctx.db.insert("weeklyEditionRevisions", {
        editionId: edition._id,
        generationMode: edition.generationMode,
        content: edition.content as WeeklyEditionContent,
        sourceHash: edition.sourceHash,
        createdAt: Date.now(),
        editedBy: edition.editedBy,
      });
      const validIds = new Set(content.sections.map((section) => section.id));
      await ctx.db.patch(edition._id, {
        content,
        inactiveSectionIds: (edition.inactiveSectionIds ?? []).filter((id) =>
          validIds.has(id),
        ),
        updatedAt: Date.now(),
      });
      updatedEditions += 1;
    }

    const refreshedEditions = await ctx.db.query("weeklyEditions").collect();
    const factsByEditionId = new Map(
      refreshedEditions.map((edition) => [
        String(edition._id),
        edition.facts as WeeklyEditionFactPacket,
      ]),
    );
    const revisions = await ctx.db.query("weeklyEditionRevisions").collect();
    for (const revision of revisions) {
      const facts = factsByEditionId.get(String(revision.editionId));
      if (!facts) continue;
      const content = sixArticleContent(
        revision.content as WeeklyEditionContent,
        facts,
      );
      if (JSON.stringify(content) === JSON.stringify(revision.content)) {
        continue;
      }
      await ctx.db.patch(revision._id, { content });
      updatedRevisions += 1;
    }

    return {
      editions: editions.length,
      revisions: revisions.length,
      updatedEditions,
      updatedRevisions,
    };
  },
});
