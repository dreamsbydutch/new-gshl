"""Nested whole-game retrospective research; run from repository root. NEVER forward validation."""
import os
for key in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ[key] = "2"
import argparse
import hashlib
import importlib.util
import json
import subprocess
from datetime import date
from pathlib import Path
import numpy as np
import scipy
import sklearn
from scipy.special import expit
from sklearn.ensemble import HistGradientBoostingClassifier
from threadpoolctl import threadpool_limits

root = Path(__file__).parent
spec = importlib.util.spec_from_file_location("frozen_research", root/"nonlinear-shot-experiment.py")
research = importlib.util.module_from_spec(spec)
spec.loader.exec_module(research)

def encode(value):
    return json.dumps(value, separators=(",", ":"), allow_nan=False)

def hashed(value):
    return hashlib.sha256(encode(value).encode()).hexdigest()

def write(path, value):
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2, allow_nan=False)
        stream.write("\n")

def glm_predict(X, coefficients):
    return expit(np.clip(X@np.array(coefficients), -30, 30))

def fit_glm(X, y, ridge):
    beta = np.zeros(16)
    rate = (y.sum()+.5)/(len(y)+1)
    beta[0] = np.log(rate/(1-rate))
    penalty = np.full(16, ridge, dtype=float)
    penalty[0] = 1e-6
    converged = False
    for iteration in range(40):
        p = glm_predict(X, beta)
        gradient = X.T@(y-p)-penalty*beta
        hessian = X.T@((p*(1-p))[:,None]*X)+np.diag(penalty)
        chol = np.linalg.cholesky(hessian)
        step = np.clip(np.linalg.solve(chol.T, np.linalg.solve(chol, gradient)), -2, 2)
        beta += step
        if np.max(np.abs(step)) < 1e-6:
            converged = True
            break
    return dict(coefficients=beta.tolist(), ridge=ridge, iterations=iteration+1, converged=converged)

def numeric_trees(model):
    trees = []
    for iteration in model._predictors:
        if len(iteration) != 1 or np.any(iteration[0].nodes["is_categorical"]):
            raise ValueError("Only binary numeric trees supported")
        trees.append([dict(featureIndex=int(n["feature_idx"]), threshold=float(n["num_threshold"]), left=int(n["left"]), right=int(n["right"]), leaf=int(n["is_leaf"]), value=float(n["value"]), missingLeft=int(n["missing_go_to_left"])) for n in iteration[0].nodes])
    return trees

def tree_predict(model, X):
    raw = np.full(len(X), model["initialLogOdds"], dtype=float)
    for tree in model["trees"]:
        active = [(0, np.arange(len(X)))]
        while active:
            index, indices = active.pop()
            if not len(indices):
                continue
            node = tree[index]
            if node["leaf"]:
                raw[indices] += node["value"]
            else:
                feature = X[indices, node["featureIndex"]]
                left = np.where(np.isnan(feature), bool(node["missingLeft"]), feature <= node["threshold"])
                active.extend([(node["left"], indices[left]), (node["right"], indices[~left])])
    return expit(raw)

def summarize(rows, baseline, candidate, contexts):
    groups, games = {}, {}
    for row, b, c, label in zip(rows, baseline, candidate, contexts):
        b, c, goal = float(b), float(c), row["goal"]
        group = groups.setdefault(label, dict(context=label, shots=0, actualGoals=0., baselineExpectedGoals=0., candidateExpectedGoals=0., baselineBrierSum=0., candidateBrierSum=0.))
        group["shots"] += 1
        group["actualGoals"] += goal
        group["baselineExpectedGoals"] += b
        group["candidateExpectedGoals"] += c
        group["baselineBrierSum"] += (b-goal)**2
        group["candidateBrierSum"] += (c-goal)**2
        game = games.setdefault(row["gameId"], dict(gameId=row["gameId"], shots=0, baselineBrierSum=0., candidateBrierSum=0., baselineLogLossSum=0., candidateLogLossSum=0.))
        game["shots"] += 1
        game["baselineBrierSum"] += (b-goal)**2
        game["candidateBrierSum"] += (c-goal)**2
        for key, p in (("baselineLogLossSum",b),("candidateLogLossSum",c)):
            safe = np.clip(p,1e-15,1-1e-15)
            game[key] += float(-(goal*np.log(safe)+(1-goal)*np.log1p(-safe)))
    for group in groups.values():
        n = group["shots"]
        group.update(baselineBrier=group.pop("baselineBrierSum")/n, candidateBrier=group.pop("candidateBrierSum")/n,
                     baselineMeanResidual=(group["baselineExpectedGoals"]-group["actualGoals"])/n,
                     candidateMeanResidual=(group["candidateExpectedGoals"]-group["actualGoals"])/n)
    return [groups[k] for k in sorted(groups)], [games[k] for k in sorted(games)]

