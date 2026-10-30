"""
Classical ML baselines: Logistic Regression, SVM (RBF) and Random Forest.

Each model is trained in two settings:
  * full     - all 16 hand-crafted features (what a classical model would normally get)
  * reduced  - the SAME 8 PCA features, scaled to [0, pi], that the quantum
               classifier receives. This is the fair, like-for-like comparison.

Hyper-parameters are chosen with GroupKFold cross-validation on the TRAINING
set only (groups = road segment). The test set is touched exactly once, at the end.

Usage:
    python qml/src/classical_model.py               # default 8 features for "reduced"
    python qml/src/classical_model.py --n-features 4
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GridSearchCV, GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

sys.path.insert(0, str(Path(__file__).resolve().parent))
from evaluation import compute_metrics, plot_confusion, save_metrics  # noqa: E402
from preprocessing import SEED, load_features, make_reducer  # noqa: E402

MODELS = {
    "logistic_regression": (
        LogisticRegression(max_iter=5000, random_state=SEED),
        {"clf__C": [0.01, 0.1, 1, 10, 100]},
    ),
    "svm_rbf": (
        SVC(kernel="rbf", random_state=SEED),
        {"clf__C": [0.1, 1, 10, 100], "clf__gamma": ["scale", 0.01, 0.1, 1]},
    ),
    "random_forest": (
        RandomForestClassifier(random_state=SEED, n_jobs=-1),
        {"clf__n_estimators": [200], "clf__max_depth": [None, 6, 12], "clf__min_samples_leaf": [1, 5]},
    ),
}


def build_pipeline(model, setting: str, n_features: int) -> Pipeline:
    pre = StandardScaler() if setting == "full" else make_reducer(n_features)
    return Pipeline([("pre", pre), ("clf", model)])


def run(n_features: int = 8, csv_path=None, prefix: str = "classical") -> dict:
    X_train, X_test, y_train, y_test, df = load_features(csv_path)
    groups = df[df.split == "train"]["group"].to_numpy()
    cv = GroupKFold(n_splits=4)

    summary = {}
    for setting in ("full", "reduced"):
        for name, (model, grid) in MODELS.items():
            pipe = build_pipeline(model, setting, n_features)
            search = GridSearchCV(pipe, grid, cv=cv, scoring="f1_macro", n_jobs=1)

            # Training time = refit of the chosen configuration on the full training set
            search.fit(X_train, y_train, groups=groups)
            best = search.best_estimator_
            t0 = time.perf_counter()
            best.fit(X_train, y_train)
            train_time = time.perf_counter() - t0

            t0 = time.perf_counter()
            y_pred = best.predict(X_test)
            infer_time = time.perf_counter() - t0

            tag = f"{prefix}_{name}_{setting}"
            metrics = compute_metrics(
                y_test, y_pred, train_time, infer_time,
                extra={
                    "model": name, "setting": setting,
                    "n_input_features": int(X_train.shape[1] if setting == "full" else n_features),
                    "best_params": {k.replace("clf__", ""): v for k, v in search.best_params_.items()},
                    "cv_f1_macro": float(search.best_score_),
                    "n_train": int(len(y_train)),
                },
            )
            save_metrics(tag, metrics)
            plot_confusion(metrics["confusion_matrix"],
                           f"{name.replace('_', ' ').title()} ({setting} features)",
                           f"cm_{tag}.png")
            summary[tag] = metrics
            print(f"{tag:45s} acc={metrics['accuracy']:.3f}  f1={metrics['f1_macro']:.3f}  "
                  f"cv_f1={search.best_score_:.3f}  params={metrics['best_params']}")

    # Best classical model per setting, picked by CROSS-VALIDATION score (not test score)
    best = {}
    for setting in ("full", "reduced"):
        cands = {k: v for k, v in summary.items() if v["setting"] == setting}
        best[setting] = max(cands, key=lambda k: cands[k]["cv_f1_macro"])
    (Path(__file__).resolve().parents[1] / "results" / "metrics" / f"{prefix}_best.json").write_text(
        json.dumps(best, indent=2))
    print("\nBest by CV:", best)
    return summary


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-features", type=int, default=8, help="PCA features for the 'reduced' setting (= qubits)")
    ap.add_argument("--csv", type=Path, default=None)
    ap.add_argument("--tag", default="classical", help="prefix for result files")
    args = ap.parse_args()
    run(args.n_features, args.csv, args.tag)
