/**
 * @fileoverview Aggregation Configuration Definitions
 *
 * This module defines specific configurations for each type of stat aggregation
 * in the system. Each configuration specifies how to group records, which stats
 * to sum, and how to build output records.
 *
 * **Aggregation Types:**
 * 1. Player Day → Week
 * 2. Player Week → Split (by team + seasonType)
 * 3. Player Week → Total (all teams + seasonType)
 * 4. Team Day → Week
 * 5. Team Week → Season (by seasonType)
 *
 * @module aggregation-configs
 */

import type {
  PlayerDayStatLine,
  PlayerWeekStatLine,
  TeamDayStatLine,
  TeamWeekStatLine,
  AggregationConfig,
  PlayerWeekStatLineInput,
  PlayerSplitStatLineInput,
  PlayerTotalStatLineInput,
  TeamDayStatLineInput,
  TeamWeekStatLineInput,
  TeamSeasonStatLineInput,
} from "@gshl-types";
import { PositionGroup } from "@gshl-types";
import {
  createPlayerStatFields,
  createTeamStatFields,
  createTeamDayToWeekStatFields,
  extractUniqueDates,
  extractUniquePositions,
  extractUniqueTeams,
  extractUniqueGshlTeams,
  getSeasonType,
} from "./stat-aggregation";

/* ============================================================================
 * PLAYER DAY → WEEK CONFIGURATION
 * ========================================================================= */

export const playerDayToWeekConfig: AggregationConfig<
  PlayerDayStatLine,
  PlayerWeekStatLineInput
> = {
  buildGroupKey: (record) =>
    `${record.playerId}:${record.weekId}:${record.gshlTeamId}`,

  parseGroupKey: (key) => {
    const [playerId, weekId, gshlTeamId] = key.split(":");
    return { playerId: playerId!, weekId: weekId!, gshlTeamId: gshlTeamId! };
  },

  buildOutputRecord: (keyParts, stats, metadata) => {
    const isGoalie =
      String(metadata.posGroup) === "G" ||
      metadata.posGroup === PositionGroup.G;

    return {
      seasonId: metadata.seasonId as string,
      gshlTeamId: keyParts.gshlTeamId!,
      playerId: keyParts.playerId!,
      weekId: keyParts.weekId!,
      nhlPos: metadata.nhlPos as string[],
      posGroup: String(metadata.posGroup),
      nhlTeam: metadata.nhlTeam as string,
      days: String(metadata.days),
      GP: String(stats.GP ?? 0),
      MG: String(stats.MG ?? 0),
      IR: String(stats.IR ?? 0),
      IRplus: String(stats.IRplus ?? 0),
      GS: String(stats.GS ?? 0),
      G: isGoalie ? undefined : String(stats.G ?? 0),
      A: isGoalie ? undefined : String(stats.A ?? 0),
      P: isGoalie ? undefined : String(stats.P ?? 0),
      PM: isGoalie ? undefined : String(stats.PM ?? 0),
      PIM: isGoalie ? undefined : String(stats.PIM ?? 0),
      PPP: isGoalie ? undefined : String(stats.PPP ?? 0),
      SOG: isGoalie ? undefined : String(stats.SOG ?? 0),
      HIT: isGoalie ? undefined : String(stats.HIT ?? 0),
      BLK: isGoalie ? undefined : String(stats.BLK ?? 0),
      W: isGoalie ? String(stats.W ?? 0) : undefined,
      GA: isGoalie ? String(stats.GA ?? 0) : undefined,
      GAA: isGoalie ? (stats.GAA ?? 0).toFixed(4) : undefined,
      SV: isGoalie ? String(stats.SV ?? 0) : undefined,
      SA: isGoalie ? String(stats.SA ?? 0) : undefined,
      SVP: isGoalie ? (stats.SVP ?? 0).toFixed(6) : undefined,
      SO: isGoalie ? String(stats.SO ?? 0) : undefined,
      TOI: isGoalie ? String(stats.TOI ?? 0) : undefined,
      Rating: String(stats.Rating ?? 0),
      ADD: String(stats.ADD ?? 0),
      MS: String(stats.MS ?? 0),
      BS: String(stats.BS ?? 0),
    };
  },

  statFields: createPlayerStatFields(),

  metadataExtractors: {
    seasonId: (records) => records[0]?.seasonId,
    posGroup: (records) => records[0]?.posGroup,
    days: (records) => extractUniqueDates(records),
    nhlPos: (records) => extractUniquePositions(records),
    nhlTeam: (records) => extractUniqueTeams(records),
  },
};

/* ============================================================================
 * PLAYER WEEK → SPLIT CONFIGURATION
 * ========================================================================= */

