import { requireActiveUser } from "@gshl-lib/auth/require-user";
import { redirect } from "next/navigation";

export default async function DraftBoardPage() {
  await requireActiveUser("/draftboard");
  redirect("/draft");
}
