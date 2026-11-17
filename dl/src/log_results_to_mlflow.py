"""Log every model's saved results to MLflow so they can be compared in the MLflow UI.

The ML, DL and QML experiments were run earlier and their results are committed in
``qml/results/metrics/``, ``dl/results/comparison/`` and ``dl/results/``. This script
does NOT retrain anything: it reads those files and records each model as an MLflow run
(parameters, test metrics, per-epoch history where available, confusion matrix and the
source JSON as artifacts). Every run is tagged ``logged_from = saved results``.

    cd dl
    python src/log_results_to_mlflow.py            # uses sqlite:///mlflow.db in dl/
    mlflow ui --backend-store-uri sqlite:///mlflow.db --port 5001

Experiments written:
  * ``TrafficCare-Model-Comparison``: 11 models (3 classical ML, 3 DL, 3 QML, 2 hybrid)
    scored on the same 300 CPRD test patches.
  * ``Smart-Traffic-DL-Training``: the production ResNet18 training run (original dataset).
Re-running the script replaces the runs it logged before.
"""
import argparse
import csv
import json
import os
from pathlib import Path

import mlflow
from mlflow.tracking import MlflowClient

DL_ROOT = Path(__file__).resolve().parents[1]
REPO = DL_ROOT.parent
QML = REPO / "qml" / "results"
COMPARISON = DL_ROOT / "results" / "comparison"


def set_repo(repo: Path):
    """Point the script at another checkout of the project (default: this one)."""
    global DL_ROOT, REPO, QML, COMPARISON  # pylint: disable=global-statement
    REPO = repo.resolve()
    DL_ROOT = REPO / "dl"
    QML = REPO / "qml" / "results"
    COMPARISON = DL_ROOT / "results" / "comparison"
TEST_SET = "CPRD, 300 held-out patches, split by 500 m road stretch"
LOGGED_BY = "log_results_to_mlflow.py"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def flat_params(d: dict, keys) -> dict:
    out = {}
    for k in keys:
        v = d.get(k)
        if isinstance(v, dict):
            for sk, sv in v.items():
                if isinstance(sv, (int, float, str, bool)):
                    out[f"{k}.{sk}"] = sv
        elif isinstance(v, (int, float, str, bool)):
            out[k] = v
    return out


def test_metrics(d: dict) -> dict:
    m = {k: d[k] for k in ("accuracy", "precision_macro", "recall_macro", "f1_macro") if k in d}
    for cls, vals in (d.get("per_class") or {}).items():
        if isinstance(vals, dict) and "f1" in vals:
            m[f"f1_{cls.lower().replace(' ', '_')}"] = vals["f1"]
    return m


def log_history(rows, mapping):
    """rows: list of per-epoch dicts; mapping: {source_key: mlflow_metric_name}."""
    for row in rows:
        step = int(row.get("epoch", 0))
        for src, name in mapping.items():
            if row.get(src) is not None:
                mlflow.log_metric(name, float(row[src]), step=step)


def clear_previous(client: MlflowClient, experiment_id: str):
    for run in client.search_runs(
    [experiment_id],
    f"tags.logged_by = '{LOGGED_BY}'",
     max_results=500):
        client.delete_run(run.info.run_id)


def log_run(name, family, *, params, metrics, tags, artifacts=(), history=None):
    with mlflow.start_run(run_name=name):
        mlflow.set_tags({"family": family,
    "test_set": TEST_SET,
    "logged_from": "saved results file (not retrained)",
    "logged_by": LOGGED_BY,
     **tags})
        mlflow.log_params(params)
        mlflow.log_metrics(metrics)
        if history:
            log_history(*history)
        for path, folder in artifacts:
            if Path(path).exists():
                mlflow.log_artifact(str(path), artifact_path=folder)
    print(f"logged  {family:<15} {name:<38} F1 {metrics.get('f1_macro', float('nan')):.3f}")