export const playerWeekToSplitConfig: AggregationConfig<
  PlayerWeekStatLine,
  PlayerSplitStatLineInput
> = {
  buildGroupKey: (record, metadata) => {
    const weekInfo = metadata?.get(record.weekId);
    const seasonType = weekInfo ? getSeasonType(weekInfo.weekType ?? "") : "RS";
    return `${record.playerId}:${record.seasonId}:${record.gshlTeamId}:${seasonType}`;
  },

  parseGroupKey: (key) => {
    const [playerId, seasonId, gshlTeamId, seasonType] = key.split(":");
    return {
      playerId: playerId!,
      seasonId: seasonId!,
      gshlTeamId: gshlTeamId!,
      seasonType: seasonType!,
    };
  },

  buildOutputRecord: (keyParts, stats, metadata) => {
    const isGoalie =
      String(metadata.posGroup) === "G" ||
      metadata.posGroup === PositionGroup.G;

    return {
      seasonId: keyParts.seasonId!,
      gshlTeamId: keyParts.gshlTeamId!,
      playerId: keyParts.playerId!,
      seasonType: keyParts.seasonType!,
      nhlPos: metadata.nhlPos as string[],
      posGroup: String(metadata.posGroup),
      nhlTeam: metadata.nhlTeam as string,
      days: String(metadata.days),
      GP: String(stats.GP ?? 0),
      MG: String(stats.MG ?? 0),
      IR: String(stats.IR ?? 0),
      IRplus: String(stats.IRplus ?? 0),
      GS: String(stats.GS ?? 0),
      G: isGoalie ? undefined : String(stats.G ?? 0),
      A: isGoalie ? undefined : String(stats.A ?? 0),
      P: isGoalie ? undefined : String(stats.P ?? 0),
      PM: isGoalie ? undefined : String(stats.PM ?? 0),
      PIM: isGoalie ? undefined : String(stats.PIM ?? 0),
      PPP: isGoalie ? undefined : String(stats.PPP ?? 0),
      SOG: isGoalie ? undefined : String(stats.SOG ?? 0),
      HIT: isGoalie ? undefined : String(stats.HIT ?? 0),
      BLK: isGoalie ? undefined : String(stats.BLK ?? 0),
      W: isGoalie ? String(stats.W ?? 0) : undefined,
      GA: isGoalie ? String(stats.GA ?? 0) : undefined,
      GAA: isGoalie ? (stats.GAA ?? 0).toFixed(4) : undefined,
      SV: isGoalie ? String(stats.SV ?? 0) : undefined,
      SA: isGoalie ? String(stats.SA ?? 0) : undefined,
      SVP: isGoalie ? (stats.SVP ?? 0).toFixed(6) : undefined,
      SO: isGoalie ? String(stats.SO ?? 0) : undefined,
      TOI: isGoalie ? String(stats.TOI ?? 0) : undefined,
      Rating: String(stats.Rating ?? 0),
      ADD: String(stats.ADD ?? 0),
      MS: String(stats.MS ?? 0),
      BS: String(stats.BS ?? 0),
    };
  },

  statFields: createPlayerStatFields(),

  metadataExtractors: {
    posGroup: (records) => records[0]?.posGroup,
    days: (records) =>
      records.reduce((sum, r) => sum + parseFloat(r.days ?? "0"), 0),
    nhlPos: (records) => extractUniquePositions(records),
    nhlTeam: (records) => extractUniqueTeams(records),
  },
};

/* ============================================================================
 * PLAYER WEEK → TOTAL CONFIGURATION
 * ========================================================================= */

export const playerWeekToTotalConfig: AggregationConfig<
  PlayerWeekStatLine,
  PlayerTotalStatLineInput
