/** Compare immutable inference evidence across additive audit schema revisions. */
export function retrospectiveAuditsMatch(
  saved: Readonly<Record<string, unknown>>,
  replayed: Readonly<Record<string, unknown>>,
) {
  const core = [
    "version",
    "passed",
    "sourceRowsSha256",
    "sourceRowsFileSha256",
    "foldManifestSha256",
    "foldFitManifestSha256",
    "analysisSha256",
    "predictionsSha256",
    "shots",
    "games",
    "maximumGbProbabilityError",
    "maximumGlmProbabilityError",
  ];
  const additive = ["policySha256", "sourceOnly", "sourceMetadataSha256"];
  return (
    core.every(
      (key) => saved[key] !== undefined && saved[key] === replayed[key],
    ) &&
    additive.every(
      (key) =>
        !Object.prototype.hasOwnProperty.call(saved, key) ||
        saved[key] === replayed[key],
    )
  );
}