def classical_runs():
    labels = {"logistic_regression": "Logistic Regression", "svm_rbf": "SVM (RBF kernel)",
              "random_forest": "Random Forest"}
    for key, label in labels.items():
        src = QML / "metrics" / f"classical_{key}_full.json"
        d = load(src)
        params = {"algorithm": label, "input": "16 hand-crafted texture/colour features",
            "n_train": d.get("n_train"), **flat_params(d, ["n_input_features", "best_params"])}
        metrics = {**test_metrics(d), "train_time_s": d["train_time_s"],
                   "inference_ms_per_sample": d["inference_ms_per_sample"]}
        if "cv_f1_macro" in d:
            metrics["cv_f1_macro"] = d["cv_f1_macro"]
        log_run(
    label, "Classical ML", params=params, metrics=metrics, tags={
        "source_file": src.relative_to(REPO).as_posix()}, artifacts=[
            (src, "results"), (QML / "graphs" / f"cm_classical_{key}_full.png", "plots")])


def dl_runs():
    src = COMPARISON / "metrics_cprd.json"
    data = load(src)
    recipe = data.get("recipe", {})
    for key, m in data["models"].items():
        params = {
    "architecture": m.get(
        "display_name",
        key),
        "pretrained": "ImageNet",
        "seed": m["seed"],
        "batch_size": m["batch_size"],
        "learning_rate": recipe.get("lr"),
        "optimizer": recipe.get("optimizer"),
        "max_epochs": recipe.get("max_epochs"),
        "early_stopping": recipe.get("early_stopping"),
        "image_size": recipe.get("image_size"),
        "parameters_millions": round(
            m["params_m"],
            2),
            "epochs_run": m["epochs_run"],
             "best_epoch": m["best_epoch"]}
        metrics = {**test_metrics(m["test"]),
    "train_time_s": m["train_time_s"],
    "best_val_f1_macro": m["best_val_f1_macro"],
    "checkpoint_mb": m["checkpoint_mb"],
    "cpu_ms_per_image": m["speed"]["cpu_ms_per_sample"],
     "gpu_ms_per_image": m["speed"]["gpu_ms_per_sample"]}
        if "across_seeds" in m:
            metrics["f1_macro_mean_3_seeds"] = m["across_seeds"]["f1_macro"]["mean"]
            metrics["f1_macro_std_3_seeds"] = m["across_seeds"]["f1_macro"]["std"]
        hist = (m["history"],
    {"train_loss": "train_loss",
    "train_accuracy": "train_accuracy",
    "val_loss": "val_loss",
    "val_accuracy": "val_accuracy",
     "val_f1_macro": "val_f1_macro"})
        log_run(m.get("display_name", key), "Deep learning", params=params, metrics=metrics,
                tags={"source_file": src.relative_to(REPO).as_posix()},
                artifacts=[(src, "results"), (COMPARISON / f"history_{key}_cprd.csv", "results"),
                           (COMPARISON / "confusion_matrices_cprd.png", "plots"),
                           (COMPARISON / "training_curves_cprd.png", "plots")],
                history=hist)


def quantum_runs():
    m = QML / "metrics"
    hybrid_keys = [
        "setting", "middle_layer_desc", "n_qubits", "quantum_layers", "middle_params",
        "n_trainable_params", "learning_rate", "best_epoch", "epochs_run",
    ]
    hybrid_history = {
        "train_loss": "train_loss", "val_loss": "val_loss",
        "val_acc": "val_accuracy", "val_f1": "val_f1_macro",
    }
    specs = [
        (
            "VQC (4 qubits)", "Quantum ML", "quantum_vqc", "cm_quantum_vqc.png",
            ["backend", "n_qubits", "n_layers", "epochs", "learning_rate", "batch_size",
             "n_trainable_params", "quantum_params"],
            ("quantum_vqc_history", None,
             {"train_loss": "train_loss", "train_acc": "train_accuracy"}),
        ),
        (
            "QSVM (quantum kernel)", "Quantum ML", "quantum_qsvm", "cm_quantum_qsvm.png",
            ["n_qubits", "feature_map_reps", "best_params"],
            None,
        ),
        (
            "QNN (PennyLane, 4 qubits)", "Quantum ML", "qnn_features", "cm_qnn_features.png",
            ["framework", "n_qubits", "n_layers", "ansatz", "encoding", "epochs",
             "learning_rate", "batch_size", "n_trainable_params", "quantum_params"],
            ("qnn_features_history", "final_refit",
             {"train_loss": "train_loss", "train_acc": "train_accuracy",
              "train_f1": "train_f1_macro"}),
        ),
        (
            "Hybrid ResNet18 + quantum (frozen)", "Hybrid QML", "qnn_hybrid_frozen_quantum",
            "cm_qnn_hybrid_frozen_quantum.png",
            hybrid_keys,
            ("qnn_hybrid_frozen_quantum_history", None, hybrid_history),
        ),
        (
            "Hybrid ResNet18 + quantum (fine-tuned)", "Hybrid QML", "qnn_hybrid_finetune_quantum",
            "cm_qnn_hybrid_finetune_quantum.png",
            hybrid_keys,
            ("qnn_hybrid_finetune_quantum_history", None, hybrid_history),
        ),
    ]
    for name, family, stem, cm, keys, hist_spec in specs:
        src = m / f"{stem}.json"
        d = load(src)
        params = {"algorithm": name, "input": "8 PCA features as rotation angles" if family ==
            "Quantum ML" else "image patches (ResNet18 features)", **flat_params(d, keys)}
        metrics = {**test_metrics(d), "train_time_s": d["train_time_s"],
                   "inference_ms_per_sample": d["inference_ms_per_sample"]}
        history = None
        if hist_spec:
            hfile, sub, mapping = hist_spec
            rows = load(m / f"{hfile}.json")
            history = (rows[sub] if sub else rows, mapping)
        log_run(name, family, params=params, metrics=metrics,
                tags={"source_file": src.relative_to(REPO).as_posix(),
                      "simulated": "yes (classical simulator)"},
                artifacts=[(src, "results"), (QML / "graphs" / cm, "plots")], history=history)


