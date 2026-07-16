import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import type { SheetsModelName } from "@gshl-sheets";
import { fetchSnapshot } from "../sheets-store";

const snapshotSchema = z.object({
  models: z.array(z.string()).min(1),
});

/**
 * Snapshot router
 *
 * One call to fetch many models (grouped + batchGet per workbook).
 * This is intended to be cached on the client (BrowserDB/localStorage).
 */
export const snapshotRouter = createTRPCRouter({
  get: publicProcedure
    .input(snapshotSchema)
    .query(async ({ input }): Promise<Record<string, unknown[]>> => {
      const models = input.models as SheetsModelName[];
      const snapshot = await fetchSnapshot(models);
      return snapshot;
    }),
});
