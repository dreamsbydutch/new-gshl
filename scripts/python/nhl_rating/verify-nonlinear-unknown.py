"""Independent sklearn predictions for synthetic missing/malformed context; no parameter selection."""
import os
for key in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ[key] = "2"
import importlib.util
import argparse
import json
from pathlib import Path
import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier
from threadpoolctl import threadpool_limits
root = Path(__file__).parent
parser = argparse.ArgumentParser(description=__doc__)
for name in ("rows", "analysis", "output"):
    parser.add_argument("--"+name, required=True)
args = parser.parse_args()
spec = importlib.util.spec_from_file_location("frozen_research", root/"nonlinear-shot-experiment.py")
research = importlib.util.module_from_spec(spec)
spec.loader.exec_module(research)
source = json.loads(Path(args.rows).read_text(encoding="utf-8"))
analysis = json.loads(Path(args.analysis).read_text(encoding="utf-8"))
if sklearn.__version__ != "1.7.1":
    raise ValueError("Frozen synthetic prediction requires scikit-learn 1.7.1")
if research.digest(args.rows) != analysis["sourceRowsFileSha256"]:
    raise ValueError("Synthetic prediction rows differ from the frozen result")
rows = source["rows"]
selected = [r for r in rows if r["date"] < analysis["trainedBefore"]]
X = np.array([r["features"]+research.context(r)[0] for r in selected], dtype=float)
y = np.array([r["goal"] for r in selected])
variants = [dict(situation=None), dict(situation="155"), dict(situation="15555"), dict(situation="9999"), dict(situation="a55b"), dict(shootingHome=None), dict(shootingHome=0), dict(shootingHome="true"), dict(shootingHome=False), dict(situation="0451", shootingHome=True), dict(situation="0451", shootingHome=False), dict(situation="1550", shootingHome=True), dict(situation="1331", shootingHome=False), dict(situation="1651", shootingHome=True)]
cases = []
for index in (0, 500, 25000):
    base = dict(rows[index])
    for changes in variants:
        cases.append(dict(base, **changes))
    missing = dict(base)
    missing.pop("shootingHome")
    cases.append(missing)
    missing = dict(base)
    missing.pop("situation")
    cases.append(missing)
with threadpool_limits(limits=2):
    model = HistGradientBoostingClassifier(**analysis["fittedParameters"])
    model.fit(X, y)
    encoded = [r["features"]+research.context(r)[0] for r in cases]
    predictions = model.predict_proba(np.array(encoded, dtype=float))[:,1]
result = [dict(row=row, features=[None if np.isnan(v) else v for v in vector], probability=float(probability)) for row, vector, probability in zip(cases, encoded, predictions)]
target = Path(args.output)
with target.open("x", encoding="utf-8") as stream:
    json.dump(result, stream, indent=2, allow_nan=False)
    stream.write("\n")
print(json.dumps(dict(output=str(target), cases=len(result))), flush=True)
