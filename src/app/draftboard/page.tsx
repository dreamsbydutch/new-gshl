import { DraftBoardContent } from "@gshl-components/draft/DraftBoardContent";
import { requireActiveUser } from "@gshl-lib/auth/require-user";

export default async function DraftBoardPage() {
  await requireActiveUser("/draftboard");
  return <DraftBoardContent />;
}
