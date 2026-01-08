import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { fastSheetsReader, type SheetsModelName } from "@gshl-sheets";

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
      const snapshot = await fastSheetsReader.fetchSnapshot(models);
      return snapshot as unknown as Record<string, unknown[]>;
    }),
});
