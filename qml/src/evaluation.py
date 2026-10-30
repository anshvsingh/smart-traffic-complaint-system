"""Shared metrics, timing and plotting so classical and quantum models are judged identically."""

from __future__ import annotations

import json
import time
from contextlib import contextmanager
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score,
                             precision_recall_fscore_support, precision_score, recall_score)

QML_ROOT = Path(__file__).resolve().parents[1]
METRICS_DIR = QML_ROOT / "results" / "metrics"
GRAPHS_DIR = QML_ROOT / "results" / "graphs"
METRICS_DIR.mkdir(parents=True, exist_ok=True)
GRAPHS_DIR.mkdir(parents=True, exist_ok=True)

CLASS_LABELS = ["Road Damage\n(Cracks)", "Normal Road", "Pothole"]
CLASS_KEYS = ["Cracks", "Normal", "Pothole"]

# Palette used in every figure. Validated for colour-vision deficiency
# (adjacent-pair CVD dE >= 9); bars always carry value labels, so colour is never the only cue.
COLORS = {
    "classical_full": "#2a78d6",     # blue
    "classical_reduced": "#1baf7a",  # aqua
    "vqc": "#eb6834",                # orange
    "qsvm": "#6250d6",               # violet
}
INK, MUTED, GRID = "#1f2328", "#5f6368", "#e1e0d9"



@contextmanager
def timer():
    """with timer() as t: ...  ->  t() returns elapsed seconds."""
    start = time.perf_counter()
    elapsed = [None]
    yield lambda: elapsed[0] if elapsed[0] is not None else time.perf_counter() - start
    elapsed[0] = time.perf_counter() - start


def compute_metrics(y_true, y_pred, train_time_s=None, inference_time_s=None, extra=None) -> dict:
    """Macro-averaged metrics (classes are balanced, so macro == what we care about)."""
    p, r, f, s = precision_recall_fscore_support(y_true, y_pred, labels=[0, 1, 2], zero_division=0)
    out = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision_macro": float(precision_score(y_true, y_pred, average="macro", zero_division=0)),
        "recall_macro": float(recall_score(y_true, y_pred, average="macro", zero_division=0)),
        "f1_macro": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        "per_class": {k: {"precision": float(p[i]), "recall": float(r[i]), "f1": float(f[i]), "support": int(s[i])}
                      for i, k in enumerate(CLASS_KEYS)},
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=[0, 1, 2]).tolist(),
        "n_test": int(len(y_true)),
    }
    if train_time_s is not None:
        out["train_time_s"] = float(train_time_s)
    if inference_time_s is not None:
        out["inference_time_s"] = float(inference_time_s)
        out["inference_ms_per_sample"] = float(1000 * inference_time_s / max(1, len(y_true)))
    if extra:
        out.update(extra)
    return out


def save_metrics(name: str, metrics: dict) -> Path:
    path = METRICS_DIR / f"{name}.json"
    path.write_text(json.dumps(metrics, indent=2))
    return path


def plot_confusion(cm, title: str, filename: str, cmap="Blues") -> Path:
    cm = np.asarray(cm)
    fig, ax = plt.subplots(figsize=(5.2, 4.4))
    ax.imshow(cm, cmap=cmap)
    ax.set_xticks(range(3), CLASS_LABELS, fontsize=9)
    ax.set_yticks(range(3), CLASS_LABELS, fontsize=9)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_title(title, fontsize=11)
    thresh = cm.max() / 2
    for i in range(3):
        for j in range(3):
            ax.text(j, i, cm[i, j], ha="center", va="center",
                    color="white" if cm[i, j] > thresh else "#111827", fontsize=11)
    fig.tight_layout()
    path = GRAPHS_DIR / filename
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return path


# ============================================================================
# Classical vs quantum comparison (run after classical_model.py and quantum_model.py)
#   python qml/src/evaluation.py                     # main experiment
#   python qml/src/evaluation.py --classical-tag unseen_highway_classical --quantum-tag unseen_highway
# ============================================================================
PRETTY = {
    "logistic_regression": "Logistic Regression", "svm_rbf": "SVM (RBF)", "random_forest": "Random Forest",
}


