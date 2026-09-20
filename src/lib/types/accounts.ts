export type AccountEntryKind = "charge" | "payment" | "credit" | "refund";

export interface AccountRecordInput {
  ownerId: string;
  kind: AccountEntryKind;
  amountCents: number;
  effectiveAt: number;
  description: string;
  reference?: string;
  requestId: string;
}
