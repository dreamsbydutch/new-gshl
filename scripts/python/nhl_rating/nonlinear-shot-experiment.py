"""Offline chronological experiment; run from the repository root. See --help."""
import os
for key in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ[key] = "2"

import argparse
import hashlib
import json
import platform
import subprocess
from pathlib import Path

import numpy as np
import scipy
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier
from threadpoolctl import threadpool_limits

SEED = 14731
GRID = [(leaves, l2) for leaves in (7, 15, 31) for l2 in (1, 10)]
FIXED = dict(loss="log_loss", max_iter=300, learning_rate=0.05,
             min_samples_leaf=50, early_stopping=False, random_state=SEED,
             max_bins=255, max_depth=None, categorical_features=None)

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def context(row):
    code, home = row.get("situation"), row.get("shootingHome")
    if not isinstance(code, str) or len(code) != 4 or type(home) is not bool:
        return [np.nan] * 5, "unknown"
    if code[0] not in "01" or code[3] not in "01" or code[1] not in "3456" or code[2] not in "3456":
        return [float(home)] + [np.nan] * 4, "unknown"
    own, opponent = (int(code[2]), int(code[1])) if home else (int(code[1]), int(code[2]))
    own_g, opponent_g = (int(code[3]), int(code[0])) if home else (int(code[0]), int(code[3]))
    label = f"{own}v{opponent}:{'G' if own_g else 'E'}{'G' if opponent_g else 'E'}:{'home' if home else 'away'}"
    return [float(home), own, opponent, own_g, opponent_g], label

