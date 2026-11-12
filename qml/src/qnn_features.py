"""
Quantum Neural Network (QNN) on the 8 hand-crafted feature angles - PyTorch + PennyLane.

What is different from the VQC in quantum_model.py
---------------------------------------------------
The VQC is a hand-written model: our own NumPy simulator, parameter-shift gradients,
one measured qubit per class and a per-class scale/bias. This QNN is the same idea
built as a *neural-network layer*:

    8 angles (same StandardScaler -> PCA(8) -> [0, pi] reducer as the VQC/QSVM)
      -> PennyLane TorchLayer (4 qubits):
             for each layer l:
                 encode   RY(x[2q]) RZ(x[2q+1]) on qubit q   (identical dense angle encoding;
                                                              repeated every layer when re-uploading is on)
                 trainable StronglyEntanglingLayers block (Rot(phi,theta,omega) per qubit + CNOT ring
                                                              with range r = l mod 3 + 1)
             measure <Z_0>, <Z_1>, <Z_2>, <Z_3>
      -> Linear(4 -> 3) classical head -> softmax / cross-entropy

* gradients by automatic differentiation (backprop through the simulator), Adam optimiser;
* all four qubits are read out and mixed by a learned linear head;
* hyper-parameters (layers, re-uploading on/off, learning rate) are chosen on a group
  validation split of the TRAINING stretches (the test set is never looked at);
* early stopping on validation macro F1; the final model is re-trained on all 900 training
  patches for the chosen number of epochs - exactly the VQC protocol.

A *classical control* with the same head and a similar number of parameters
(Linear(8->4) + tanh + Linear(4->3) = 51 parameters; the QNN has 12 per layer + 15, i.e. 39 for the
selected 2 layers and 51 for 3 layers)
is trained with the identical protocol, so the effect of swapping the quantum layer
for a classical one can be read off directly.

Everything is a CLASSICAL SIMULATION (PennyLane default.qubit). No quantum advantage is claimed.

Usage
    python qml/src/qnn_features.py                              # main split: sweep + final + control + seeds
    python qml/src/qnn_features.py --csv qml/data/features_cprd_unseen_highway.csv --tag unseen_highway
    python qml/src/qnn_features.py --check                     # QNN circuit == hand-written VQC circuit check
"""

from __future__ import annotations

import argparse
import itertools
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from evaluation import GRAPHS_DIR, METRICS_DIR, INK, MUTED, compute_metrics, plot_confusion, save_metrics  # noqa: E402
from preprocessing import DATA_DIR, SEED, load_features, make_reducer  # noqa: E402

N_QUBITS = 4
N_FEATURES = 2 * N_QUBITS
N_CLASSES = 3
QNN_COLOR = "#c2185b"       # magenta - new colour, distinct from the existing four
CONTROL_COLOR = "#7a7a7a"   # grey for classical controls


# ============================================================================
# Model pieces (shared with qnn_hybrid.py)
# ============================================================================
def encode(inputs, n_qubits, encoding):
    """dense: RY(x[2q]) RZ(x[2q+1]) on qubit q (same as the VQC/QSVM); ry: RY(x[q])."""
    import pennylane as qml
    for q in range(n_qubits):
        if encoding == "dense":
            qml.RY(inputs[..., 2 * q], wires=q)
            qml.RZ(inputs[..., 2 * q + 1], wires=q)
        else:
            qml.RY(inputs[..., q], wires=q)


def make_circuit(n_qubits=N_QUBITS, n_layers=3, reupload=True, encoding="dense", device="default.qubit"):
    """Return the PennyLane QNode (torch interface, backprop) and its weight shapes."""
    import pennylane as qml

    dev = qml.device(device, wires=n_qubits)

    @qml.qnode(dev, interface="torch", diff_method="backprop")
    def circuit(inputs, weights):
        for layer in range(n_layers):
            if reupload or layer == 0:
                encode(inputs, n_qubits, encoding)
            # one StronglyEntanglingLayers block per layer, keeping the standard range schedule
            qml.StronglyEntanglingLayers(weights[layer:layer + 1], wires=range(n_qubits),
                                         ranges=[layer % (n_qubits - 1) + 1])
        return [qml.expval(qml.PauliZ(q)) for q in range(n_qubits)]

    return circuit, {"weights": (n_layers, n_qubits, 3)}


