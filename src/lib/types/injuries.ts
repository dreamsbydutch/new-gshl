export type PlayerInjury = {
  id: string;
  name: string;
  team: string;
  status: string;
  designation: string;
  description: string | null;
  comment: string | null;
  updatedAt: string | null;
  returnDate: string | null;
};

export type InjuryReport = {
  fetchedAt: number;
  sourceUpdatedAt: string;
  injuries: PlayerInjury[];
};

export type InjuryFeedState = {
  data: InjuryReport | null;
  error: string | null;
  loading: boolean;
};
