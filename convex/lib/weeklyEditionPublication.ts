import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { WeeklyEditionFactPacket } from "../../src/lib/types";
import {
  buildTemplateWeeklyEdition,
  hashWeeklyEditionSource,
  validateWeeklyEditionContent,
  validateWeeklyEditionImport,
} from "../../src/lib/utils/features/weekly-edition";
import { toUtcTimestamp } from "./timestamps";

type Edition = Doc<"weeklyEditions">;
type Editor = Id<"authUsers"> | undefined;
export type EditionPublicationSource = Pick<
  Edition,
  | "seasonId"
  | "weekId"
  | "editionKey"
  | "issueType"
  | "issueLabel"
  | "seasonName"
  | "weekNum"
> & {
  startDate: number | null;
  endDate: number | null;
  scheduledFor: number | null;
  facts: WeeklyEditionFactPacket;
};
export type TemplatePublicationOptions = {
  editedBy?: Id<"authUsers">;
  refreshSource?: boolean;
  replaceEditorial?: boolean;
};

async function findEdition(
  ctx: MutationCtx,
  source: Pick<Edition, "seasonId" | "editionKey">,
) {
  return ctx.db
    .query("weeklyEditions")
    .withIndex("by_seasonId_editionKey", (q) =>
      q.eq("seasonId", source.seasonId).eq("editionKey", source.editionKey),
    )
    .unique();
}

async function requireEdition(ctx: MutationCtx, id: Id<"weeklyEditions">) {
  const edition = await ctx.db.get(id);
  if (!edition) throw new Error("Edition not found");
  return edition;
}

/** Content replacements snapshot the previous content; presentation changes do not. */
async function patchEdition(
  ctx: MutationCtx,
  edition: Edition,
  values: Partial<Omit<Edition, "_id" | "_creationTime">>,
  editedBy: Editor,
  revision: boolean,
) {
  const now = Date.now();
  if (revision) {
    await ctx.db.insert("weeklyEditionRevisions", {
      editionId: edition._id,
      generationMode: edition.generationMode,
      content: edition.content as unknown,
      sourceHash: edition.sourceHash,
      createdAt: now,
      editedBy,
    });
  }
  await ctx.db.patch(edition._id, { ...values, editedBy, updatedAt: now });
  return ctx.db.get(edition._id);
}

async function persistPublication(
  ctx: MutationCtx,
  existing: Edition | null,
  source: EditionPublicationSource,
  content: unknown,
  generationMode: "template" | "openai",
  editedBy: Editor,
) {
  const { seasonId, weekId, startDate, endDate, scheduledFor, ...metadata } =
    source;
  if (startDate === null || endDate === null || scheduledFor === null) {
    throw new Error("The weekly edition schedule contains an invalid date");
  }
  const values = {
    ...metadata,
    startDate,
    endDate,
    scheduledFor,
    content,
    generationMode,
    status: "published" as const,
    sourceHash: hashWeeklyEditionSource(source.facts),
  };
  if (existing) {
    return {
      state: "updated" as const,
      existing: await patchEdition(ctx, existing, values, editedBy, true),
    };
  }
  const now = Date.now();
  const id = await ctx.db.insert("weeklyEditions", {
    seasonId,
    weekId,
    ...values,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
    editedBy,
  });
  return { state: "inserted" as const, existing: await ctx.db.get(id) };
}

/** Scheduled milestones are snapshots; weekly templates track changed facts automatically. */
export async function publishTemplateEdition(
  ctx: MutationCtx,
  source: EditionPublicationSource,
  options: TemplatePublicationOptions = {},
) {
  const existing = await findEdition(ctx, source);
  if (
    existing &&
    ((source.issueType !== "weekly" && options.refreshSource !== true) ||
      existing.sourceHash === hashWeeklyEditionSource(source.facts))
  ) {
    return { state: "unchanged" as const, existing };
  }
  if (
    existing &&
    existing.generationMode !== "template" &&
    options.replaceEditorial !== true
  ) {
    return { state: "protected" as const, existing };
  }
  return persistPublication(
    ctx,
    existing,
    source,
    buildTemplateWeeklyEdition(source.facts),
    "template",
    options.editedBy,
  );
}