class QuantumLayer:
    """Factory for a float32 TorchLayer (outputs cast to float32 so they mix with nn.Linear)."""

    @staticmethod
    def build(n_qubits=N_QUBITS, n_layers=3, reupload=True, encoding="dense"):
        import pennylane as qml
        import torch

        circuit, shapes = make_circuit(n_qubits, n_layers, reupload, encoding)
        tl = qml.qnn.TorchLayer(circuit, shapes)

        class _Wrapped(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.tl = tl
                self.circuit = circuit

            def forward(self, x):
                return self.tl(x).to(torch.float32)

        return _Wrapped()


def build_model(kind, n_layers=3, reupload=True):
    import torch.nn as nn

    if kind == "qnn":
        return nn.Sequential(QuantumLayer.build(N_QUBITS, n_layers, reupload, "dense"), nn.Linear(N_QUBITS, N_CLASSES))
    if kind == "control":   # classical control: same 4-wide bottleneck + same head
        return nn.Sequential(nn.Linear(N_FEATURES, N_QUBITS), nn.Tanh(), nn.Linear(N_QUBITS, N_CLASSES))
    raise ValueError(kind)


def n_params(model):
    return int(sum(p.numel() for p in model.parameters() if p.requires_grad))


# ============================================================================
# Training
# ============================================================================
def _evaluate(model, X, y):
    import torch
    import torch.nn.functional as F
    from sklearn.metrics import f1_score

    model.eval()
    with torch.no_grad():
        logits = model(X)
        loss = float(F.cross_entropy(logits, y))
        pred = logits.argmax(1).numpy()
    yn = y.numpy()
    return loss, float((pred == yn).mean()), float(f1_score(yn, pred, average="macro"))


def train(model, X, y, X_val=None, y_val=None, lr=0.03, epochs=100, patience=15, batch_size=32,
          seed=SEED, verbose=False):
    """Adam + cross-entropy. With validation data: early stopping on val macro F1 (best weights restored).
    Without: train for exactly `epochs` epochs (used for the final re-fit)."""
    import copy

    import torch
    import torch.nn.functional as F

    opt = torch.optim.Adam(model.parameters(), lr=lr)
    rng = np.random.default_rng(seed)
    hist, best, best_state, bad = [], -1.0, None, 0
    for epoch in range(1, epochs + 1):
        model.train()
        order = rng.permutation(len(y))
        for s in range(0, len(y), batch_size):
            bi = torch.as_tensor(order[s:s + batch_size])
            opt.zero_grad()
            loss = F.cross_entropy(model(X[bi]), y[bi])
            loss.backward()
            opt.step()
        tl, ta, tf = _evaluate(model, X, y)
        rec = {"epoch": epoch, "train_loss": tl, "train_acc": ta, "train_f1": tf}
        if X_val is not None:
            vl, va, vf = _evaluate(model, X_val, y_val)
            rec.update(val_loss=vl, val_acc=va, val_f1=vf)
            if vf > best + 1e-9:
                best, best_state, bad, rec["best"] = vf, copy.deepcopy(model.state_dict()), 0, True
            else:
                bad += 1
        hist.append(rec)
        if verbose and (epoch == 1 or epoch % 10 == 0):
            print("   " + "  ".join(f"{k}={v:.3f}" if isinstance(v, float) else f"{k}={v}" for k, v in rec.items()), flush=True)
        if X_val is not None and bad >= patience:
            break
    best_epoch = None
    if best_state is not None:
        model.load_state_dict(best_state)
        best_epoch = max(h["epoch"] for h in hist if h.get("best"))
    return {"history": hist, "best_val_f1": best if X_val is not None else None, "best_epoch": best_epoch}


# ============================================================================
# Data
# ============================================================================
def load_angles(csv_path):
    """Exactly the inputs the VQC/QSVM get: reducer fitted on training data, same group val split."""
    import torch

    from quantum_model import _group_val_split

    X_train_raw, X_test_raw, y_train, y_test, df = load_features(csv_path)
    df_train = df[df.split == "train"].reset_index(drop=True)
    reducer = make_reducer(N_FEATURES).fit(X_train_raw)
    X_train, X_test = reducer.transform(X_train_raw), reducer.transform(X_test_raw)
    tr_idx, va_idx = _group_val_split(df_train)
    t = lambda a: torch.tensor(np.array(a), dtype=torch.float32)  # noqa: E731
    l = lambda a: torch.tensor(np.array(a), dtype=torch.long)    # noqa: E731
    return dict(X_train=t(X_train), X_test=t(X_test), y_train=l(y_train), y_test=l(y_test),
                tr_idx=tr_idx, va_idx=va_idx)


# ============================================================================
# Sweep worker (runs in a separate process so configs train in parallel)
# ============================================================================
def _cpu_only():
    """Part A is CPU-only. Hide the GPU so torch (whose Adam probes the CUDA stream) never opens a
    CUDA context per worker process - the GPU is shared with the DL training."""
    os.environ["CUDA_VISIBLE_DEVICES"] = ""


def _sweep_job(job):
    _cpu_only()
    import torch
    torch.set_num_threads(job.get("threads", 2))
    d = load_angles(job["csv"])
    torch.manual_seed(job["seed"])
    model = build_model(job["kind"], job["layers"], job["reupload"])
    t0 = time.perf_counter()
    res = train(model, d["X_train"][d["tr_idx"]], d["y_train"][d["tr_idx"]],
                d["X_train"][d["va_idx"]], d["y_train"][d["va_idx"]],
                lr=job["lr"], epochs=job["max_epochs"], patience=job["patience"], seed=job["seed"])
    return {**{k: job[k] for k in ("kind", "layers", "reupload", "lr")},
            "val_f1": res["best_val_f1"], "best_epoch": res["best_epoch"], "epochs_run": len(res["history"]),
            "time_s": time.perf_counter() - t0, "n_params": n_params(model), "history": res["history"]}


def _key(c):
    if c["kind"] == "control":
        return f"control,lr={c['lr']}"
    return f"layers={c['layers']},reupload={'on' if c['reupload'] else 'off'},lr={c['lr']}"


def run_sweep(jobs, workers):
    out = {}
    if workers <= 1:
        results = map(_sweep_job, jobs)
    else:
        ex = ProcessPoolExecutor(max_workers=workers)
        results = ex.map(_sweep_job, jobs)
    for r in results:
        out[_key(r)] = r
        print(f"  [{_key(r)}] best val F1={r['val_f1']:.3f} at epoch {r['best_epoch']} "
              f"({r['epochs_run']} run, {r['time_s']:.0f}s, {r['n_params']} params)", flush=True)
    return out


# ============================================================================
# Experiment
# ============================================================================
def final_fit_and_test(d, kind, layers, reupload, lr, epochs, seed=SEED):
    import torch
    torch.manual_seed(seed)
    model = build_model(kind, layers, reupload)
    t0 = time.perf_counter()
    res = train(model, d["X_train"], d["y_train"], lr=lr, epochs=epochs, seed=seed)
    train_time = time.perf_counter() - t0
    model.eval()
    with torch.no_grad():
        t0 = time.perf_counter()
        y_pred = model(d["X_test"]).argmax(1).numpy()
        infer_time = time.perf_counter() - t0
    return model, res["history"], y_pred, train_time, infer_time


def plot_curves(sel_hist, final_hist, title, path, best_epoch):
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 2, figsize=(10.5, 3.8))
    e = [h["epoch"] for h in sel_hist]
    ax[0].plot(e, [h["train_loss"] for h in sel_hist], color=QNN_COLOR, label="train (selection run)")
    ax[0].plot(e, [h["val_loss"] for h in sel_hist], color=QNN_COLOR, ls="--", label="validation")
    ax[0].plot([h["epoch"] for h in final_hist], [h["train_loss"] for h in final_hist], color=INK, lw=1,
               alpha=0.6, label="final re-fit on all train")
    ax[0].set(title="Cross-entropy loss", xlabel="Epoch", ylabel="Loss")
    ax[1].plot(e, [h["train_f1"] for h in sel_hist], color=QNN_COLOR, label="train")
    ax[1].plot(e, [h["val_f1"] for h in sel_hist], color=QNN_COLOR, ls="--", label="validation")
    ax[1].axvline(best_epoch, color=MUTED, ls=":", lw=1, label=f"best val epoch ({best_epoch})")
    ax[1].set(title="Macro F1", xlabel="Epoch", ylabel="F1", ylim=(0, 1))
    for a in ax:
        a.grid(alpha=0.3)
        a.legend(fontsize=7, frameon=False)
    fig.suptitle(title, fontsize=10, x=0.01, ha="left", color=INK)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def plot_selection(sel, path, title):
    import matplotlib.pyplot as plt
    q = {k: v for k, v in sel.items() if v["kind"] == "qnn"}
    lrs = sorted({v["lr"] for v in q.values()})
    layers = sorted({v["layers"] for v in q.values()})
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.8), sharey=True)
    for ax, ru in zip(axes, (True, False)):
        w = 0.8 / len(lrs)
        for i, lr in enumerate(lrs):
            vals = [q.get(f"layers={L},reupload={'on' if ru else 'off'},lr={lr}", {}).get("val_f1", np.nan) for L in layers]
            xs = np.arange(len(layers)) + (i - (len(lrs) - 1) / 2) * w
            ax.bar(xs, vals, w * 0.95, color=QNN_COLOR, alpha=0.35 + 0.65 * (i + 1) / len(lrs), label=f"lr={lr}")
            for x, v in zip(xs, vals):
                if not np.isnan(v):
                    ax.text(x, v + 0.01, f"{v:.2f}", ha="center", fontsize=7, color=INK)
        if not ru and 1 in layers:
            ax.text(layers.index(1), 0.05, "1 layer:\nsame circuit\nas ON", ha="center", fontsize=7.5, color=MUTED)
        ax.set_xticks(range(len(layers)), [f"{L} layer{'s' if L > 1 else ''}" for L in layers])
        ax.set_title(f"data re-uploading {'ON' if ru else 'OFF'}", fontsize=10, loc="left")
        ax.set_ylim(0, 1)
        ax.grid(axis="y", alpha=0.3)
    axes[0].set_ylabel("best validation macro F1")
    axes[0].legend(fontsize=8, frameon=False)
    fig.suptitle(title, fontsize=10, x=0.01, ha="left", color=INK)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def run(args):
    _cpu_only()
    import torch
    torch.set_num_threads(max(1, args.threads))
    csv = str(args.csv or DATA_DIR / "features_cprd.csv")
    prefix = "qnn_features" + ("" if args.tag in ("", "quantum") else f"_{args.tag}")
    d = load_angles(csv)
    print(f"[QNN] {csv}: train {len(d['y_train'])} (fit {len(d['tr_idx'])} / val {len(d['va_idx'])}), test {len(d['y_test'])}")

    base = dict(csv=csv, seed=SEED, max_epochs=args.max_epochs, patience=args.patience, threads=args.job_threads)
    if args.config:          # reuse a configuration chosen on another split (as the VQC does for unseen highways)
        cfg = json.loads((METRICS_DIR / f"{args.config}.json").read_text())["chosen_config"]
        q_jobs = [dict(base, kind="qnn", layers=cfg["layers"], reupload=cfg["reupload"], lr=cfg["lr"])]
        c_jobs = [dict(base, kind="control", layers=0, reupload=False, lr=cfg["control_lr"])]
    else:
        q_jobs = [dict(base, kind="qnn", layers=L, reupload=ru, lr=lr)
                  for L, ru, lr in itertools.product(args.layers, (True, False), args.lrs) if not (L == 1 and not ru)]
        c_jobs = [dict(base, kind="control", layers=0, reupload=False, lr=lr) for lr in args.lrs]
    t0 = time.perf_counter()
    print(f"[QNN] hyper-parameter selection on the validation stretches: {len(q_jobs)} QNN + {len(c_jobs)} control configs")
    sel = run_sweep(q_jobs + c_jobs, args.workers)
    sweep_time = time.perf_counter() - t0

    def pick(kind):
        cands = {k: v for k, v in sel.items() if v["kind"] == kind}
        # ties -> fewer parameters (simpler model)
        return max(cands.items(), key=lambda kv: (round(kv[1]["val_f1"], 6), -kv[1]["n_params"]))

    qk, qbest = pick("qnn")
    ck, cbest = pick("control")
    chosen = {"layers": qbest["layers"], "reupload": qbest["reupload"], "lr": qbest["lr"], "epochs": qbest["best_epoch"],
              "control_lr": cbest["lr"], "control_epochs": cbest["best_epoch"]}
    print(f"[QNN] chosen: {qk} epochs={qbest['best_epoch']} (val F1 {qbest['val_f1']:.3f}); "
          f"control: {ck} epochs={cbest['best_epoch']} (val F1 {cbest['val_f1']:.3f})")
    (METRICS_DIR / f"{prefix}_selection.json").write_text(json.dumps(
        {"protocol": "group validation split of the training stretches (20 %), early stopping on val macro F1 "
                     f"(patience {args.patience}, max {args.max_epochs} epochs), seed {SEED}; test set unused",
         "sweep_wall_time_s": sweep_time, "chosen_config": chosen,
         "configs": {k: {kk: vv for kk, vv in v.items() if kk != "history"} |
                     {"val_f1_curve": [round(h["val_f1"], 4) for h in v["history"]]} for k, v in sel.items()}},
        indent=2))
    if not args.config:
        plot_selection(sel, GRAPHS_DIR / f"{prefix}_selection.png",
                       "QNN hyper-parameter selection (validation road stretches only - test set unused)")

    # ---- final QNN: re-fit on all training data for the chosen epoch budget, evaluate once ----
    model, hist, y_pred, tt, it = final_fit_and_test(d, "qnn", qbest["layers"], qbest["reupload"], qbest["lr"], qbest["best_epoch"])
    yt = d["y_test"].numpy()
    m = compute_metrics(yt, y_pred, tt, it, extra={
        "model": "qnn_features", "framework": f"PennyLane {__import__('pennylane').__version__} TorchLayer, default.qubit, backprop",
        "n_qubits": N_QUBITS, "n_layers": qbest["layers"], "data_reuploading": qbest["reupload"],
        "ansatz": "StronglyEntanglingLayers", "encoding": "dense angle RY(x2q) RZ(x2q+1)",
        "readout": "<Z> on all 4 qubits -> Linear(4,3)", "epochs": qbest["best_epoch"], "learning_rate": qbest["lr"],
        "batch_size": 32, "n_input_features": N_FEATURES, "n_trainable_params": n_params(model),
        "quantum_params": int(model[0].tl.weights.numel()), "n_train": int(len(d["y_train"])),
        "validation_f1_used_for_selection": qbest["val_f1"], "selection": qk,
        "note": "classical state-vector simulation; times are simulator times, not quantum hardware times"})
    save_metrics(prefix, m)
    (METRICS_DIR / f"{prefix}_weights.json").write_text(json.dumps(
        {k: v.tolist() for k, v in model.state_dict().items()} | {"n_layers": qbest["layers"], "reupload": qbest["reupload"]}, indent=2))
    (METRICS_DIR / f"{prefix}_history.json").write_text(json.dumps(
        {"selection_run": sel[qk]["history"], "final_refit": hist}, indent=2))
    split_name = "unseen highways" if "unseen" in prefix else "road stretches"
    plot_confusion(m["confusion_matrix"], f"QNN on features ({N_QUBITS} qubits, {qbest['layers']} layers)\n{split_name}",
                   f"cm_{prefix}.png", cmap="RdPu")
    plot_curves(sel[qk]["history"], hist, f"QNN on 8 feature angles - {qk} ({split_name})",
                GRAPHS_DIR / f"{prefix}_training_curve.png", qbest["best_epoch"])
    print(f"[QNN] TEST acc={m['accuracy']:.3f} f1={m['f1_macro']:.3f} train={tt:.1f}s infer={m['inference_ms_per_sample']:.3f} ms/sample")

    # ---- classical control, identical protocol ----
    cmodel, chist, cy, ctt, cit = final_fit_and_test(d, "control", 0, False, cbest["lr"], cbest["best_epoch"])
    mc = compute_metrics(yt, cy, ctt, cit, extra={
        "model": "classical_control_mlp", "architecture": "Linear(8,4) + tanh + Linear(4,3)",
        "epochs": cbest["best_epoch"], "learning_rate": cbest["lr"], "n_trainable_params": n_params(cmodel),
        "validation_f1_used_for_selection": cbest["val_f1"],
        "note": "classical replacement of the quantum layer, same inputs, head, optimiser and protocol"})
    save_metrics(f"{prefix}_classical_control", mc)
    plot_confusion(mc["confusion_matrix"], f"Classical control MLP (8-4-3)\n{split_name}", f"cm_{prefix}_classical_control.png", cmap="Greys")
    print(f"[control] TEST acc={mc['accuracy']:.3f} f1={mc['f1_macro']:.3f} train={ctt:.2f}s")

    # ---- seed robustness: same config / epochs, 5 different initialisations ----
    seeds = {"qnn": [], "control": []}
    for s in args.seeds:
        for kind, (L, ru, lr, ep) in {"qnn": (qbest["layers"], qbest["reupload"], qbest["lr"], qbest["best_epoch"]),
                                      "control": (0, False, cbest["lr"], cbest["best_epoch"])}.items():
            _, _, yp, _, _ = final_fit_and_test(d, kind, L, ru, lr, ep, seed=s)
            mm = compute_metrics(yt, yp)
            seeds[kind].append({"seed": s, "accuracy": mm["accuracy"], "f1_macro": mm["f1_macro"]})
    summary = {k: {"seeds": v, "accuracy_mean": float(np.mean([r["accuracy"] for r in v])),
                   "accuracy_std": float(np.std([r["accuracy"] for r in v])),
                   "f1_mean": float(np.mean([r["f1_macro"] for r in v])), "f1_std": float(np.std([r["f1_macro"] for r in v]))}
               for k, v in seeds.items()}
    summary["note"] = "same configuration and epoch budget, only the weight initialisation / batch order seed changes"
    (METRICS_DIR / f"{prefix}_seeds.json").write_text(json.dumps(summary, indent=2))
    for k in ("qnn", "control"):
        print(f"[seeds] {k}: acc {summary[k]['accuracy_mean']:.3f} +- {summary[k]['accuracy_std']:.3f}, "
              f"F1 {summary[k]['f1_mean']:.3f} +- {summary[k]['f1_std']:.3f}")

    # ---- circuit diagram ----
    import pennylane as qml
    circ = model[0].circuit
    txt = qml.draw(circ, decimals=2, max_length=120)(d["X_test"][:1], model[0].tl.weights.detach())
    (METRICS_DIR / f"{prefix}_circuit.txt").write_text(txt, encoding="utf-8")
    return m