def _load(name):
    return json.loads((METRICS_DIR / f"{name}.json").read_text())


def _style(ax):
    ax.spines[["top", "right"]].set_visible(False)
    ax.spines[["left", "bottom"]].set_color("#c3c2b7")
    ax.tick_params(colors=MUTED, labelsize=9)
    ax.yaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def build_comparison(classical_tag="classical", quantum_tag="quantum", out_suffix=""):
    best = _load(f"{classical_tag}_best")
    cf, cr = _load(best["full"]), _load(best["reduced"])
    vqc, qsvm = _load(f"{quantum_tag}_vqc"), _load(f"{quantum_tag}_qsvm")
    headline = [
        ("classical_full", f"Classical: {PRETTY[cf['model']]}\n16 features", cf),
        ("classical_reduced", f"Classical: {PRETTY[cr['model']]}\nsame 8 features as QML", cr),
        ("vqc", f"QML: VQC\n{vqc['n_qubits']} qubits, {vqc['n_layers']} layers", vqc),
        ("qsvm", f"QML: QSVM\nquantum kernel, {qsvm['n_qubits']} qubits", qsvm),
    ]

    # ---- table (markdown + json) ----
    rows = []
    for key in ("logistic_regression", "svm_rbf", "random_forest"):
        for setting in ("full", "reduced"):
            m = _load(f"{classical_tag}_{key}_{setting}")
            rows.append((f"{PRETTY[key]} ({'16 feat.' if setting == 'full' else '8 PCA feat.'})", "Classical", m))
    rows += [("VQC (4 qubits)", "Quantum (simulated)", vqc), ("QSVM, quantum kernel (4 qubits)", "Quantum (simulated)", qsvm)]

    def fmt(m):
        return (f"{m['accuracy']:.3f} | {m['precision_macro']:.3f} | {m['recall_macro']:.3f} | {m['f1_macro']:.3f} | "
                f"{m['train_time_s']:.2f} | {m['inference_ms_per_sample']:.3f}")

    lines = ["| Model | Type | Accuracy | Precision | Recall | F1 | Training time (s) | Inference (ms/sample) |",
             "|---|---|---|---|---|---|---|---|"]
    lines += [f"| {n} | {t} | {fmt(m)} |" for n, t, m in rows]
    head = ["| Metric | Classical ML — best by CV, 16 features | Classical ML — best by CV, same 8 features | QML — VQC | QML — QSVM |",
            "|---|---|---|---|---|"]
    for label, k, f in [("Accuracy", "accuracy", "{:.3f}"), ("Precision (macro)", "precision_macro", "{:.3f}"),
                        ("Recall (macro)", "recall_macro", "{:.3f}"), ("F1-score (macro)", "f1_macro", "{:.3f}"),
                        ("Training time (s)", "train_time_s", "{:.2f}"),
                        ("Inference time (ms/sample)", "inference_ms_per_sample", "{:.3f}")]:
        head.append(f"| {label} | " + " | ".join(f.format(m[k]) for _, _, m in headline) + " |")
    head.insert(2, "| Model | " + " | ".join(t.replace("\n", ", ") for _, t, _ in headline) + " |")
    md = "\n".join(["## Headline comparison", "", *head, "", "## All models", "", *lines, ""])
    (METRICS_DIR / f"comparison{out_suffix}.md").write_text(md)
    (METRICS_DIR / f"comparison{out_suffix}.json").write_text(json.dumps(
        {k: {kk: m[kk] for kk in ("accuracy", "precision_macro", "recall_macro", "f1_macro", "train_time_s",
                                  "inference_ms_per_sample")} | {"label": t.replace("\n", ", ")}
         for k, t, m in headline}, indent=2))

    # ---- graph 1: quality metrics ----
    metrics = [("accuracy", "Accuracy"), ("precision_macro", "Precision"), ("recall_macro", "Recall"), ("f1_macro", "F1-score")]
    fig, ax = plt.subplots(figsize=(10, 4.6))
    w = 0.2
    for i, (key, label, m) in enumerate(headline):
        xs = np.arange(len(metrics)) + (i - 1.5) * w
        vals = [m[k] for k, _ in metrics]
        ax.bar(xs, vals, w - 0.02, color=COLORS[key], label=label.replace("\n", " — "))
        for x, v in zip(xs, vals):
            ax.text(x, v + 0.012, f"{v:.2f}", ha="center", va="bottom", fontsize=8, color=INK)
    ax.set_xticks(range(len(metrics)), [l for _, l in metrics], color=INK)
    ax.set_ylim(0, 1)
    ax.set_ylabel("Score on held-out test set (macro avg.)", color=MUTED)
    ax.axhline(1 / 3, color=MUTED, linestyle=":", linewidth=1, label="chance level (1/3)")
    ax.set_title("Classical ML vs QML — road patch classification (300 test patches)", color=INK, fontsize=12, loc="left")
    _style(ax)
    ax.legend(fontsize=8, frameon=False, ncol=2, loc="upper left", bbox_to_anchor=(0, -0.08))
    fig.tight_layout()
    fig.savefig(GRAPHS_DIR / f"comparison_metrics{out_suffix}.png", dpi=150, bbox_inches="tight")
    plt.close(fig)

    # ---- graph 2: time (two separate panels, each its own scale) ----
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.8))
    for ax, (k, title) in zip(axes, [("train_time_s", "Training time (s, log scale)"),
                                     ("inference_ms_per_sample", "Inference time per sample (ms, log scale)")]):
        vals = [m[k] for _, _, m in headline]
        ax.bar(range(4), vals, 0.6, color=[COLORS[key] for key, _, _ in headline])
        ax.set_yscale("log")
        for i, v in enumerate(vals):
            ax.text(i, v * 1.15, f"{v:.3g}", ha="center", va="bottom", fontsize=8, color=INK)
        ax.set_xticks(range(4), [t.split("\n")[0].replace("Classical: ", "").replace("QML: ", "") +
                                 ("\n(16 feat.)" if key == "classical_full" else "\n(8 feat.)" if key == "classical_reduced" else "")
                                 for key, t, _ in headline], fontsize=8)
        ax.set_title(title, color=INK, fontsize=10, loc="left")
        ax.set_ylim(top=max(vals) * 6)
        _style(ax)
    fig.text(0.01, 0.01, "Quantum models run on a classical simulator, so these are simulator times. "
             "Training time = final fit only (hyper-parameter search excluded for every model).",
             fontsize=8, color=MUTED)
    fig.tight_layout(rect=(0, 0.06, 1, 1))
    fig.savefig(GRAPHS_DIR / f"comparison_time{out_suffix}.png", dpi=150)
    plt.close(fig)

    # ---- graph 3: per-class F1 ----
    fig, ax = plt.subplots(figsize=(9, 4.2))
    for i, (key, label, m) in enumerate(headline):
        xs = np.arange(3) + (i - 1.5) * w
        vals = [m["per_class"][c]["f1"] for c in CLASS_KEYS]
        ax.bar(xs, vals, w - 0.02, color=COLORS[key], label=label.replace("\n", " — "))
        for x, v in zip(xs, vals):
            ax.text(x, v + 0.012, f"{v:.2f}", ha="center", va="bottom", fontsize=8, color=INK)
    ax.set_xticks(range(3), [c.replace("\n", " ") for c in CLASS_LABELS], color=INK)
    ax.set_ylim(0, 1)
    ax.set_ylabel("F1-score", color=MUTED)
    ax.set_title("F1-score per class", color=INK, fontsize=12, loc="left")
    _style(ax)
    ax.legend(fontsize=8, frameon=False, ncol=2, loc="upper left", bbox_to_anchor=(0, -0.08))
    fig.tight_layout()
    fig.savefig(GRAPHS_DIR / f"comparison_per_class_f1{out_suffix}.png", dpi=150, bbox_inches="tight")
    plt.close(fig)

    # ---- graph 4: confusion matrices side by side ----
    fig, axes = plt.subplots(1, 4, figsize=(16, 4.2))
    for ax, (key, label, m) in zip(axes, headline):
        cm = np.asarray(m["confusion_matrix"])
        ax.imshow(cm, cmap="Blues" if key.startswith("classical") else "Oranges", vmin=0, vmax=100)
        for i in range(3):
            for j in range(3):
                ax.text(j, i, cm[i, j], ha="center", va="center", color="white" if cm[i, j] > 50 else INK, fontsize=11)
        ax.set_xticks(range(3), ["Cracks", "Normal", "Pothole"], fontsize=8)
        ax.set_yticks(range(3), ["Cracks", "Normal", "Pothole"], fontsize=8)
        ax.set_xlabel("Predicted", fontsize=9)
        ax.set_title(label + f"\nacc {m['accuracy']:.2f}", fontsize=9, color=INK)
    axes[0].set_ylabel("Actual", fontsize=9)
    fig.tight_layout()
    fig.savefig(GRAPHS_DIR / f"confusion_matrices{out_suffix}.png", dpi=150)
    plt.close(fig)

    print(md)
    return md


