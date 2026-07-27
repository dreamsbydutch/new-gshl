import { internalMutation } from "./_generated/server";
import {
  CONFERENCE_LEAD_REPORTERS_BY_LEGACY_ID,
  FRANCHISE_BEAT_WRITERS_BY_LEGACY_ID,
} from "./lib/reporterDirectory";
import type {
  WeeklyEditionAuthor,
  WeeklyEditionContent,
  WeeklyEditionFactPacket,
} from "../src/lib/types";
import {
  hashWeeklyEditionSource,
  WEEKLY_EDITION_STAFF,
} from "../src/lib/utils/features/weekly-edition";

type ReporterLookups = {
  team: Map<string, string>;
  conference: Map<string, string>;
};

const STAFF_BY_POSITION = new Map<string, WeeklyEditionAuthor>([
  ["Editor-in-Chief", { ...WEEKLY_EDITION_STAFF.editorInChief }],
  ["Head of Analytics", { ...WEEKLY_EDITION_STAFF.headOfAnalytics }],
  ["GSHL Head Insider", { ...WEEKLY_EDITION_STAFF.headInsider }],
  ["GSHL Insider", { ...WEEKLY_EDITION_STAFF.insider }],
  ["National Reporter", { ...WEEKLY_EDITION_STAFF.nationalReporter }],
  ["Analytics Reporter", { ...WEEKLY_EDITION_STAFF.analyticsReporter }],
]);

function migrateAuthor(
  author: WeeklyEditionAuthor | undefined,
  lookups: ReporterLookups,
) {
  if (!author) return author;
  if (author.scope === "team" && author.teamId) {
    const name = lookups.team.get(author.teamId);
    return name ? { ...author, name } : author;
  }
  if (author.scope === "conference" && author.conferenceId) {
    const name = lookups.conference.get(author.conferenceId);
    return name ? { ...author, name } : author;
  }
  const staff = STAFF_BY_POSITION.get(author.position);
  return staff ? { ...staff } : author;
}

function migrateContent(
  content: WeeklyEditionContent,
  lookups: ReporterLookups,
) {
  return {
    ...content,
    sections: content.sections.map((section) => ({
      ...section,
      author: migrateAuthor(section.author, lookups),
    })),
  };
}

function migrateFacts(
  facts: WeeklyEditionFactPacket,
  lookups: ReporterLookups,
) {
  return {
    ...facts,
    teams: facts.teams.map((team) => ({
      ...team,
      beatWriter: lookups.team.get(team.teamId) ?? team.beatWriter,
      leadReporter:
        (team.conferenceId
          ? lookups.conference.get(team.conferenceId)
          : undefined) ?? team.leadReporter,
    })),
  };
}

export const backfillReporterNames = internalMutation({
  args: {},
  handler: async (ctx) => {
    const [conferences, franchises, teams, editions, revisions] =
      await Promise.all([
        ctx.db.query("conferences").collect(),
        ctx.db.query("franchises").collect(),
        ctx.db.query("teams").collect(),
        ctx.db.query("weeklyEditions").collect(),
        ctx.db.query("weeklyEditionRevisions").collect(),
      ]);
    const desiredConferenceReporterById = new Map(
      conferences.flatMap((conference) => {
        const reporter =
          CONFERENCE_LEAD_REPORTERS_BY_LEGACY_ID[
            String(conference.legacyId ?? "")
          ];
        return reporter ? [[String(conference._id), reporter] as const] : [];
      }),
    );
    const desiredBeatWriterByFranchiseId = new Map(
      franchises.flatMap((franchise) => {
        const reporter =
          FRANCHISE_BEAT_WRITERS_BY_LEGACY_ID[String(franchise.legacyId ?? "")];
        return reporter ? [[String(franchise._id), reporter] as const] : [];
      }),
    );
    const desiredBeatWriterByTeamId = new Map(
      teams.flatMap((team) => {
        const reporter = desiredBeatWriterByFranchiseId.get(
          String(team.franchiseId),
        );
        return reporter ? [[String(team._id), reporter] as const] : [];
      }),
    );
    const lookups: ReporterLookups = {
      team: desiredBeatWriterByTeamId,
      conference: desiredConferenceReporterById,
    };
    let updatedConferences = 0;
    let updatedFranchises = 0;
    let updatedEditions = 0;
    let updatedRevisions = 0;

    for (const conference of conferences) {
      const leadReporter = desiredConferenceReporterById.get(
        String(conference._id),
      );
      if (!leadReporter || conference.leadReporter === leadReporter) continue;
      await ctx.db.patch(conference._id, {
        leadReporter,
        updatedAt: Date.now(),
      });
      updatedConferences += 1;
    }

    for (const franchise of franchises) {
      const beatWriter = desiredBeatWriterByFranchiseId.get(
        String(franchise._id),
      );
      if (!beatWriter || franchise.beatWriter === beatWriter) continue;
      await ctx.db.patch(franchise._id, {
        beatWriter,
        updatedAt: Date.now(),
      });
      updatedFranchises += 1;
    }

    const sourceHashByEditionId = new Map<string, string>();
    for (const edition of editions) {
      const facts = migrateFacts(
        edition.facts as WeeklyEditionFactPacket,
        lookups,
      );
      const content = migrateContent(
        edition.content as WeeklyEditionContent,
        lookups,
      );
      const sourceHash = hashWeeklyEditionSource(facts);
      sourceHashByEditionId.set(String(edition._id), sourceHash);
      if (
        JSON.stringify(facts) === JSON.stringify(edition.facts) &&
        JSON.stringify(content) === JSON.stringify(edition.content) &&
        sourceHash === edition.sourceHash
      ) {
        continue;
      }
      await ctx.db.patch(edition._id, {
        facts,
        content,
        sourceHash,
        updatedAt: Date.now(),
      });
      updatedEditions += 1;
    }

    for (const revision of revisions) {
      const content = migrateContent(
        revision.content as WeeklyEditionContent,
        lookups,
      );
      const sourceHash =
        sourceHashByEditionId.get(String(revision.editionId)) ??
        revision.sourceHash;
      if (
        JSON.stringify(content) === JSON.stringify(revision.content) &&
        sourceHash === revision.sourceHash
      ) {
        continue;
      }
      await ctx.db.patch(revision._id, { content, sourceHash });
      updatedRevisions += 1;
    }

    return {
      conferences: conferences.length,
      franchises: franchises.length,
      editions: editions.length,
      revisions: revisions.length,
      updatedConferences,
      updatedFranchises,
      updatedEditions,
      updatedRevisions,
    };
  },
});