def check_against_vqc(n_layers=2):
    """Sanity check: with SEL replaced by the VQC's RY/RZ + CNOT-ring, PennyLane-torch reproduces numpy_expvals.
    (Verifies that the encoding and wire conventions used here are the VQC's.)"""
    import pennylane as qml
    import torch

    from quantum_model import numpy_expvals
    rng = np.random.default_rng(0)
    X = rng.uniform(0, np.pi, size=(16, N_FEATURES))
    theta = rng.uniform(0, 2 * np.pi, size=(n_layers, N_QUBITS, 2))
    dev = qml.device("default.qubit", wires=N_QUBITS)

    @qml.qnode(dev, interface="torch")
    def c(x, th):
        for layer in range(n_layers):
            encode(x, N_QUBITS, "dense")
            for q in range(N_QUBITS):
                qml.RY(th[layer, q, 0], wires=q)
                qml.RZ(th[layer, q, 1], wires=q)
            for q in range(N_QUBITS):
                qml.CNOT(wires=[q, (q + 1) % N_QUBITS])
        return [qml.expval(qml.PauliZ(k)) for k in range(3)]

    pl = torch.stack(c(torch.as_tensor(X), torch.as_tensor(theta)), 1).numpy()
    diff = np.abs(pl - numpy_expvals(X, theta, n_layers)).max()
    print(f"max |PennyLane-torch - VQC NumPy simulator| = {diff:.2e}")
    assert diff < 1e-8
    print("OK: the QNN uses the same encoding / wire conventions as the VQC.")