def production_run():
    src = DL_ROOT / "results" / "test_metrics.json"
    d = load(src)
    report = d["classification_report"]
    with open(DL_ROOT / "results" / "training_history.csv", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    with mlflow.start_run(run_name="ResNet18-production (original dataset)"):
        mlflow.set_tags({"family": "Deep learning",
    "logged_from": "saved results file (not retrained)",
    "logged_by": LOGGED_BY,
    "dataset": "dl/datasets/raw (DVC), 1,110 test images",
    "served_by": "dl/src/api.py",
     "source_file": "dl/results/test_metrics.json"})
        mlflow.log_params({"model": "ResNet18",
    "pretrained": "ImageNet",
    "epochs": len(rows),
    "batch_size": 16,
    "learning_rate": 0.0001,
    "optimizer": "Adam",
    "image_size": "224x224",
     "test_images": d["test_images"]})
        mlflow.log_metrics({"test_accuracy": d["test_accuracy"],
    "precision_macro": report["macro avg"]["precision"],
    "recall_macro": report["macro avg"]["recall"],
     "f1_macro": report["macro avg"]["f1-score"]})
        for row in rows:
            step = int(row["epoch"])
            for k in ("train_loss", "train_accuracy", "val_loss", "val_accuracy"):
                mlflow.log_metric(k, float(row[k]), step=step)
        for path in (
    "test_metrics.json",
    "training_history.csv",
    "confusion_matrix.png",
    "accuracy_curve.png",
     "loss_curve.png"):
            if (DL_ROOT / "results" / path).exists():
                mlflow.log_artifact(str(DL_ROOT / "results" / path), artifact_path="results")
    print(
    f"logged  {
        'Deep learning':<15} {
            'ResNet18-production (original dataset)':<38} acc {
                d['test_accuracy']:.3f}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n", maxsplit=1)[0])
    parser.add_argument(
    "--repo",
    type=Path,
    default=REPO,
     help="project root (default: this checkout)")
    parser.add_argument("--tracking-uri", help="default: sqlite:///<repo>/dl/mlflow.db")
    args = parser.parse_args()
    set_repo(args.repo)
    args.tracking_uri = args.tracking_uri or f"sqlite:///{(DL_ROOT / 'mlflow.db').as_posix()}"
    os.chdir(DL_ROOT)  # new experiments keep their artifacts in dl/mlruns
    mlflow.set_tracking_uri(args.tracking_uri)
    client = MlflowClient()

    exp = mlflow.set_experiment("TrafficCare-Model-Comparison")
    client.set_experiment_tag(
    exp.experiment_id,
    "mlflow.note.content",
    "All ML, DL and QML models scored on the same 300 CPRD test patches. "
    "Logged from the committed results files; quantum models were run on a simulator.")
    clear_previous(client, exp.experiment_id)
    classical_runs()
    dl_runs()
    quantum_runs()

    exp = mlflow.set_experiment("Smart-Traffic-DL-Training")
    clear_previous(client, exp.experiment_id)
    production_run()


if __name__ == "__main__":
    main()