def plot_vqc_selection(quantum_tag="quantum"):
    sel = _load(f"{quantum_tag}_hyperparameter_selection")
    fig, ax = plt.subplots(figsize=(9, 4))
    layers = sorted({v["layers"] for v in sel.values()})
    lrs = sorted({v["lr"] for v in sel.values()})
    styles = ["-", "--", ":"]
    shades = {L: c for L, c in zip(layers, ["#f4a582", "#eb6834", "#a83c10", "#5c1f06"])}
    for k, v in sel.items():
        ax.plot(range(1, len(v["val_f1_curve"]) + 1), v["val_f1_curve"], styles[lrs.index(v["lr"]) % 3],
                color=shades[v["layers"]], linewidth=1.6, label=f"{v['layers']} layers, lr={v['lr']}")
    ax.set_xlabel("Epoch")
    ax.set_ylabel("Validation macro F1")
    ax.set_title("VQC hyper-parameter selection (validation road stretches only — test set unused)",
                 fontsize=10, loc="left", color=INK)
    _style(ax)
    ax.legend(fontsize=7, frameon=False, ncol=3)
    fig.tight_layout()
    fig.savefig(GRAPHS_DIR / f"{quantum_tag}_vqc_selection.png", dpi=150)
    plt.close(fig)


def plot_dataset_samples(csv_path=None, per_class=8):
    """Montage of training patches per class (needs the raw CPRD images locally)."""
    import pandas as pd
    from PIL import Image
    csv_path = csv_path or QML_ROOT / "data" / "features_cprd.csv"
    df = pd.read_csv(csv_path)
    root = QML_ROOT / "data" / "cprd" / "Dataset"
    fig, axes = plt.subplots(3, per_class, figsize=(per_class * 1.4, 3 * 1.55))
    for r, cls in enumerate(CLASS_KEYS):
        sub = df[(df.split == "train") & (df.label == cls)].sample(per_class, random_state=3)
        for c, sid in enumerate(sub.sample_id):
            img_id, yx = sid.split("@")
            y, x = map(int, yx.split("_"))
            patch = np.asarray(Image.open(root / img_id / f"{img_id}_RAW.jpg").convert("RGB"))[y:y + 128, x:x + 128]
            axes[r, c].imshow(patch)
            axes[r, c].axis("off")
        axes[r, 0].set_title(CLASS_LABELS[r].replace("\n", " "), fontsize=9, loc="left", color=INK)
    fig.tight_layout()
    fig.savefig(GRAPHS_DIR / "dataset_samples.png", dpi=130)
    plt.close(fig)


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--classical-tag", default="classical")
    ap.add_argument("--quantum-tag", default="quantum")
    ap.add_argument("--suffix", default="")
    ap.add_argument("--samples", action="store_true", help="also draw dataset_samples.png (needs raw images)")
    a = ap.parse_args()
    build_comparison(a.classical_tag, a.quantum_tag, a.suffix)
    if (METRICS_DIR / f"{a.quantum_tag}_hyperparameter_selection.json").exists():
        plot_vqc_selection(a.quantum_tag)
    if a.samples:
        plot_dataset_samples()