def native_glm_fixture_parity():
    """A fixed synthetic fixture; never reads or fits a season reference model."""
    fixture = []
    for i in range(192):
        distance, angle = (i % 23 + 1)/24, (i*7 % 19)/20
        features = [1, distance, distance**2, angle, angle**2,
                    int(i % 5 == 0), int(i % 7 == 0), int(i % 31 == 0), i % 5 - 2,
                    *[int(i % 8 == j) for j in range(6)], int(i % 8 == 7)]
        fixture.append(dict(gameId=2000020001, eventId=i+1, date="2000-10-01",
                            goal=int((i*37) % 101 < 8+i % 19), features=features))
    native_code = """
import { fitShotQuality, predictShotQuality } from './scripts/src/runtime/nhl-shot-quality.ts';
import { NHL_NONLINEAR_SHOT_FEATURES } from './scripts/src/runtime/nhl-shot-nonlinear.ts';
let input='';for await (const chunk of process.stdin) input+=chunk;
const rows=JSON.parse(input);
const fits=[1,10,100].map(ridge=>{const model=fitShotQuality(rows,ridge);return {ridge,model,probabilities:rows.map(row=>predictShotQuality(model,row.features))};});
process.stdout.write(JSON.stringify({featureNames:NHL_NONLINEAR_SHOT_FEATURES,fits}));
"""
    native = json.loads(subprocess.check_output(
        ["node", "--import", "tsx", "--input-type=module", "-e", native_code],
        input=encode(fixture), text=True))
    X = np.array([row["features"] for row in fixture], dtype=float)
    y = np.array([row["goal"] for row in fixture], dtype=float)
    comparisons = []
    with threadpool_limits(limits=2):
        for result in native["fits"]:
            fitted = fit_glm(X, y, result["ridge"])
            coefficients = result["model"]["coefficients"]
            comparison = dict(ridge=result["ridge"],
                              maxCoefficientError=float(np.max(np.abs(np.array(fitted["coefficients"])-coefficients))),
                              maxPredictionError=float(np.max(np.abs(glm_predict(X,fitted["coefficients"])-result["probabilities"]))))
            if not fitted["converged"] or not result["model"]["converged"] or comparison["maxCoefficientError"] >= 1e-10 or comparison["maxPredictionError"] >= 1e-12:
                raise ValueError(f"Synthetic native GLM parity failed: {comparison}")
            comparisons.append(comparison)
    return dict(kind="fixed-synthetic-native-GLM", fixtureSha256=hashed(fixture), rows=len(fixture),
                nativeRuntimeSha256=research.digest("scripts/src/runtime/nhl-shot-quality.ts"),
                nonlinearFeatureContractSha256=research.digest("scripts/src/runtime/nhl-shot-nonlinear.ts"),
                comparisons=comparisons), native["featureNames"]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("rows", "baseline", "frozen-model", "output", "policy", "source-metadata"):
        parser.add_argument("--"+name)
    parser.add_argument("--source-only", action="store_true", help="Rows-only retrospective confirmation; requires a sealed policy, no chronological reference fit")
    parser.add_argument("--check-glm-only", action="store_true", help="Parity only; source-only checks synthetic native GLM without reading season rows")
    args = parser.parse_args()
    if args.source_only and (args.baseline or args.frozen_model):
        parser.error("--source-only cannot use --baseline or --frozen-model")
    if args.source_only and args.check_glm_only:
        parity, _ = native_glm_fixture_parity()
        print(json.dumps(dict(phase="glm-fixture-parity", **parity)), flush=True)
        return
    if not args.rows or not args.output or (not args.source_only and (not args.baseline or not args.frozen_model)):
        parser.error("--rows and --output required; inspected mode also requires --baseline and --frozen-model")
    policy = Path(args.policy or ("docs/product/nhl-2025-retrospective-confirmation-protocol.md" if args.source_only else "docs/product/nhl-retrospective-crossfit-proposal.md"))
    policy_bytes = policy.read_bytes()
    if args.source_only and "Status: **SEALED" not in policy_bytes.decode("utf-8"):
        raise ValueError("Source-only season fitting requires an explicitly SEALED policy")
    startup_hashes = {str(path): research.digest(path) for path in (Path(__file__), root/"nonlinear-shot-experiment.py", policy, Path("scripts/src/runtime/nhl-shot-quality.ts"), Path("scripts/src/runtime/nhl-shot-nonlinear.ts"))}
    source = json.loads(Path(args.rows).read_text(encoding="utf-8"))
    baseline = None if args.source_only else json.loads(Path(args.baseline).read_text(encoding="utf-8"))
    frozen_gb = None if args.source_only else json.loads(Path(args.frozen_model).read_text(encoding="utf-8"))
    source_metadata = None if not args.source_metadata else json.loads(Path(args.source_metadata).read_text(encoding="utf-8"))
    input_paths = [args.rows] + ([args.source_metadata] if args.source_metadata else []) + ([] if args.source_only else [args.baseline,args.frozen_model])
    startup_input_hashes = {path:research.digest(path) for path in input_paths}
    if sklearn.__version__ != "1.7.1":
        raise ValueError("Tree exporter pinned to sklearn1.7.1")
    node_code = "const fs=require('fs'),c=require('crypto');const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(c.createHash('sha256').update(JSON.stringify(d.rows)).digest('hex'));"
    canonical = subprocess.check_output(["node","-e",node_code,str(Path(args.rows).resolve())], text=True).strip()
    if canonical != source["rowsSha256"] or (baseline is not None and canonical != baseline["rowsSha256"]) or (frozen_gb is not None and canonical != frozen_gb["provenance"]["sourceRowsSha256"]):
        raise ValueError("Source row hashes differ")
    if source_metadata is not None and any(source_metadata.get(key) != source[key] for key in ("season", "gameType", "rowsSha256")):
        raise ValueError("Optional source metadata is not bound to the source season/rows")
    rows = source["rows"]
    season = source["season"]
    if type(season) is not int or season % 10000 != season//10000+1 or source["gameType"] not in (2,3) or not rows:
        raise ValueError("Invalid source season/game type or empty rows")
    if len({(r["gameId"],r["eventId"]) for r in rows}) != len(rows):
        raise ValueError("Duplicate source event")
    game_dates = {}
    for row in rows:
        if type(row["gameId"]) is not int or type(row["eventId"]) is not int or row["gameId"] <= 0 or row["eventId"] < 0 or type(row["date"]) is not str or date.fromisoformat(row["date"]).isoformat() != row["date"]:
            raise ValueError("Invalid source event identity/date")
        if type(row["goal"]) not in (int,float) or row["goal"] not in (0,1) or not isinstance(row["features"],list) or len(row["features"]) != 16 or any(type(value) not in (int,float) or not np.isfinite(value) for value in row["features"]):
            raise ValueError("Invalid required source features/goal")
        previous = game_dates.setdefault(row["gameId"], row["date"])
        if previous != row["date"]:
            raise ValueError("Conflicting game dates")
    if len(source["effectiveGameSourceHashes"]) != len(game_dates) or set(game_dates) != {g["gameId"] for g in source["effectiveGameSourceHashes"]}:
        raise ValueError("Source schedule/event support differs")
    geometry = np.array([r["features"] for r in rows], dtype=float)
    context = [research.context(r) for r in rows]
    X = np.column_stack([geometry,np.array([c[0] for c in context])])
    labels = [c[1] for c in context]
    y = np.array([r["goal"] for r in rows], dtype=float)
    dates = np.array([r["date"] for r in rows])
    ids = np.array([r["gameId"] for r in rows])
    if geometry.shape != (len(rows),16) or not np.isfinite(geometry).all() or not np.isin(y,[0,1]).all():
        raise ValueError("Invalid features/labels")
    output = Path(args.output)
    if not args.check_glm_only:
        output.mkdir()
        (output/"folds").mkdir()
        with (output/"frozen-policy.md").open("xb") as stream:
            stream.write(policy_bytes)
        write(output/"startup-provenance.json", dict(sourceOnly=args.source_only, codeAndPolicyHashes=startup_hashes,
                                                    inputHashes=startup_input_hashes,
                                                    sourceRowsFileSha256=research.digest(args.rows), policySha256=hashlib.sha256(policy_bytes).hexdigest()))
    with threadpool_limits(limits=2):
        if args.source_only:
            glm_parity, feature_names = native_glm_fixture_parity()
        else:
            reference_fit = fit_glm(geometry[dates<baseline["trainedBefore"]], y[dates<baseline["trainedBefore"]], baseline["baseline"]["model"]["ridge"])
            native_coefficients = baseline["baseline"]["model"]["coefficients"]
            glm_parity = dict(maxCoefficientError=float(np.max(np.abs(np.array(reference_fit["coefficients"])-native_coefficients))),
                              maxPredictionError=float(np.max(np.abs(glm_predict(geometry,reference_fit["coefficients"])-glm_predict(geometry,native_coefficients)))))
            if not reference_fit["converged"] or glm_parity["maxCoefficientError"] >= 1e-8 or glm_parity["maxPredictionError"] >= 1e-10:
                raise ValueError(f"Python GLM disagrees with native baseline: {glm_parity}")

            feature_names = frozen_gb["featureNames"]
        print(json.dumps(dict(phase="glm-parity", **glm_parity)), flush=True)
        if args.check_glm_only:
            return
        assignment = {gid:int(hashlib.sha256(f'{source["season"]}:{gid}:retrospective-v1:14731'.encode()).hexdigest()[:8],16)%5 for gid in sorted(game_dates)}
        outer = np.array([assignment[r["gameId"]] for r in rows])
        manifests = []
        for fold in range(5):
            train_ids = sorted(gid for gid in game_dates if assignment[gid] != fold)
            held_ids = sorted(gid for gid in game_dates if assignment[gid] == fold)
            outer_dates = sorted({game_dates[gid] for gid in train_ids})
            train_end, validation_end = [outer_dates[int(len(outer_dates)*q)] for q in (.4,.6)]
            manifests.append(dict(outerFold=fold, trainingGameIds=train_ids, heldOutGameIds=held_ids,
                                  trainingGameIdsSha256=hashed(train_ids), heldOutGameIdsSha256=hashed(held_ids), innerTrainEnd=train_end, innerValidationEnd=validation_end,
                                  innerTrainingGameIds=[gid for gid in train_ids if game_dates[gid]<train_end], innerValidationGameIds=[gid for gid in train_ids if train_end<=game_dates[gid]<validation_end]))
        folds_dir = output/"folds"
        assignment_artifact = dict(version="nhl-retrospective-fold-manifest-v1", season=source["season"], rowsSha256=canonical, policySha256=hashlib.sha256(policy_bytes).hexdigest(), assignmentRule="first8hexSHA256(season:gameId:retrospective-v1:14731)%5", folds=manifests)
        write(output/"fold-manifest.json", assignment_artifact)
        base_p, candidate_p = np.full(len(rows), np.nan), np.full(len(rows), np.nan)
        fits = []
        for fold, manifest in enumerate(manifests):
            outer_train, held = outer!=fold, outer==fold
            inner_train = outer_train & (dates<manifest["innerTrainEnd"])
            inner_validation = outer_train & (dates>=manifest["innerTrainEnd"]) & (dates<manifest["innerValidationEnd"])
            if not all(mask.any() for mask in (inner_train,inner_validation,outer_train,held)):
                raise ValueError("Empty nested fold")
            glm_trials = []
            for ridge in (1,10,100):
                fitted = fit_glm(geometry[inner_train],y[inner_train],ridge)
                glm_trials.append(dict(ridge=ridge,converged=fitted["converged"],validation=research.metrics(y[inner_validation],glm_predict(geometry[inner_validation],fitted["coefficients"]))))
            selected_glm = min([t for t in glm_trials if t["converged"]],key=lambda t:(t["validation"]["brier"],t["ridge"]))
            glm = fit_glm(geometry[outer_train],y[outer_train],selected_glm["ridge"])
            if not glm["converged"]:
                raise ValueError("Outer GLM failed convergence")
            gb_trials = []
            for leaves,l2 in research.GRID:
                learner = HistGradientBoostingClassifier(**research.FIXED,max_leaf_nodes=leaves,l2_regularization=l2)
                learner.fit(X[inner_train],y[inner_train])
                gb_trials.append(dict(max_leaf_nodes=leaves,l2_regularization=l2,validation=research.metrics(y[inner_validation],learner.predict_proba(X[inner_validation])[:,1])))
            selected_gb = min(gb_trials,key=lambda t:(t["validation"]["brier"],t["max_leaf_nodes"],t["l2_regularization"]))
            learner = HistGradientBoostingClassifier(**research.FIXED,max_leaf_nodes=selected_gb["max_leaf_nodes"],l2_regularization=selected_gb["l2_regularization"])
            learner.fit(X[outer_train],y[outer_train])
            base_p[held] = glm_predict(geometry[held],glm["coefficients"])
            candidate_p[held] = learner.predict_proba(X[held])[:,1]
            metadata = dict(**manifest, sourceRowsSha256=canonical, glmTrials=glm_trials, gbTrials=gb_trials, selectedGlm=selected_glm, selectedGb=selected_gb,
                            trainingShots=int(outer_train.sum()),heldOutShots=int(held.sum()),innerTrainingShots=int(inner_train.sum()),innerValidationShots=int(inner_validation.sum()))
            metadata_hash = hashed(metadata)
            gb_model = dict(version="nhl-shot-nonlinear-crossfit-research-v1",featureNames=feature_names, initialLogOdds=float(learner._baseline_prediction[0,0]),trees=numeric_trees(learner),provenance=dict(outerFold=fold, foldFitSha256=metadata_hash,trainingGameIdsSha256=manifest["trainingGameIdsSha256"],sourceRowsSha256=canonical,sklearnVersion=sklearn.__version__,leafValuesIncludeLearningRate=True))
            manual_error = float(np.max(np.abs(tree_predict(gb_model,X[held])-candidate_p[held])))
            if manual_error >= 1e-12:
                raise ValueError("Crossfit numeric-tree export parity failed")
            write(folds_dir/f"gb-fold-{fold}.json",gb_model)
            write(folds_dir/f"glm-fold-{fold}.json",dict(version="nhl-shot-linear-crossfit-research-v1",**glm,provenance=gb_model["provenance"]))
            fits.append(dict(**metadata,foldFitSha256=metadata_hash,numericExportMaximumError=manual_error,gbModelSha256=research.digest(folds_dir/f"gb-fold-{fold}.json"),glmModelSha256=research.digest(folds_dir/f"glm-fold-{fold}.json")))
            print(json.dumps(dict(phase="outer-fold-complete",fold=fold,heldOutGames=len(manifest["heldOutGameIds"]),trainingGames=len(manifest["trainingGameIds"]),heldOutShots=int(held.sum()))),flush=True)
    if not np.isfinite(base_p).all() or not np.isfinite(candidate_p).all():
        raise ValueError("Incomplete OOF support")
    groups,games = summarize(rows,base_p,candidate_p,labels)
    glm_metrics,gb_metrics = research.metrics(y,base_p),research.metrics(y,candidate_p)
    common = [g for g in groups if g["context"]!="unknown" and g["shots"]>=1000]
    frozen_comparison = None
    if not args.source_only:
        frozen_linear = glm_predict(geometry,baseline["baseline"]["model"]["coefficients"])
        frozen_boost = tree_predict(frozen_gb,X)
        forward_test = dates>=baseline["testFrom"]
        frozen_comparison = dict(allShots=dict(frozenLinear=research.metrics(y,frozen_linear),frozenBoost=research.metrics(y,frozen_boost),crossfitLinear=glm_metrics,crossfitBoost=gb_metrics),
                                 originalFinalBlock=dict(frozenLinear=research.metrics(y[forward_test],frozen_linear[forward_test]),frozenBoost=research.metrics(y[forward_test],frozen_boost[forward_test]),crossfitLinear=research.metrics(y[forward_test],base_p[forward_test]),crossfitBoost=research.metrics(y[forward_test],candidate_p[forward_test])),
                                 interpretation="Descriptive only. All-shot frozen predictions include their training outcomes; OOF final-block models can use other later-season games. Neither comparison establishes better forward prediction.")
    screen = dict(improvesBrier=gb_metrics["brier"]<glm_metrics["brier"],improvesLogLoss=gb_metrics["logLoss"]<glm_metrics["logLoss"],
                  commonContextNoMaterialRegression=all(g["candidateBrier"]<=g["baselineBrier"]*1.02 for g in common),goalBiasWithin10Percent=abs(gb_metrics["expectedGoals"]-gb_metrics["actualGoals"])/gb_metrics["actualGoals"]<=.1)
    if any(research.digest(path) != value for path, value in {**startup_hashes,**startup_input_hashes}.items()):
        raise ValueError("Research implementation or protocol changed during fitting")
    analysis = dict(startupCodeAndPolicyHashes=startup_hashes, startupInputHashes=startup_input_hashes, version="nhl-retrospective-crossfit-experiment-v1",season=source["season"],gameType=source["gameType"],rowsSha256=canonical,sourceRowsFileSha256=research.digest(args.rows),sourceOnly=args.source_only, sourceMetadataSha256=research.digest(args.source_metadata) if args.source_metadata else None,
                    scriptSha256=research.digest(__file__),helperSha256=research.digest(root/"nonlinear-shot-experiment.py"),policySha256=assignment_artifact["policySha256"],foldManifestSha256=research.digest(output/"fold-manifest.json"),
                    libraryVersions=dict(sklearn=sklearn.__version__,numpy=np.__version__,scipy=scipy.__version__),glmNativeParity=glm_parity,
                    baselineMethod="nested-whole-game-OOF-GLM16",candidateMethod="nested-whole-game-OOF-GB21",baseline=glm_metrics,candidate=gb_metrics,calibrationByShootingContext=groups,pairedTestGames=games,singleSeasonScreen=screen,
                    interpretation="Nested whole-game retrospective estimate, never chronological forecasting labels. Every event's fold excludes its entire game from model and parameter fitting. All-season OOF metrics compare models on identical shots; fixed-model bootstrap omits overlapping-training-set dependence. No default adoption.")
    if frozen_comparison is not None:
        analysis["sourceBaselineSha256"] = research.digest(args.baseline)
        analysis["frozenGbModelSha256"] = research.digest(args.frozen_model)
        analysis["frozenDescriptiveComparison"] = frozen_comparison
    write(output/"fold-fit-manifest.json",dict(foldManifestSha256=analysis["foldManifestSha256"],folds=fits))
    analysis["foldFitManifestSha256"] = research.digest(output/"fold-fit-manifest.json")
    write(output/"analysis.json",analysis)
    write(output/"predictions.json",[dict(gameId=row["gameId"],eventId=row["eventId"],date=row["date"],goal=row["goal"],outerFold=int(outer[i]),trainingGameIdsSha256=manifests[int(outer[i])]["trainingGameIdsSha256"],foldFitSha256=fits[int(outer[i])]["foldFitSha256"],baseline=float(base_p[i]),candidate=float(candidate_p[i])) for i,row in enumerate(rows)])
    print(json.dumps(dict(output=str(output.resolve()),baseline=glm_metrics,candidate=gb_metrics,screen=screen)),flush=True)

if __name__=="__main__":
    main()
