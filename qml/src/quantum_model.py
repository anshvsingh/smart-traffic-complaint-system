"""
Variational Quantum Classifier (VQC) for road-surface patches: Cracks / Normal / Pothole.

Circuit (4 qubits, L layers, "data re-uploading"):

    for each layer l = 1..L:
        encode  : on qubit q  ->  RY(x[2q]) then RZ(x[2q+1])     (8 features on 4 qubits)
        train   : on qubit q  ->  RY(theta[l,q,0]) then RZ(theta[l,q,1])
        entangle: CNOT(0->1), CNOT(1->2), CNOT(2->3), CNOT(3->0)  (ring)
    measure <Z0>, <Z1>, <Z2>   -> one number in [-1, 1] per class

Classical post-processing (the "hybrid" part):
    logit_k = a_k * <Z_k> + b_k ,  p = softmax(logits) ,  loss = cross-entropy

Training: Adam. Gradients of the quantum parameters use the PARAMETER-SHIFT
rule (the same rule real quantum hardware uses):
    d<Z>/d(theta) = ( <Z>(theta + pi/2) - <Z>(theta - pi/2) ) / 2
Gradients of a_k, b_k are ordinary calculus.

Two interchangeable backends compute the circuit:
    * "numpy"     - a small exact state-vector simulator written here (no extra installs,
                    used to produce the committed results)
    * "pennylane" - the same circuit built with PennyLane's default.qubit device
                    (pip install pennylane; e.g. on Google Colab)
`python qml/src/quantum_model.py --check-pennylane` verifies that both give identical numbers.

This is a CLASSICAL SIMULATION of a quantum circuit. Nothing here runs on quantum
hardware, and nothing here shows "quantum advantage".
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from evaluation import GRAPHS_DIR, METRICS_DIR, compute_metrics, plot_confusion, save_metrics  # noqa: E402
from preprocessing import SEED, load_features, make_reducer  # noqa: E402

N_QUBITS = 4
N_FEATURES = 2 * N_QUBITS  # dense angle encoding: RY + RZ per qubit
N_CLASSES = 3


# ============================================================================
# Backend 1: exact state-vector simulator (NumPy)
# ============================================================================
# A state of n qubits is 2**n complex amplitudes. We keep it as an array of shape
# (batch, 2, 2, ..., 2): axis 1+q is qubit q, so a gate on qubit q is a small
# matrix multiplication along that one axis.

def _ry(theta):
    """RY rotation matrices. theta: scalar or (B,) -> (2,2) or (B,2,2)."""
    c, s = np.cos(np.asarray(theta) / 2), np.sin(np.asarray(theta) / 2)
    return np.stack([np.stack([c, -s], -1), np.stack([s, c], -1)], -2).astype(complex)


def _rz(theta):
    """RZ rotation matrices: diag(e^{-i theta/2}, e^{+i theta/2})."""
    t = np.asarray(theta)
    z = np.zeros_like(t, dtype=complex)
    return np.stack([np.stack([np.exp(-0.5j * t), z], -1), np.stack([z, np.exp(0.5j * t)], -1)], -2)


def _apply_1q(state, gate, q):
    """Apply a single-qubit gate to qubit q. gate: (2,2) shared, or (B,2,2) one per sample."""
    axis = q + 1
    state = np.moveaxis(state, axis, -1)                     # (..., 2) with qubit q last
    if gate.ndim == 2:
        state = state @ gate.T
    else:                                                    # per-sample gate
        shp = state.shape
        flat = state.reshape(shp[0], -1, 2)                  # (B, rest, 2)
        flat = np.einsum("bij,brj->bri", gate, flat)
        state = flat.reshape(shp)
    return np.moveaxis(state, -1, axis)


def _apply_cnot(state, control, target):
    """CNOT: flip the target qubit on the half of the state where control = 1."""
    state = state.copy()
    idx = [slice(None)] * state.ndim
    idx[control + 1] = 1
    sub = state[tuple(idx)]                                  # control=1 block
    t_axis = target + 1 - (1 if target > control else 0)    # axis index inside the block
    state[tuple(idx)] = np.flip(sub, axis=t_axis)
    return state


def numpy_expvals(X, theta, n_layers, n_qubits=N_QUBITS, reupload=True):
    """<Z_k> for k = 0..N_CLASSES-1 for every sample. X: (B, 2n) angles, theta: (L, n, 2)."""
    X = np.atleast_2d(X)
    B = X.shape[0]
    state = np.zeros((B,) + (2,) * n_qubits, dtype=complex)
    state[(slice(None),) + (0,) * n_qubits] = 1.0            # every qubit starts in |0>
    for layer in range(n_layers):
        if reupload or layer == 0:
            for q in range(n_qubits):
                state = _apply_1q(state, _ry(X[:, 2 * q]), q)
                state = _apply_1q(state, _rz(X[:, 2 * q + 1]), q)
        for q in range(n_qubits):
            state = _apply_1q(state, _ry(theta[layer, q, 0]), q)
            state = _apply_1q(state, _rz(theta[layer, q, 1]), q)
        for q in range(n_qubits):
            state = _apply_cnot(state, q, (q + 1) % n_qubits)
    probs = np.abs(state) ** 2
    out = []
    for k in range(N_CLASSES):
        p_k = np.moveaxis(probs, k + 1, 1).reshape(B, 2, -1).sum(-1)   # P(qubit k = 0), P(=1)
        out.append(p_k[:, 0] - p_k[:, 1])                               # <Z> = P(0) - P(1)
    return np.stack(out, 1)                                              # (B, 3)


def numpy_kernel_states(X, n_qubits=N_QUBITS, reps=2):
    """Feature-map states |phi(x)> for the quantum-kernel (QSVM) experiment: encode + CNOT ring, `reps` times."""
    X = np.atleast_2d(X)
    B = X.shape[0]
    state = np.zeros((B,) + (2,) * n_qubits, dtype=complex)
    state[(slice(None),) + (0,) * n_qubits] = 1.0
    for _ in range(reps):
        for q in range(n_qubits):
            state = _apply_1q(state, _ry(X[:, 2 * q]), q)
            state = _apply_1q(state, _rz(X[:, 2 * q + 1]), q)
        for q in range(n_qubits):
            state = _apply_cnot(state, q, (q + 1) % n_qubits)
    return state.reshape(B, -1)


# ============================================================================
# Backend 2: PennyLane (same circuit, same gate conventions)
# ============================================================================
def make_pennylane_expvals(n_layers, n_qubits=N_QUBITS, reupload=True):
    import pennylane as qml

    dev = qml.device("default.qubit", wires=n_qubits)

    @qml.qnode(dev)
    def circuit(x, theta):
        # x: (B, 2n) -> PennyLane "parameter broadcasting" runs the whole batch at once
        for layer in range(n_layers):
            if reupload or layer == 0:
                for q in range(n_qubits):
                    qml.RY(x[:, 2 * q], wires=q)
                    qml.RZ(x[:, 2 * q + 1], wires=q)
            for q in range(n_qubits):
                qml.RY(theta[layer, q, 0], wires=q)
                qml.RZ(theta[layer, q, 1], wires=q)
            for q in range(n_qubits):
                qml.CNOT(wires=[q, (q + 1) % n_qubits])
        return [qml.expval(qml.PauliZ(k)) for k in range(N_CLASSES)]

    def expvals(X, theta, n_layers_=None, n_qubits_=None, reupload_=None):
        res = circuit(np.atleast_2d(X), theta)
        return np.stack([np.asarray(r, dtype=float).reshape(-1) for r in res], 1)

    expvals.circuit = circuit
    return expvals


# ============================================================================
# The classifier
# ============================================================================
def _softmax(z):
    z = z - z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)


class VQC:
    def __init__(self, n_layers=3, lr=0.05, epochs=60, batch_size=32, backend="numpy",
                 reupload=True, seed=SEED, verbose=True):
        self.n_layers, self.lr, self.epochs, self.batch_size = n_layers, lr, epochs, batch_size
        self.backend, self.reupload, self.seed, self.verbose = backend, reupload, seed, verbose
        rng = np.random.default_rng(seed)
        self.theta = rng.uniform(0, 2 * np.pi, size=(n_layers, N_QUBITS, 2))  # quantum weights
        self.a = np.full(N_CLASSES, 3.0)    # classical scale: <Z> in [-1,1] -> logits in [-3,3]
        self.b = np.zeros(N_CLASSES)        # classical bias
        self.history = []
        if backend == "pennylane":
            self._expvals = make_pennylane_expvals(n_layers, reupload=reupload)
        else:
            self._expvals = lambda X, th: numpy_expvals(X, th, self.n_layers, reupload=self.reupload)

    @property
    def n_params(self):
        return self.theta.size + self.a.size + self.b.size

    # ---- forward ----
    def expvals(self, X, theta=None):
        return self._expvals(X, self.theta if theta is None else theta)

    def predict_proba(self, X):
        return _softmax(self.a * self.expvals(X) + self.b)

    def predict(self, X):
        return self.predict_proba(X).argmax(1)

    def loss(self, X, y):
        p = self.predict_proba(X)
        return float(-np.log(p[np.arange(len(y)), y] + 1e-12).mean())

    # ---- gradients ----
    def _gradients(self, X, y):
        ez = self.expvals(X)                                   # (B,3)
        p = _softmax(self.a * ez + self.b)
        onehot = np.eye(N_CLASSES)[y]
        dlogits = (p - onehot) / len(y)                        # dL/dlogit (softmax + CE)
        grad_a = (dlogits * ez).sum(0)
        grad_b = dlogits.sum(0)
        dez = dlogits * self.a                                 # dL/d<Z_k>

        grad_theta = np.zeros_like(self.theta)
        shift = np.pi / 2
        for idx in np.ndindex(self.theta.shape):               # parameter-shift rule, one parameter at a time
            plus, minus = self.theta.copy(), self.theta.copy()
            plus[idx] += shift
            minus[idx] -= shift
            d_ez = (self.expvals(X, plus) - self.expvals(X, minus)) / 2   # d<Z_k>/d theta_idx, (B,3)
            grad_theta[idx] = (dez * d_ez).sum()
        return grad_theta, grad_a, grad_b

    # ---- training (Adam) ----
    def fit(self, X, y, X_val=None, y_val=None):
        from sklearn.metrics import f1_score

        rng = np.random.default_rng(self.seed)
        params = [self.theta, self.a, self.b]
        m = [np.zeros_like(p) for p in params]
        v = [np.zeros_like(p) for p in params]
        b1, b2, eps, t = 0.9, 0.999, 1e-8, 0
        best = (-1.0, None)
        for epoch in range(1, self.epochs + 1):
            order = rng.permutation(len(y))
            for start in range(0, len(y), self.batch_size):
                bi = order[start:start + self.batch_size]
                grads = self._gradients(X[bi], y[bi])
                t += 1
                for i, (p, g) in enumerate(zip(params, grads)):
                    m[i] = b1 * m[i] + (1 - b1) * g
                    v[i] = b2 * v[i] + (1 - b2) * g * g
                    p -= self.lr * (m[i] / (1 - b1 ** t)) / (np.sqrt(v[i] / (1 - b2 ** t)) + eps)
            rec = {"epoch": epoch, "train_loss": self.loss(X, y),
                   "train_acc": float((self.predict(X) == y).mean())}
            if X_val is not None:
                pv = self.predict(X_val)
                rec.update(val_loss=self.loss(X_val, y_val), val_acc=float((pv == y_val).mean()),
                           val_f1=float(f1_score(y_val, pv, average="macro")))
                if rec["val_f1"] > best[0]:   # keep the epoch with the best VALIDATION F1
                    best = (rec["val_f1"], (self.theta.copy(), self.a.copy(), self.b.copy(), epoch))
            self.history.append(rec)
            if self.verbose and (epoch == 1 or epoch % 5 == 0):
                print("  " + "  ".join(f"{k}={v:.3f}" if isinstance(v, float) else f"{k}={v}" for k, v in rec.items()))
        if best[1] is not None:
            th, a, b_, ep = best[1]
            self.theta[...], self.a[...], self.b[...] = th, a, b_
            self.best_epoch = ep
        return self

    def to_dict(self):
        return {"n_layers": self.n_layers, "reupload": self.reupload, "theta": self.theta.tolist(),
                "a": self.a.tolist(), "b": self.b.tolist()}


# ============================================================================
# Experiment runner
# ============================================================================
def _group_val_split(df_train, frac=0.2):
    """Hold out ~20 % of the TRAINING road stretches as validation (never the test set)."""
    from sklearn.model_selection import GroupShuffleSplit
    gss = GroupShuffleSplit(n_splits=1, test_size=frac, random_state=SEED)
    tr, va = next(gss.split(df_train, groups=df_train["group"]))
    return tr, va


def run(args):
    X_train_raw, X_test_raw, y_train, y_test, df = load_features(args.csv)
    df_train = df[df.split == "train"].reset_index(drop=True)
    prefix = args.tag

    # --- 1. reduce 16 features -> 8 angles in [0, pi] (fit on training data only) ---
    reducer = make_reducer(N_FEATURES).fit(X_train_raw)
    X_train, X_test = reducer.transform(X_train_raw), reducer.transform(X_test_raw)
    tr_idx, va_idx = _group_val_split(df_train)

    metrics = None
    if not args.qsvm_only:
        metrics = _run_vqc(args, X_train, X_test, y_train, y_test, tr_idx, va_idx, prefix)
    if not args.skip_qsvm:
        _run_qsvm(X_train, X_test, y_train, y_test, df_train, prefix)
    return metrics


def _run_vqc(args, X_train, X_test, y_train, y_test, tr_idx, va_idx, prefix):
    import matplotlib.pyplot as plt

    # --- 2. choose layers + learning rate on the validation split (test set untouched) ---
    results = {}
    best_cfg, best_val = None, -1
    for L in args.layers:
        for lr in args.lrs:
            print(f"\n[VQC] layers={L} lr={lr}: training on {len(tr_idx)} / validating on {len(va_idx)}")
            model = VQC(n_layers=L, lr=lr, epochs=args.epochs, batch_size=args.batch_size,
                        backend=args.backend, verbose=False)
            t0 = time.perf_counter()
            model.fit(X_train[tr_idx], y_train[tr_idx], X_train[va_idx], y_train[va_idx])
            dt = time.perf_counter() - t0
            val_f1 = max(h["val_f1"] for h in model.history)
            key = f"layers={L},lr={lr}"
            results[key] = {"layers": L, "lr": lr, "val_f1": val_f1, "best_epoch": model.best_epoch,
                            "time_s": dt, "n_params": model.n_params,
                            "val_f1_curve": [round(h["val_f1"], 4) for h in model.history]}
            print(f"[VQC] {key}: best val F1={val_f1:.3f} at epoch {model.best_epoch} ({dt:.1f}s)")
            if val_f1 > best_val + 1e-9:
                best_val, best_cfg = val_f1, (L, lr, model.best_epoch)
    (METRICS_DIR / f"{prefix}_hyperparameter_selection.json").write_text(json.dumps(results, indent=2))

    # --- 3. retrain the chosen configuration on ALL training data, fixed epoch budget ---
    L, lr, n_epochs = best_cfg
    print(f"\n[VQC] final model: layers={L}, lr={lr}, epochs={n_epochs} (chosen on validation), "
          f"all {len(y_train)} training samples")
    final = VQC(n_layers=L, lr=lr, epochs=n_epochs, batch_size=args.batch_size, backend=args.backend)
    t0 = time.perf_counter()
    final.fit(X_train, y_train)
    train_time = time.perf_counter() - t0

    # --- 4. evaluate ONCE on the untouched test set ---
    t0 = time.perf_counter()
    y_pred = final.predict(X_test)
    infer_time = time.perf_counter() - t0
    metrics = compute_metrics(y_test, y_pred, train_time, infer_time, extra={
        "model": "vqc", "backend": args.backend, "n_qubits": N_QUBITS, "n_layers": L, "epochs": n_epochs,
        "n_input_features": N_FEATURES, "n_trainable_params": final.n_params,
        "quantum_params": int(final.theta.size), "learning_rate": lr, "batch_size": args.batch_size,
        "n_train": int(len(y_train)), "validation_f1_used_for_selection": best_val,
        "note": "classical state-vector simulation; times are simulator times, not quantum hardware times",
    })
    save_metrics(f"{prefix}_vqc", metrics)
    (METRICS_DIR / f"{prefix}_vqc_weights.json").write_text(json.dumps(final.to_dict(), indent=2))
    plot_confusion(metrics["confusion_matrix"], f"VQC ({N_QUBITS} qubits, {L} layers)", f"cm_{prefix}_vqc.png", cmap="Oranges")
    print(f"[VQC] TEST acc={metrics['accuracy']:.3f} f1={metrics['f1_macro']:.3f} train={train_time:.1f}s")

    # training curve of the final run
    hist = final.history
    fig, ax = plt.subplots(1, 2, figsize=(10, 3.8))
    ax[0].plot([h["epoch"] for h in hist], [h["train_loss"] for h in hist], color="#eb6834")
    ax[0].set(title="VQC training loss (cross-entropy)", xlabel="Epoch", ylabel="Loss")
    ax[1].plot([h["epoch"] for h in hist], [h["train_acc"] for h in hist], color="#eb6834")
    ax[1].set(title="VQC training accuracy", xlabel="Epoch", ylabel="Accuracy", ylim=(0, 1))
    for a_ in ax:
        a_.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(GRAPHS_DIR / f"{prefix}_vqc_training_curve.png", dpi=150)
    plt.close(fig)
    (METRICS_DIR / f"{prefix}_vqc_history.json").write_text(json.dumps(hist, indent=2))

    return metrics


def _run_qsvm(X_train, X_test, y_train, y_test, df_train, prefix):
    """Quantum-kernel SVM on the same 8 angles. Timing mirrors the classical models:
    training time = kernel matrix + one SVC fit with the chosen C (the C search is excluded)."""
    from sklearn.model_selection import GridSearchCV, GroupKFold
    from sklearn.svm import SVC

    print("\n[QSVM] building quantum kernel matrices")
    S_train = numpy_kernel_states(X_train)
    K_train = np.abs(S_train.conj() @ S_train.T) ** 2       # fidelity |<phi(x)|phi(x')>|^2
    search = GridSearchCV(SVC(kernel="precomputed"), {"C": [0.1, 1, 10, 100]},
                          cv=GroupKFold(4), scoring="f1_macro")
    search.fit(K_train, y_train, groups=df_train["group"].to_numpy())

    t0 = time.perf_counter()
    S_train = numpy_kernel_states(X_train)
    K_train = np.abs(S_train.conj() @ S_train.T) ** 2
    svc = SVC(kernel="precomputed", C=search.best_params_["C"]).fit(K_train, y_train)
    train_time = time.perf_counter() - t0

    t0 = time.perf_counter()
    K_test = np.abs(numpy_kernel_states(X_test).conj() @ S_train.T) ** 2
    y_pred = svc.predict(K_test)
    infer_time = time.perf_counter() - t0
    mq = compute_metrics(y_test, y_pred, train_time, infer_time, extra={
        "model": "qsvm_fidelity_kernel", "n_qubits": N_QUBITS, "feature_map_reps": 2,
        "best_params": search.best_params_, "cv_f1_macro": float(search.best_score_),
        "n_input_features": N_FEATURES, "n_train": int(len(y_train)),
        "note": "kernel computed by exact simulation; train time = train kernel matrix + SVC fit",
    })
    save_metrics(f"{prefix}_qsvm", mq)
    plot_confusion(mq["confusion_matrix"], f"QSVM (quantum kernel, {N_QUBITS} qubits)", f"cm_{prefix}_qsvm.png", cmap="Oranges")
    print(f"[QSVM] TEST acc={mq['accuracy']:.3f} f1={mq['f1_macro']:.3f} (C={search.best_params_['C']})")
    return mq


def self_test(n_layers=2, n=5):
    """Check the simulator against a brute-force 16x16 matrix construction (Kronecker products),
    and the parameter-shift gradient against finite differences."""
    rng = np.random.default_rng(1)
    X = rng.uniform(0, np.pi, size=(n, N_FEATURES))
    theta = rng.uniform(0, 2 * np.pi, size=(n_layers, N_QUBITS, 2))
    I2 = np.eye(2)

    def on(q, g):  # embed a 1-qubit gate acting on wire q (wire 0 = most significant bit)
        mats = [g if w == q else I2 for w in range(N_QUBITS)]
        out = mats[0]
        for mtx in mats[1:]:
            out = np.kron(out, mtx)
        return out

    def cnot(c, t):
        dim = 2 ** N_QUBITS
        U = np.zeros((dim, dim))
        for i in range(dim):
            bits = [(i >> (N_QUBITS - 1 - w)) & 1 for w in range(N_QUBITS)]
            if bits[c]:
                bits[t] ^= 1
            j = sum(b << (N_QUBITS - 1 - w) for w, b in enumerate(bits))
            U[j, i] = 1
        return U

    Z = np.diag([1, -1])
    ref = []
    for x in X:
        psi = np.zeros(2 ** N_QUBITS, complex)
        psi[0] = 1
        for layer in range(n_layers):
            for q in range(N_QUBITS):
                psi = on(q, _rz(x[2 * q + 1])) @ on(q, _ry(x[2 * q])) @ psi
            for q in range(N_QUBITS):
                psi = on(q, _rz(theta[layer, q, 1])) @ on(q, _ry(theta[layer, q, 0])) @ psi
            for q in range(N_QUBITS):
                psi = cnot(q, (q + 1) % N_QUBITS) @ psi
        ref.append([np.real(psi.conj() @ on(k, Z) @ psi) for k in range(N_CLASSES)])
    diff = np.abs(np.array(ref) - numpy_expvals(X, theta, n_layers)).max()
    print(f"simulator vs dense-matrix reference: max diff = {diff:.2e}")
    assert diff < 1e-10

    # parameter shift vs finite differences on one parameter
    idx, h = (0, 1, 0), 1e-6
    plus, minus = theta.copy(), theta.copy()
    plus[idx] += np.pi / 2
    minus[idx] -= np.pi / 2
    ps = (numpy_expvals(X, plus, n_layers) - numpy_expvals(X, minus, n_layers)) / 2
    plus[idx], minus[idx] = theta[idx] + h, theta[idx] - h
    fd = (numpy_expvals(X, plus, n_layers) - numpy_expvals(X, minus, n_layers)) / (2 * h)
    print(f"parameter-shift vs finite-difference gradient: max diff = {np.abs(ps - fd).max():.2e}")
    assert np.abs(ps - fd).max() < 1e-6
    print("OK: simulator and parameter-shift gradients are correct.")


def check_pennylane(n_layers=2, n=16):
    """Run the same random inputs/weights through both backends and compare."""
    rng = np.random.default_rng(0)
    X = rng.uniform(0, np.pi, size=(n, N_FEATURES))
    theta = rng.uniform(0, 2 * np.pi, size=(n_layers, N_QUBITS, 2))
    ours = numpy_expvals(X, theta, n_layers)
    pl = make_pennylane_expvals(n_layers)(X, theta)
    diff = float(np.abs(ours - pl).max())
    print(f"max |numpy - pennylane| = {diff:.2e}")
    assert diff < 1e-8, "backends disagree!"
    print("OK: the NumPy simulator and PennyLane produce identical expectation values.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Train/evaluate the VQC (and QSVM).")
    ap.add_argument("--backend", choices=["numpy", "pennylane"], default="numpy")
    ap.add_argument("--layers", type=int, nargs="+", default=[2, 3, 4])
    ap.add_argument("--lrs", type=float, nargs="+", default=[0.01, 0.03, 0.1])
    ap.add_argument("--epochs", type=int, default=50, help="max epochs during selection (best epoch is kept)")
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--csv", type=Path, default=None)
    ap.add_argument("--tag", default="quantum")
    ap.add_argument("--skip-qsvm", action="store_true")
    ap.add_argument("--qsvm-only", action="store_true", help="skip the VQC, only (re)run the quantum-kernel SVM")
    ap.add_argument("--check-pennylane", action="store_true", help="compare NumPy and PennyLane backends")
    ap.add_argument("--self-test", action="store_true", help="check simulator + gradients against brute force")
    args = ap.parse_args()
    if args.self_test:
        self_test()
    elif args.check_pennylane:
        check_pennylane()
    else:
        run(args)