export async function publishAiEdition(
  ctx: MutationCtx,
  request: EditionPublicationSource & {
    existingEditionId?: Id<"weeklyEditions">;
    expectedUpdatedAt?: number;
    sourceHash: string;
    raw: string;
    editedBy: Id<"authUsers">;
  },
) {
  // Generation crosses an action boundary: revalidate the initiating commissioner's access.
  const user = await ctx.db.get(request.editedBy);
  if (user?.status !== "active" || user.role !== "commissioner")
    throw new Error("Forbidden");
  if (hashWeeklyEditionSource(request.facts) !== request.sourceHash) {
    throw new Error("The newsletter fact packet failed its integrity check");
  }
  const validation = validateWeeklyEditionImport(request.raw, request.facts);
  if (!validation.valid || !validation.content)
    throw new Error(validation.errors.join("\n"));
  const existing = request.existingEditionId
    ? await ctx.db.get(request.existingEditionId)
    : null;
  const changed = "The newsletter changed while OpenAI was writing it";
  if (request.existingEditionId && !existing) throw new Error(changed);
  if (
    existing &&
    (existing.seasonId !== request.seasonId ||
      existing.weekId !== request.weekId ||
      existing.editionKey !== request.editionKey ||
      toUtcTimestamp(existing.updatedAt) !== request.expectedUpdatedAt)
  )
    throw new Error(changed);
  if (!existing && (await findEdition(ctx, request))) throw new Error(changed);
  // Select only stored source fields: concurrency tokens and raw model output stay transient.
  const source: EditionPublicationSource = {
    seasonId: request.seasonId,
    weekId: request.weekId,
    editionKey: request.editionKey,
    issueType: request.issueType,
    issueLabel: request.issueLabel,
    seasonName: request.seasonName,
    weekNum: request.weekNum,
    startDate: request.startDate,
    endDate: request.endDate,
    scheduledFor: request.scheduledFor,
    facts: request.facts,
  };
  return (
    await persistPublication(
      ctx,
      existing,
      source,
      validation.content,
      "openai",
      request.editedBy,
    )
  ).existing;
}

export async function editEdition(
  ctx: MutationCtx,
  editionId: Id<"weeklyEditions">,
  edit:
    | { mode: "manual"; content: unknown }
    | { mode: "chatgpt_import"; raw: string },
  editedBy: Id<"authUsers">,
) {
  const edition = await requireEdition(ctx, editionId);
  const facts = edition.facts as WeeklyEditionFactPacket;
  const result =
    edit.mode === "manual"
      ? validateWeeklyEditionContent(edit.content, facts)
      : validateWeeklyEditionImport(edit.raw, facts);
  if (!result.valid || !result.content)
    throw new Error(result.errors.join("\n"));
  return patchEdition(
    ctx,
    edition,
    {
      content: result.content,
      generationMode: edit.mode,
      ...(edit.mode === "chatgpt_import"
        ? { status: "published" as const }
        : {}),
    },
    editedBy,
    true,
  );
}

export async function restoreEditionRevision(
  ctx: MutationCtx,
  revisionId: Id<"weeklyEditionRevisions">,
  editedBy: Id<"authUsers">,
) {
  const revision = await ctx.db.get(revisionId);
  if (!revision) throw new Error("Revision not found");
  const edition = await requireEdition(ctx, revision.editionId);
  // Revisions historically store copy and its source hash, not a complete fact snapshot.
  return patchEdition(
    ctx,
    edition,
    {
      content: revision.content as unknown,
      generationMode: revision.generationMode,
      sourceHash: revision.sourceHash,
    },
    editedBy,
    true,
  );
}

export async function setEditionVisibility(
  ctx: MutationCtx,
  id: Id<"weeklyEditions">,
  status: Edition["status"],
  editedBy: Id<"authUsers">,
) {
  const edition = await requireEdition(ctx, id);
  return patchEdition(
    ctx,
    edition,
    {
      status,
      isHomeActive: status === "hidden" ? false : edition.isHomeActive,
    },
    editedBy,
    false,
  );
}

export async function setEditionSectionActive(
  ctx: MutationCtx,
  id: Id<"weeklyEditions">,
  sectionId: string,
  active: boolean,
  editedBy: Id<"authUsers">,
) {
  const edition = await requireEdition(ctx, id);
  const sections = (edition.content as { sections: Array<{ id: string }> })
    .sections;
  if (!sections.some((section) => section.id === sectionId))
    throw new Error("Article not found in this edition");
  const inactive = new Set(edition.inactiveSectionIds ?? []);
  if (active) inactive.delete(sectionId);
  else inactive.add(sectionId);
  return patchEdition(
    ctx,
    edition,
    { inactiveSectionIds: [...inactive] },
    editedBy,
    false,
  );
}

export async function setEditionHomeActive(
  ctx: MutationCtx,
  id: Id<"weeklyEditions"> | undefined,
  editedBy: Id<"authUsers">,
) {
  const target = id ? await requireEdition(ctx, id) : null;
  if (target && target.status !== "published")
    throw new Error("Only a published edition can appear on the homepage");
  const active = await ctx.db
    .query("weeklyEditions")
    .withIndex("by_homeActive_publishedAt", (q) => q.eq("isHomeActive", true))
    .collect();
  for (const edition of active) {
    if (edition._id !== id)
      await patchEdition(
        ctx,
        edition,
        { isHomeActive: false },
        editedBy,
        false,
      );
  }
  if (target)
    await patchEdition(ctx, target, { isHomeActive: true }, editedBy, false);
  return { activeEditionId: target ? String(target._id) : null };
}
