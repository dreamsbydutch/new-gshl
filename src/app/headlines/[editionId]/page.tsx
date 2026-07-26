import { WeeklyEditionPageContent } from "@gshl-components/headlines/WeeklyEditionPageContent";
import type { WeeklyEditionRouteProps } from "@gshl-types";

export default async function WeeklyEditionPage({
  params,
}: WeeklyEditionRouteProps) {
  const { editionId } = await params;
  return <WeeklyEditionPageContent editionId={editionId} />;
}