def draw_circuits():
    """Gate-level (decomposed) text diagrams of the two QNN circuits -> results/metrics/qnn_circuits.txt."""
    import pennylane as qml
    import torch

    blocks = []
    for title, (L, ru, enc, n_in) in {
        "Part A - QNN on the 8 feature angles (chosen: 2 layers, re-uploading off)": (2, False, "dense", 8),
        "Part A - same circuit with data re-uploading on (2 layers)": (2, True, "dense", 8),
        "Part B - quantum layer of the hybrid ResNet18 network (3 layers, re-uploading on, RY encoding)": (3, True, "ry", 4),
    }.items():
        circ, shapes = make_circuit(N_QUBITS, L, ru, enc)
        txt = qml.draw(circ, level="device", decimals=None, max_length=200)(torch.zeros(n_in), torch.zeros(shapes["weights"]))
        blocks.append(f"### {title}" + chr(10) * 2 + txt + chr(10))
    out = METRICS_DIR / "qnn_circuits.txt"
    out.write_text(chr(10).join(blocks), encoding="utf-8")
    print(f"wrote qml/results/metrics/{out.name}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="QNN (PennyLane TorchLayer) on the 8 feature angles.")
    ap.add_argument("--csv", type=Path, default=None)
    ap.add_argument("--tag", default="quantum")
    ap.add_argument("--config", default=None, help="reuse chosen_config from <name>.json in results/metrics (no sweep)")
    ap.add_argument("--layers", type=int, nargs="+", default=[1, 2, 3, 4])
    ap.add_argument("--lrs", type=float, nargs="+", default=[0.01, 0.03, 0.1])
    ap.add_argument("--max-epochs", type=int, default=100)
    ap.add_argument("--patience", type=int, default=15)
    ap.add_argument("--seeds", type=int, nargs="+", default=[0, 1, 2, 3, 4])
    ap.add_argument("--workers", type=int, default=min(6, os.cpu_count() or 1))
    ap.add_argument("--job-threads", type=int, default=2)
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--draw", action="store_true", help="write gate-level circuit diagrams")
    a = ap.parse_args()
    if a.draw:
        draw_circuits()
    elif a.check:
        check_against_vqc()
    else:
        run(a)
