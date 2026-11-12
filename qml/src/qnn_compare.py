"""
Comparison of the QNNs with everything that already exists (classical ML, VQC, QSVM).

Reads only result JSONs in qml/results/metrics and writes NEW files (existing files are untouched):
    results/metrics/comparison_with_qnn{suffix}.md / .json
    results/graphs/comparison_with_qnn{suffix}.png

    python qml/src/qnn_compare.py                       # main split (500 m road stretches)
    python qml/src/qnn_compare.py --unseen-highway      # stricter split
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from evaluation import COLORS, GRAPHS_DIR, GRID, INK, METRICS_DIR, MUTED, PRETTY, _style  # noqa: E402

QNN = "#c2185b"
CONTROL = "#8a8a8a"
IDENTITY = "#c9c9c9"


def _load(name):
    p = METRICS_DIR / f"{name}.json"
    return json.loads(p.read_text()) if p.exists() else None


def collect(unseen):
    ctag = "unseen_highway_classical" if unseen else "classical"
    qtag = "unseen_highway" if unseen else "quantum"
    fsuf = "_unseen_highway" if unseen else ""
    best = _load(f"{ctag}_best")
    cf, cr = _load(best["full"]), _load(best["reduced"])
    rows = []   # (section, label, color, hatch, metrics, seed_stats or None, type)

    def add(section, label, color, hatch, m, seeds=None, kind=""):
        if m is not None:
            rows.append(dict(section=section, label=label, color=color, hatch=hatch, m=m, seeds=seeds, kind=kind))

    S1 = "Inputs: hand-crafted features"
    add(S1, f"{PRETTY[cf['model']]} (16 features)", COLORS["classical_full"], None, cf, kind="Classical")
    add(S1, f"{PRETTY[cr['model']]} (same 8 angles)", COLORS["classical_reduced"], None, cr, kind="Classical")
    add(S1, "VQC, 4 qubits", COLORS["vqc"], None, _load(f"{qtag}_vqc"), kind="Quantum (sim.)")
    add(S1, "QSVM, quantum kernel", COLORS["qsvm"], None, _load(f"{qtag}_qsvm"), kind="Quantum (sim.)")
    seeds = _load(f"qnn_features{fsuf}_seeds")
    qf = _load(f"qnn_features{fsuf}")
    lab = f"QNN, 4 qubits, {qf['n_layers']} layers" if qf else "QNN"
    add(S1, lab, QNN, None, qf, seeds and {"acc": (seeds["qnn"]["accuracy_mean"], seeds["qnn"]["accuracy_std"]),
                                            "f1": (seeds["qnn"]["f1_mean"], seeds["qnn"]["f1_std"]), "n": len(seeds["qnn"]["seeds"])},
        kind="Quantum (sim.)")
    add(S1, "Classical control MLP 8-4-3", CONTROL, "///", _load(f"qnn_features{fsuf}_classical_control"),
        seeds and {"acc": (seeds["control"]["accuracy_mean"], seeds["control"]["accuracy_std"]),
                   "f1": (seeds["control"]["f1_mean"], seeds["control"]["f1_std"]), "n": len(seeds["control"]["seeds"])},
        kind="Classical")

    hp = "qnn_hybrid" + fsuf
    for setting, sname in (("frozen", "ResNet18 frozen"), ("finetune", "ResNet18 fine-tuned layer4")):
        S = f"Inputs: image patches ({sname})"
        for mid, lab, col, hatch, kind in (("quantum", "+ quantum layer (4 qubits)", QNN, None, "Hybrid quantum (sim.)"),
                                           ("classical", "+ classical control layer", CONTROL, "///", "Classical"),
                                           ("identity", "+ no middle layer", IDENTITY, "...", "Classical")):
            m = _load(f"{hp}_{setting}_{mid}")
            if m:
                add(S, lab, col, hatch, m, {"acc": (m["accuracy_mean"], m["accuracy_std"]),
                                            "f1": (m["f1_mean"], m["f1_std"]), "n": len(m["seeds"])}, kind=kind)
    return rows


def write_table(rows, suffix, unseen):
    lines = ["| Inputs | Model | Type | Accuracy | Precision | Recall | F1 | F1 mean ± sd (seeds) | Training time (s) | Inference (ms/sample) |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    out = {}
    for r in rows:
        m, s = r["m"], r["seeds"]
        sd = f"{s['f1'][0]:.3f} ± {s['f1'][1]:.3f} (n={s['n']})" if s else "—"
        sec = r["section"].replace("Inputs: ", "")
        lines.append(f"| {sec} | {r['label']} | {r['kind']} | {m['accuracy']:.3f} | {m['precision_macro']:.3f} | "
                     f"{m['recall_macro']:.3f} | {m['f1_macro']:.3f} | {sd} | {m['train_time_s']:.2f} | {m['inference_ms_per_sample']:.3f} |")
        out[f"{sec} | {r['label']}"] = {k: m[k] for k in ("accuracy", "precision_macro", "recall_macro", "f1_macro",
                                                          "train_time_s", "inference_ms_per_sample")} | (
            {"f1_seed_mean": s["f1"][0], "f1_seed_std": s["f1"][1], "acc_seed_mean": s["acc"][0],
             "acc_seed_std": s["acc"][1], "n_seeds": s["n"]} if s else {})
    title = "unseen-highway split" if unseen else "main split (500 m road stretches)"
    md = "\n".join([f"## All models incl. QNNs - {title}", "",
                    "300 held-out test patches. Single headline run (seed 42) per model; the seed column repeats the "
                    "training with other initialisations. Hybrid training time excludes the one-off backbone feature "
                    "caching for the frozen setting; hybrid inference is end-to-end (resize + ResNet18 on GPU + middle layer).",
                    "", *lines, ""])
    (METRICS_DIR / f"comparison_with_qnn{suffix}.md").write_text(md, encoding="utf-8")
    (METRICS_DIR / f"comparison_with_qnn{suffix}.json").write_text(json.dumps(out, indent=2))
    print(md)


def plot(rows, suffix, unseen):
    import matplotlib.pyplot as plt

    # y positions with a gap between input sections
    ys, y, prev, sec_pos = [], 0.0, None, []
    for r in rows:
        if prev is not None and r["section"] != prev:
            y += 0.9
        if r["section"] != prev:
            sec_pos.append((y, r["section"]))
        ys.append(y)
        prev = r["section"]
        y += 1
    ys = np.array(ys)
    fig, axes = plt.subplots(1, 2, figsize=(12.5, 0.42 * len(rows) + 2.4), sharey=True)
    for ax, (key, skey, title) in zip(axes, [("accuracy", "acc", "Accuracy"), ("f1_macro", "f1", "Macro F1-score")]):
        vals = [r["m"][key] for r in rows]
        bars = ax.barh(ys, vals, 0.72, color=[r["color"] for r in rows], edgecolor="white", linewidth=2)
        for b, r in zip(bars, rows):
            if r["hatch"]:
                b.set_hatch(r["hatch"])
                b.set_edgecolor("white")
        for yy, v, r in zip(ys, vals, rows):
            right = max(v, sum(r["seeds"][skey]) if r["seeds"] else 0)   # clear of the error bar
            ax.text(right + 0.015, yy, f"{v:.2f}", va="center", fontsize=8, color=INK)
        first = True
        for yy, r in zip(ys, rows):
            if r["seeds"]:
                mu, sd = r["seeds"][skey]
                ax.errorbar(mu, yy, xerr=sd, fmt="o", ms=3.5, color=INK, ecolor=INK, elinewidth=1, capsize=2.5,
                            label="mean ± sd over seeds" if first else None, zorder=3)
                first = False
        ax.axvline(1 / 3, color=MUTED, ls=":", lw=1, label="chance (1/3)")
        ax.set_xlim(0, 1.08)
        ax.set_title(title, loc="left", fontsize=11, color=INK)
        _style(ax)
        ax.yaxis.grid(False)
        ax.xaxis.grid(True, color=GRID, linewidth=0.8)
    axes[0].set_yticks(ys, [r["label"] for r in rows], fontsize=8.5, color=INK)
    axes[0].invert_yaxis()
    for yy, s in sec_pos:
        axes[0].annotate(s, xy=(0, yy - 0.62), xycoords=("axes fraction", "data"), xytext=(-4, 0),
                         textcoords="offset points", ha="right", va="center", fontsize=8.5, color=MUTED,
                         fontweight="bold", annotation_clip=False)
    axes[1].legend(fontsize=8, frameon=False, loc="upper right", bbox_to_anchor=(1.0, -0.06), ncol=2)
    split = "unseen highways" if unseen else "500 m road stretches"
    fig.suptitle(f"Classical ML vs VQC / QSVM vs QNNs - 300 held-out test patches ({split})",
                 x=0.01, ha="left", fontsize=12, color=INK)
    fig.text(0.01, -0.01, "Bars: headline run (seed 42). Hatched grey = classical replacement of the quantum layer "
             "(same inputs, head and protocol). All quantum models are classical simulations.",
             fontsize=8, color=MUTED)
    fig.tight_layout(rect=(0, 0.03, 1, 0.97))
    fig.savefig(GRAPHS_DIR / f"comparison_with_qnn{suffix}.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--unseen-highway", action="store_true")
    a = ap.parse_args()
    suffix = "_unseen_highway" if a.unseen_highway else ""
    rows = collect(a.unseen_highway)
    write_table(rows, suffix, a.unseen_highway)
    plot(rows, suffix, a.unseen_highway)
