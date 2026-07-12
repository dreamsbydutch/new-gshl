import type {
  Conference,
  Franchise,
  Owner,
} from "./database";

export type TeamRelations = {
  franchises?: Franchise[];
  conferences?: Conference[];
  owners?: Owner[];
};