> = {
  buildGroupKey: (record, metadata) => {
    const weekInfo = metadata?.get(record.weekId);
    const seasonType = weekInfo ? getSeasonType(weekInfo.weekType ?? "") : "RS";
    return `${record.playerId}:${record.seasonId}:${seasonType}`;
  },

  parseGroupKey: (key) => {
    const [playerId, seasonId, seasonType] = key.split(":");
    return {
      playerId: playerId!,
      seasonId: seasonId!,
      seasonType: seasonType!,
    };
  },

  buildOutputRecord: (keyParts, stats, metadata) => {
    const isGoalie =
      String(metadata.posGroup) === "G" ||
      metadata.posGroup === PositionGroup.G;

    return {
      seasonId: keyParts.seasonId!,
      gshlTeamIds: metadata.gshlTeamIds as string[],
      playerId: keyParts.playerId!,
      seasonType: keyParts.seasonType!,
      nhlPos: metadata.nhlPos as string[],
      posGroup: String(metadata.posGroup),
      nhlTeam: metadata.nhlTeam as string,
      days: String(metadata.days),
      GP: String(stats.GP ?? 0),
      MG: String(stats.MG ?? 0),
      IR: String(stats.IR ?? 0),
      IRplus: String(stats.IRplus ?? 0),
      GS: String(stats.GS ?? 0),
      G: isGoalie ? undefined : String(stats.G ?? 0),
      A: isGoalie ? undefined : String(stats.A ?? 0),
      P: isGoalie ? undefined : String(stats.P ?? 0),
      PM: isGoalie ? undefined : String(stats.PM ?? 0),
      PIM: isGoalie ? undefined : String(stats.PIM ?? 0),
      PPP: isGoalie ? undefined : String(stats.PPP ?? 0),
      SOG: isGoalie ? undefined : String(stats.SOG ?? 0),
      HIT: isGoalie ? undefined : String(stats.HIT ?? 0),
      BLK: isGoalie ? undefined : String(stats.BLK ?? 0),
      W: isGoalie ? String(stats.W ?? 0) : undefined,
      GA: isGoalie ? String(stats.GA ?? 0) : undefined,
      GAA: isGoalie ? (stats.GAA ?? 0).toFixed(4) : undefined,
      SV: isGoalie ? String(stats.SV ?? 0) : undefined,
      SA: isGoalie ? String(stats.SA ?? 0) : undefined,
      SVP: isGoalie ? (stats.SVP ?? 0).toFixed(6) : undefined,
      SO: isGoalie ? String(stats.SO ?? 0) : undefined,
      TOI: isGoalie ? String(stats.TOI ?? 0) : undefined,
      Rating: String(stats.Rating ?? 0),
      ADD: String(stats.ADD ?? 0),
      MS: String(stats.MS ?? 0),
      BS: String(stats.BS ?? 0),
    };
  },

  statFields: createPlayerStatFields(),

  metadataExtractors: {
    posGroup: (records) => records[0]?.posGroup,
    days: (records) =>
      records.reduce((sum, r) => sum + parseFloat(r.days ?? "0"), 0),
    nhlPos: (records) => extractUniquePositions(records),
    nhlTeam: (records) => extractUniqueTeams(records),
    gshlTeamIds: (records) => extractUniqueGshlTeams(records),
  },
};

/* ============================================================================
 * PLAYER DAY → TEAM DAY CONFIGURATION
 * ========================================================================= */

export const playerDayToTeamDayConfig: AggregationConfig<
  PlayerDayStatLine,
  TeamDayStatLineInput
> = {
  buildGroupKey: (record) => {
    const dateStr =
      record.date instanceof Date
        ? record.date.toISOString().split("T")[0]
        : String(record.date).split("T")[0];
    return `${record.gshlTeamId}:${dateStr}`;
  },

  parseGroupKey: (key) => {
    const [gshlTeamId, dateStr] = key.split(":");
    return { gshlTeamId: gshlTeamId!, dateStr: dateStr! };
  },

  buildOutputRecord: (keyParts, stats, metadata) => {
    return {
      seasonId: metadata.seasonId as string,
      gshlTeamId: keyParts.gshlTeamId!,
      weekId: metadata.weekId as string,
      date: new Date(keyParts.dateStr!),
      GP: stats.GP0 ?? 0,
      MG: stats.MG0 ?? 0,
      IR: stats.IR0 ?? 0,
      IRplus: stats.IRplus0 ?? 0,
      GS: stats.GS0 ?? 0,
      G: stats.G0 ?? 0,
      A: stats.A0 ?? 0,
      P: stats.P0 ?? 0,
      PM: stats.PM0 ?? 0,
      PIM: stats.PIM0 ?? 0,
      PPP: stats.PPP0 ?? 0,
      SOG: stats.SOG0 ?? 0,
      HIT: stats.HIT0 ?? 0,
      BLK: stats.BLK0 ?? 0,
      W: stats.W0 ?? 0,
      GA: stats.GA0 ?? 0,
      GAA: stats.GAA0 ?? 0,
      SV: stats.SV0 ?? 0,
      SA: stats.SA0 ?? 0,
      SVP: stats.SVP0 ?? 0,
      SO: stats.SO0 ?? 0,
      TOI: stats.TOI0 ?? 0,
      Rating: stats.Rating0 ?? 0,
      ADD: stats.ADD0 ?? 0,
      MS: stats.MS0 ?? 0,
      BS: stats.BS0 ?? 0,
    };
  },

  statFields: createTeamStatFields(),

  metadataExtractors: {
    seasonId: (records) => records[0]?.seasonId,
    weekId: (records) => records[0]?.weekId,
  },
};

