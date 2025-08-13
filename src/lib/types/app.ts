import type { Conference, Franchise } from "./database";

export type FranchisePlus = Franchise & {
  conference: Conference | undefined;
  teamId: number;
};
