import { HydrateClient, serverApi } from "@gshl-trpc/server-exports";
import { ScheduleClientPage } from "./ScheduleClient";

/**
 * Schedule Page
 * =============
 * Server component that prefetches schedule data and renders the client component.
 *
 * @description
 * This page demonstrates the recommended pattern for Next.js App Router pages:
 * - Server component handles data prefetching
 * - Simple, declarative structure with no business logic
 * - Delegates rendering to client component
 * - Uses HydrateClient for seamless tRPC cache hydration
 *
 * @pattern
 * ```
 * Server (page.tsx):
 *   - Prefetch data via serverApi
 *   - Wrap in HydrateClient
 *   - Render client component
 *
 * Client (ScheduleClient.tsx):
 *   - Read from store/hooks
 *   - Render feature components
 *   - No data fetching logic
 * ```
 */
export default async function SchedulePage() {
  // Prefetch all schedule data on the server for optimal performance
  // This populates the tRPC cache before client hydration
  await Promise.all([
    serverApi.matchup.getAll.prefetch({
      where: { seasonId: "12" },
      orderBy: { seasonId: "asc" },
    }),
    serverApi.team.getAll.prefetch({
      where: { seasonId: "12" },
      orderBy: { seasonId: "asc" },
    }),
    serverApi.week.getAll.prefetch({
      where: { seasonId: "12" },
      orderBy: { startDate: "asc" },
    }),
    serverApi.season.getAll.prefetch({ orderBy: { year: "asc" } }),
    serverApi.season.getById.prefetch({ id: "12" }),
  ]);

  return (
    <HydrateClient>
      <ScheduleClientPage />
    </HydrateClient>
  );
}