/* ============================================================================
 * TEAM DAY → WEEK CONFIGURATION
 * ========================================================================= */

export const teamDayToWeekConfig: AggregationConfig<
  TeamDayStatLine,
  TeamWeekStatLineInput
> = {
  buildGroupKey: (record) => `${record.gshlTeamId}:${record.weekId}`,

  parseGroupKey: (key) => {
    const [gshlTeamId, weekId] = key.split(":");
    return { gshlTeamId: gshlTeamId!, weekId: weekId! };
  },

  buildOutputRecord: (keyParts, stats, metadata) => ({
    seasonId: metadata.seasonId as string,
    gshlTeamId: keyParts.gshlTeamId!,
    weekId: keyParts.weekId!,
    days: metadata.days as number,
    GP: stats.GP0 ?? 0,
    MG: stats.MG0 ?? 0,
    IR: stats.IR0 ?? 0,
    IRplus: stats.IRplus0 ?? 0,
    GS: stats.GS0 ?? 0,
    G: stats.G0 ?? 0,
    A: stats.A0 ?? 0,
    P: stats.P0 ?? 0,
    PM: stats.PM0 ?? 0,
    PIM: stats.PIM0 ?? 0,
    PPP: stats.PPP0 ?? 0,
    SOG: stats.SOG0 ?? 0,
    HIT: stats.HIT0 ?? 0,
    BLK: stats.BLK0 ?? 0,
    W: stats.W0 ?? 0,
    GA: stats.GA0 ?? 0,
    GAA: stats.GAA0 ?? 0,
    SV: stats.SV0 ?? 0,
    SA: stats.SA0 ?? 0,
    SVP: stats.SVP0 ?? 0,
    SO: stats.SO0 ?? 0,
    TOI: stats.TOI0 ?? 0,
    Rating: stats.Rating0 ?? 0,
    ADD: stats.ADD0 ?? 0,
    MS: stats.MS0 ?? 0,
    BS: stats.BS0 ?? 0,
  }),

  statFields: createTeamDayToWeekStatFields(),

  metadataExtractors: {
    seasonId: (records) => records[0]?.seasonId,
    days: (records) => extractUniqueDates(records),
  },
};

/* ============================================================================
 * TEAM WEEK → SEASON CONFIGURATION
 * ========================================================================= */

export const teamWeekToSeasonConfig: AggregationConfig<
  TeamWeekStatLine,
  TeamSeasonStatLineInput
> = {
  buildGroupKey: (record, metadata) => {
    const weekInfo = metadata?.get(record.weekId);
    const seasonType = weekInfo ? weekInfo.weekType : "RS";
    return `${record.gshlTeamId}:${record.seasonId}:${seasonType}`;
  },

  parseGroupKey: (key) => {
    const [gshlTeamId, seasonId, seasonType] = key.split(":");
    return {
      gshlTeamId: gshlTeamId!,
      seasonId: seasonId!,
      seasonType: seasonType!,
    };
  },

  buildOutputRecord: (keyParts, stats, metadata) => ({
    seasonId: keyParts.seasonId!,
    seasonType: keyParts.seasonType!,
    gshlTeamId: keyParts.gshlTeamId!,
    days: metadata.days as number,
    GP: stats.GP0 ?? 0,
    MG: stats.MG0 ?? 0,
    IR: stats.IR0 ?? 0,
    IRplus: stats.IRplus0 ?? 0,
    GS: stats.GS0 ?? 0,
    G: stats.G0 ?? 0,
    A: stats.A0 ?? 0,
    P: stats.P0 ?? 0,
    PM: stats.PM0 ?? 0,
    PIM: stats.PIM0 ?? 0,
    PPP: stats.PPP0 ?? 0,
    SOG: stats.SOG0 ?? 0,
    HIT: stats.HIT0 ?? 0,
    BLK: stats.BLK0 ?? 0,
    W: stats.W0 ?? 0,
    GA: stats.GA0 ?? 0,
    GAA: stats.GAA0 ?? 0,
    SV: stats.SV0 ?? 0,
    SA: stats.SA0 ?? 0,
    SVP: stats.SVP0 ?? 0,
    SO: stats.SO0 ?? 0,
    TOI: stats.TOI0 ?? 0,
    Rating: stats.Rating0 ?? 0,
    ADD: stats.ADD0 ?? 0,
    MS: stats.MS0 ?? 0,
    BS: stats.BS0 ?? 0,
  }),

  statFields: createTeamDayToWeekStatFields(),

  metadataExtractors: {
    days: (records) =>
      records.reduce((sum, r) => sum + parseFloat(String(r.days ?? 0)), 0),
  },
};