def metrics(y, p):
    safe = np.clip(p, 1e-15, 1 - 1e-15)
    return dict(shots=int(len(y)), actualGoals=float(y.sum()), expectedGoals=float(p.sum()),
                brier=float(np.mean((p-y)**2)),
                logLoss=float(np.mean(-(y*np.log(safe)+(1-y)*np.log1p(-safe)))))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rows", required=True)
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if sklearn.__version__ != "1.7.1":
        raise ValueError("Frozen learner requires scikit-learn 1.7.1")
    source = json.loads(Path(args.rows).read_text(encoding="utf-8"))
    baseline = json.loads(Path(args.baseline).read_text(encoding="utf-8"))
    node_code = "const fs=require('fs'),c=require('crypto');const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(c.createHash('sha256').update(JSON.stringify(d.rows)).digest('hex'));"
    canonical_rows_hash = subprocess.check_output(["node", "-e", node_code, str(Path(args.rows).resolve())], text=True).strip()
    if canonical_rows_hash != source["rowsSha256"] or canonical_rows_hash != baseline["rowsSha256"]:
        raise ValueError("Saved row hash does not reproduce the baseline source")
    for key in ("season", "gameType", "scheduleSha256", "penaltyShotReportSha256", "effectiveGameSourceHashes"):
        if source[key] != baseline[key]:
            raise ValueError(f"Source provenance differs: {key}")
    rows = source["rows"]
    identities = [(r["gameId"], r["eventId"]) for r in rows]
    if len(set(identities)) != len(identities):
        raise ValueError("Duplicate shot identity")
    date_set = sorted(set(r["date"] for r in rows))
    train_end, frozen_before, test_from = [date_set[int(len(date_set)*x)] for x in (0.4, 0.6, 0.8)]
    if (train_end, frozen_before, test_from) != (baseline["trainEnd"], baseline["trainedBefore"], baseline["testFrom"]):
        raise ValueError("Chronological partitions do not match baseline")
    date = np.array([r["date"] for r in rows])
    y = np.array([r["goal"] for r in rows], dtype=float)
    geometry = np.array([r["features"] for r in rows], dtype=float)
    if geometry.shape != (len(rows), 16) or not np.isfinite(geometry).all() or not np.isin(y, [0, 1]).all():
        raise ValueError("Invalid features or labels")
    contexts = [context(r) for r in rows]
    X = np.column_stack([geometry, np.array([c[0] for c in contexts], dtype=float)])
    train, validation = date < train_end, (date >= train_end) & (date < frozen_before)
    refit, test = date < frozen_before, date >= test_from
    coefficients = np.array(baseline["baseline"]["model"]["coefficients"])
    z = np.clip(geometry[test] @ coefficients, -30, 30)
    baseline_p = 1 / (1 + np.exp(-z))
    baseline_metrics = metrics(y[test], baseline_p)
    expected_baseline = baseline["baseline"]["evaluation"]
    for key in ("shots", "actualGoals", "expectedGoals", "brier"):
        if abs(baseline_metrics[key]-expected_baseline[key]) > 1e-9:
            raise ValueError(f"Exact baseline replay mismatch: {key}")
    output = Path(args.output)
    output.mkdir()
    trials = []
    with threadpool_limits(limits=2):
        for leaves, l2 in GRID:
            model = HistGradientBoostingClassifier(**FIXED, max_leaf_nodes=leaves, l2_regularization=l2)
            model.fit(X[train], y[train])
            score = metrics(y[validation], model.predict_proba(X[validation])[:, 1])
            trial = dict(max_leaf_nodes=leaves, l2_regularization=l2, validation=score)
            trials.append(trial)
            print(json.dumps(dict(phase="validation", **trial)), flush=True)
        selected = min(trials, key=lambda t: (t["validation"]["brier"], t["max_leaf_nodes"], t["l2_regularization"]))
        model = HistGradientBoostingClassifier(**FIXED, max_leaf_nodes=selected["max_leaf_nodes"], l2_regularization=selected["l2_regularization"])
        model.fit(X[refit], y[refit])
        candidate_p = model.predict_proba(X[test])[:, 1]
    candidate_metrics = metrics(y[test], candidate_p)
    groups, games, predictions = {}, {}, []
    for i, (row, label) in enumerate([(r, contexts[j][1]) for j, r in enumerate(rows) if test[j]]):
        target, b, c = row["goal"], float(baseline_p[i]), float(candidate_p[i])
        group = groups.setdefault(label, dict(context=label, shots=0, actualGoals=0., baselineExpectedGoals=0., candidateExpectedGoals=0., baselineBrierSum=0., candidateBrierSum=0.))
        group["shots"] += 1
        group["actualGoals"] += target
        group["baselineExpectedGoals"] += b
        group["candidateExpectedGoals"] += c
        group["baselineBrierSum"] += (b-target)**2
        group["candidateBrierSum"] += (c-target)**2
        game = games.setdefault(row["gameId"], dict(gameId=row["gameId"], shots=0, baselineBrierSum=0., candidateBrierSum=0., baselineLogLossSum=0., candidateLogLossSum=0.))
        game["shots"] += 1
        game["baselineBrierSum"] += (b-target)**2
        game["candidateBrierSum"] += (c-target)**2
        game["baselineLogLossSum"] += float(-(target*np.log(np.clip(b,1e-15,1-1e-15))+(1-target)*np.log1p(-np.clip(b,1e-15,1-1e-15))))
        game["candidateLogLossSum"] += float(-(target*np.log(np.clip(c,1e-15,1-1e-15))+(1-target)*np.log1p(-np.clip(c,1e-15,1-1e-15))))
        predictions.append(dict(gameId=row["gameId"], eventId=row["eventId"], date=row["date"], goal=target, context=label, baseline=b, candidate=c))
    grouped = []
    for label in sorted(groups):
        group = groups[label]
        n = group["shots"]
        group.update(baselineBrier=group.pop("baselineBrierSum")/n, candidateBrier=group.pop("candidateBrierSum")/n,
                     baselineMeanResidual=(group["baselineExpectedGoals"]-group["actualGoals"])/n,
                     candidateMeanResidual=(group["candidateExpectedGoals"]-group["actualGoals"])/n)
        grouped.append(group)
    paired = [games[k] for k in sorted(games)]
    draws = {"brier": [], "logLoss": []}
    state = SEED
    for _ in range(2000):
        shots = 0
        sums = dict(brier=0., logLoss=0.)
        for _ in paired:
            state = (1664525*state+1013904223) & 0xffffffff
            game = paired[int(state/4294967296*len(paired))]
            shots += game["shots"]
            sums["brier"] += game["candidateBrierSum"]-game["baselineBrierSum"]
            sums["logLoss"] += game["candidateLogLossSum"]-game["baselineLogLossSum"]
        for metric in draws:
            draws[metric].append(sums[metric]/shots)
    ranges = {}
    for metric, values in draws.items():
        values.sort()
        ranges[metric] = dict(point=candidate_metrics[metric]-baseline_metrics[metric], low=values[int((len(values)-1)*.025)], high=values[int((len(values)-1)*.975)])
    common = [g for g in grouped if g["context"] != "unknown" and g["shots"] >= 1000]
    screen = dict(improvesBrier=candidate_metrics["brier"] < baseline_metrics["brier"], improvesLogLoss=candidate_metrics["logLoss"] < baseline_metrics["logLoss"],
                  commonContextNoMaterialRegression=all(g["candidateBrier"] <= g["baselineBrier"]*1.02 for g in common),
                  goalBiasWithin10Percent=abs(candidate_metrics["expectedGoals"]-candidate_metrics["actualGoals"])/candidate_metrics["actualGoals"] <= .1)
    analysis = dict(version="nhl-hist-gradient-shot-experiment-v1", season=source["season"], gameType=source["gameType"],
                    sourceRowsFileSha256=digest(args.rows), sourceAnalysisSha256=digest(args.baseline), rowsSha256=canonical_rows_hash,
                    scriptSha256=digest(__file__), frozenPolicy="docs/product/nhl-nonlinear-shot-experiment.md", frozenPolicySha256=digest("docs/product/nhl-nonlinear-shot-experiment.md"),
                    libraryVersions=dict(python=platform.python_version(), numpy=np.__version__, scipy=scipy.__version__, sklearn=sklearn.__version__),
                    featureCount=X.shape[1], contextFeatureNames=["shootingHome", "ownSkaters", "opposingSkaters", "ownGoaliePresent", "opposingGoaliePresent"],
                    trainEnd=train_end, trainedBefore=frozen_before, testFrom=test_from, trainShots=int(train.sum()), validationShots=int(validation.sum()), refitShots=int(refit.sum()),
                    trials=trials, selected=selected, fittedParameters=model.get_params(), fittedIterations=int(model.n_iter_),
                    baseline=baseline_metrics, candidate=candidate_metrics, calibrationByShootingContext=grouped, pairedTestGames=paired,
                    pairedBootstrap=dict(replicates=2000, seed=SEED, clusters=len(paired), differences=ranges), singleSeasonScreen=screen,
                    interpretation="Exploratory frozen learner; no production changes. Single-season screening is not the frozen two-season requirement. Game bootstrap holds fitted models fixed and omits refit/team-season uncertainty.")
    (output/"analysis.json").write_text(json.dumps(analysis, indent=2, allow_nan=False)+"\n", encoding="utf-8")
    (output/"test-predictions.json").write_text(json.dumps(predictions, allow_nan=False)+"\n", encoding="utf-8")
    print(json.dumps(dict(output=str(output.resolve()), baseline=baseline_metrics, candidate=candidate_metrics, pairedBootstrap=analysis["pairedBootstrap"], screen=screen)), flush=True)

if __name__ == "__main__":
    main()
