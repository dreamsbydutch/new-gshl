"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  authorizationUrl,
  CALLBACK_PATH,
  decryptTokens,
  encryptTokens,
  exchangeTokens,
  hashToken,
  randomToken,
  readHockeyLeagues,
  type YahooLeague,
} from "./lib/yahooOAuth";

function config() {
  const clientId = process.env.YAHOO_CLIENT_ID;
  const secret = process.env.YAHOO_CLIENT_SECRET;
  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!clientId || !secret || !siteUrl)
    throw new Error(
      "Configure YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET in this Convex deployment.",
    );
  return {
    clientId,
    secret,
    siteUrl,
    redirectUri: `${siteUrl}${CALLBACK_PATH}`,
  };
}

// Run from the authenticated Convex dashboard/CLI, never from a public client.
export const beginConnection = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    connectUrl: string;
    callbackUrl: string;
    expiresInMinutes: number;
  }> => {
    const { siteUrl, redirectUri } = config();
    const ticket = randomToken();
    await ctx.runMutation(internal.yahooConnectionStore.begin, {
      ticketHash: hashToken(ticket),
    });
    return {
      connectUrl: `${siteUrl}/yahoo/connect?ticket=${ticket}`,
      callbackUrl: redirectUri,
      expiresInMinutes: 10,
    };
  },
});

export const startBrowserConnection = internalAction({
  args: { ticket: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ url: string; browserToken: string } | null> => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(args.ticket)) return null;
    const { clientId, redirectUri } = config();
    const state = randomToken();
    const browserToken = randomToken();
    const claimed = await ctx.runMutation(
      internal.yahooConnectionStore.claimTicket,
      {
        ticketHash: hashToken(args.ticket),
        stateHash: hashToken(state),
        browserHash: hashToken(browserToken),
      },
    );
    return claimed
      ? { url: authorizationUrl(clientId, redirectUri, state), browserToken }
      : null;
  },
});

export const finishConnection = internalAction({
  args: {
    state: v.string(),
    browserToken: v.string(),
    code: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<boolean> => {
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(args.state) ||
      !/^[A-Za-z0-9_-]{43}$/.test(args.browserToken)
    )
      return false;
    const { clientId, secret, redirectUri } = config();
    const lease = randomToken();
    const generation = await ctx.runMutation(
      internal.yahooConnectionStore.consumeState,
      {
        stateHash: hashToken(args.state),
        browserHash: hashToken(args.browserToken),
        lease,
      },
    );
    if (generation === null) return false;
    try {
      if (!args.code || args.code.length > 4096) return false;
      const tokens = await exchangeTokens(
        clientId,
        secret,
        new URLSearchParams({
          grant_type: "authorization_code",
          code: args.code,
          redirect_uri: redirectUri,
        }),
      );
      await ctx.runMutation(internal.yahooConnectionStore.save, {
        lease,
        generation,
        encryptedTokens: encryptTokens(tokens, secret),
      });
      return true;
    } finally {
      await ctx.runMutation(internal.yahooConnectionStore.release, { lease });
    }
  },
});

export const connectionStatus = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    configured: boolean;
    connected: boolean;
    callbackUrl: string | null;
    connectedAt: number | null;
    updatedAt: number | null;
  }> => {
    const row = await ctx.runQuery(internal.yahooConnectionStore.get, {});
    return {
      configured: Boolean(
        process.env.YAHOO_CLIENT_ID && process.env.YAHOO_CLIENT_SECRET,
      ),
      connected: Boolean(row?.encryptedTokens),
      callbackUrl: process.env.CONVEX_SITE_URL
        ? `${process.env.CONVEX_SITE_URL}${CALLBACK_PATH}`
        : null,
      connectedAt: row?.connectedAt ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  },
});

export const checkConnection = internalAction({
  args: { forceRefresh: v.optional(v.boolean()) },
  handler: async (
    ctx,
    args,
  ): Promise<{
    ok: true;
    refreshed: boolean;
    leagueCount: number;
    leagues: YahooLeague[];
  }> => {
    const { clientId, secret } = config();
    const lease = randomToken();
    const stored = await ctx.runMutation(
      internal.yahooConnectionStore.acquire,
      { lease },
    );
    try {
      let tokens = decryptTokens(stored.encryptedTokens, secret);
      const refreshed =
        Boolean(args.forceRefresh) || tokens.expiresAt <= Date.now() + 60_000;
      if (refreshed) {
        tokens = await exchangeTokens(
          clientId,
          secret,
          new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: tokens.refreshToken,
          }),
          tokens.refreshToken,
        );
        // Persist a rotated refresh token before making any Fantasy request.
        await ctx.runMutation(internal.yahooConnectionStore.save, {
          lease,
          generation: stored.generation,
          encryptedTokens: encryptTokens(tokens, secret),
        });
      }
      const leagues = await readHockeyLeagues(tokens.accessToken);
      return { ok: true, refreshed, leagueCount: leagues.length, leagues };
    } finally {
      await ctx.runMutation(internal.yahooConnectionStore.release, { lease });
    }
  },
});
