import { useSubmitDraftPick } from "../src/hooks/main/useDraftHub";
import { useWeeklyEditionNewsroom } from "../src/hooks/main/useWeeklyEditions";
import { useJobAdmin } from "../src/hooks/main/useJobs";
// Compile-only fixtures: exported for type checking, never mounted or invoked.
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { makeFunctionReference } from "convex/server";
import { api } from "../convex/_generated/api";
import { useAppMutation } from "../src/hooks/main/useAppMutation";
import { useAppAction } from "../src/hooks/main/useAppAction";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
function expectType<T extends true>(value: T) {
  return value;
}

export function useGeneratedWriteTypeFixture(
  pickArgs: FunctionArgs<typeof api.draft.submitPick>,
  editionArgs: FunctionArgs<typeof api.weeklyEditions.generateWithAi>,
) {
  const pick = useAppMutation(api.draft.submitPick);
  const edition = useAppAction(api.weeklyEditions.generateWithAi);
  const pickResult = pick.mutateAsync(pickArgs);
  const editionResult = edition.mutateAsync(editionArgs);
  expectType<
    Equal<
      typeof pickResult,
      Promise<FunctionReturnType<typeof api.draft.submitPick>>
    >
  >(true);
  expectType<
    Equal<
      typeof editionResult,
      Promise<FunctionReturnType<typeof api.weeklyEditions.generateWithAi>>
    >
  >(true);
  pick.mutate(pickArgs, {
    onSuccess(result) {
      expectType<
        Equal<typeof result, FunctionReturnType<typeof api.draft.submitPick>>
      >(true);
      const completed: string = result.completedPickId;
      const next: string | null = result.nextPickId;
      // @ts-expect-error Generated result does not contain an edition model.
      void result.model;
      return { completed, next };
    },
    onError(_error) {
      expectType<Equal<typeof _error, Error>>(true);
    },
  });
  // @ts-expect-error The generated mutation requires seasonId, pickId and playerId.
  void pick.mutateAsync({});
  // @ts-expect-error Callback writes must also preserve required arguments.
  pick.mutate({});
  // @ts-expect-error Convex IDs must preserve their table.
  void pick.mutateAsync({ ...pickArgs, playerId: pickArgs.seasonId });
  // @ts-expect-error Unknown mutation fields are rejected.
  void pick.mutateAsync({ ...pickArgs, unexpected: true });
  // @ts-expect-error The action requires a week and issue type.
  void edition.mutateAsync({ seasonId: editionArgs.seasonId });
  // @ts-expect-error Issue type is the generated literal union.
  void edition.mutateAsync({ ...editionArgs, issueType: "invalid" });
  // @ts-expect-error Unknown action fields are rejected.
  void edition.mutateAsync({ ...editionArgs, unexpected: true });
  return { pickResult, editionResult };
}

const noArgs = makeFunctionReference<"mutation", Record<string, never>, null>(
  "test:noArgs",
);
const optional = makeFunctionReference<
  "action",
  { label?: string },
  { ok: true }
>("test:optional");

export function useEdgeWriteTypeFixture() {
  const emptyWrite = useAppMutation(noArgs);
  const optionalWrite = useAppAction(optional);
  void emptyWrite.mutateAsync();
  const emptyResult = emptyWrite.mutateAsync({});
  const optionalResult = optionalWrite.mutateAsync({});
  expectType<Equal<typeof emptyResult, Promise<null>>>(true);
  expectType<Equal<typeof optionalResult, Promise<{ ok: true }>>>(true);
  void optionalWrite.mutateAsync({ label: "valid" });
  // @ts-expect-error Optional values retain their argument types.
  void optionalWrite.mutateAsync({ label: 42 });
  // @ts-expect-error Empty arguments do not accept arbitrary fields.
  void emptyWrite.mutateAsync({ extra: true });
  emptyWrite.mutate(
    {},
    {
      onSuccess(_value) {
        expectType<Equal<typeof _value, null>>(true);
      },
    },
  );
  return { emptyResult, optionalResult };
}

export function useDomainWriteTypeFixture() {
  const pick = useSubmitDraftPick();
  const args = { seasonId: "season", pickId: "pick", playerId: "player" };
  const result = pick.mutateAsync(args);
  expectType<
    Equal<
      typeof result,
      Promise<FunctionReturnType<typeof api.draft.submitPick>>
    >
  >(true);
  pick.mutate(args, {
    onSuccess(_value) {
      expectType<
        Equal<typeof _value, FunctionReturnType<typeof api.draft.submitPick>>
      >(true);
    },
  });
  // @ts-expect-error The domain adapter preserves required arguments.
  void pick.mutateAsync({ seasonId: "season" });
  // @ts-expect-error Domain IDs accept strings, not numbers.
  void pick.mutateAsync({ ...args, playerId: 42 });
  const newsroom = useWeeklyEditionNewsroom();
  void newsroom.setHomeActive.mutateAsync({});
  void newsroom.setHomeActive.mutateAsync({ editionId: "edition" });
  void newsroom.generateWithAi.mutateAsync({
    seasonId: "season",
    weekId: "week",
    // @ts-expect-error The mapped action still checks generated issue types.
    issueType: "invalid",
  });
  const jobs = useJobAdmin();
  jobs.start.mutate(
    { jobName: "job", apply: false, args: {} },
    {
      onSuccess(_value) {
        expectType<
          Equal<typeof _value, FunctionReturnType<typeof api.frontend.startJob>>
        >(true);
      },
    },
  );
  return result;
}
