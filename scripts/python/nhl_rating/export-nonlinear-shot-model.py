"""Refit frozen parameters and export pinned sklearn numeric trees, never pickle."""
import os
for key in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ[key] = "2"
import argparse
import importlib.util
import json
from pathlib import Path
import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier
from threadpoolctl import threadpool_limits

spec = importlib.util.spec_from_file_location("frozen_shot_research", Path(__file__).with_name("nonlinear-shot-experiment.py"))
research = importlib.util.module_from_spec(spec)
spec.loader.exec_module(research)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("rows", "analysis", "predictions", "output"):
        parser.add_argument("--"+name, required=True)
    args = parser.parse_args()
    if sklearn.__version__ != "1.7.1":
        raise ValueError("Private tree exporter is pinned to sklearn 1.7.1")
    source = json.loads(Path(args.rows).read_text(encoding="utf-8"))
    prior = json.loads(Path(args.analysis).read_text(encoding="utf-8"))
    if research.digest(args.rows) != prior["sourceRowsFileSha256"]:
        raise ValueError("Source rows differ from frozen result")
    rows = source["rows"]
    X = np.array([r["features"]+research.context(r)[0] for r in rows], dtype=float)
    y = np.array([r["goal"] for r in rows])
    refit = np.array([r["date"] < prior["trainedBefore"] for r in rows])
    test = np.array([r["date"] >= prior["testFrom"] for r in rows])
    with threadpool_limits(limits=2):
        model = HistGradientBoostingClassifier(**prior["fittedParameters"])
        model.fit(X[refit], y[refit])
        probability = model.predict_proba(X[test])[:, 1]
    recorded = json.loads(Path(args.predictions).read_text(encoding="utf-8"))
    test_rows = [r for r, selected in zip(rows, test) if selected]
    if [(r["gameId"], r["eventId"]) for r in recorded] != [(r["gameId"], r["eventId"]) for r in test_rows]:
        raise ValueError("Prediction identities differ")
    refit_error = float(np.max(np.abs(probability-np.array([r["candidate"] for r in recorded]))))
    if refit_error >= 1e-12:
        raise ValueError(f"Frozen refit changed: {refit_error}")
    initial = float(model._baseline_prediction[0, 0])
    trees = []
    for iteration in model._predictors:
        if len(iteration) != 1 or np.any(iteration[0].nodes["is_categorical"]):
            raise ValueError("Only binary numeric trees are supported")
        trees.append([dict(featureIndex=int(n["feature_idx"]), threshold=float(n["num_threshold"]), left=int(n["left"]), right=int(n["right"]), leaf=int(n["is_leaf"]), value=float(n["value"]), missingLeft=int(n["missing_go_to_left"])) for n in iteration[0].nodes])
    manual = []
    for features in X[test]:
        value = initial
        for nodes in trees:
            index = 0
            while not nodes[index]["leaf"]:
                node = nodes[index]
                x = features[node["featureIndex"]]
                go_left = bool(node["missingLeft"]) if np.isnan(x) else x <= node["threshold"]
                index = node["left"] if go_left else node["right"]
            value += nodes[index]["value"]
        manual.append(float(1/(1+np.exp(-value))))
    tree_error = float(np.max(np.abs(np.array(manual)-probability)))
    if tree_error >= 1e-12:
        raise ValueError(f"Leaf scaling or tree traversal changed: {tree_error}")
    names = ["intercept", "distance/100", "distanceSquared/10000", "angle/90", "angleSquared/8100", "reboundWithin3s", "rushWithin5s", "emptyNet", "skaterAdvantage", "backhand", "slap", "tip", "deflected", "wraparound", "snap", "otherType", "shootingHome", "ownSkaters", "opposingSkaters", "ownGoaliePresent", "opposingGoaliePresent"]
    artifact = dict(version="nhl-shot-nonlinear-research-v1", featureNames=names, initialLogOdds=initial, trees=trees,
                    provenance=dict(sklearnVersion=sklearn.__version__, sourceRowsSha256=source["rowsSha256"], sourceRowsFileSha256=research.digest(args.rows), sourceAnalysisSha256=research.digest(args.analysis), sourcePredictionsSha256=research.digest(args.predictions), exporterSha256=research.digest(__file__), trainedBefore=prior["trainedBefore"], testFrom=prior["testFrom"], learningRate=float(model.learning_rate), leafValuesIncludeLearningRate=True, frozenRefitMaximumError=refit_error, numericTreeMaximumError=tree_error))
    with Path(args.output).open("x", encoding="utf-8") as stream:
        json.dump(artifact, stream, indent=2, allow_nan=False)
        stream.write("\n")
    print(json.dumps(dict(output=str(Path(args.output).resolve()), trees=len(trees), maxRefitError=refit_error, maxTreeError=tree_error)), flush=True)

if __name__ == "__main__":
    main()
