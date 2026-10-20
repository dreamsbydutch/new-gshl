# Nonlinear shot inference contract

This research scorer consumes numeric tree exports from the frozen nonlinear
experiment. It does not replace production xG. Exporter compatibility is pinned
to scikit-learn 1.7.1; unsupported versions or categorical tree splits fail.

The vector contains the existing sixteen shot features followed by shooting-home
(0/1), own and opposing skater counts, and own and opposing goalie presence
(0/1). The first sixteen values must be finite. Context follows the Python
research encoder exactly: missing/non-string/not-four-character situation or
missing shooting side yields five NaNs. A four-character malformed code keeps
a known shooting-home indicator and uses NaN for the other four values.
Valid codes match `[01][3-6][3-6][01]`; counts and goalie flags are oriented to
the recorded shooting side. No identity or outcome enters the vector.

Each tree starts at node zero. Finite feature values go left when
`value <= threshold`, otherwise right. NaN follows `missing_go_to_left`.
Leaf values already contain sklearn's learning-rate scaling: add each selected
leaf once to the exported initial log odds, in tree iteration order. Convert
the final log odds with a stable logistic function without probability clipping.
Thresholds, values and initial log odds must be finite.

The loader validates the version, feature names, indices and numeric flags,
and requires every node to be reachable exactly once from the root. Cycles,
shared children, unreachable nodes and malformed leaves fail.

Before downstream RAPM use, compare TypeScript against every retained Python
held-out prediction; require maximum absolute probability error below `1e-12`.
Synthetic tests cover exact threshold equality, missing branches, additive tree
order and malformed artifacts. This verifies inference parity, not accuracy or
authorization to promote the model.

The reproducible chronological trainer, exporter and synthetic-context predictor
are retained in `scripts/python/nhl_rating/`, with a separate pinned research
requirements file. Run from the repository root; each command exposes `--help`.
The durable TypeScript parity command is
`scripts/src/commands/ratings/verify-nhl-nonlinear-parity.ts`. Existing retained
models keep their original script hashes; relocating the equivalent workflow
does not retroactively change their recorded provenance.
