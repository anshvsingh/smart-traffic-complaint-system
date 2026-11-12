"""
Hybrid CNN + quantum-layer network on the actual 128x128 road patches (Cracks / Normal / Pothole).

    patch (128x128 RGB) -> resize 224, ImageNet normalisation
      -> ResNet18 (ImageNet-pretrained, torchvision)            512-d        [GPU, AMP]
      -> Linear(512 -> 4)
      -> angles = pi/2 * (tanh(z) + 1)   in [0, pi]               (same angle range as the VQC)
      -> MIDDLE LAYER on 4 numbers                                             [CPU, float32]
            quantum   : PennyLane TorchLayer, 4 qubits, RY angle encoding re-uploaded before
                        each of 3 StronglyEntanglingLayers blocks, <Z> on all 4 qubits  (36 weights)
            classical : Linear(4,4)+tanh+Linear(4,4)+tanh   (40 weights)  <- the CLASSICAL CONTROL
            identity  : nothing (bottleneck only)            (0 weights)  <- extra ablation
      -> Linear(4 -> 3) -> softmax / cross-entropy

Settings
    frozen   : backbone frozen; its 512-d features are computed ONCE on the GPU (for the 4 flip
               versions of every patch, used as augmentation) and cached; only Linear(512,4),
               the middle layer and the head are trained.
    finetune : the last ResNet block (layer4) is trained too (lr 1e-4), all other backbone
               weights frozen; BatchNorm statistics stay frozen (eval mode) in both settings.

Protocol (identical for every variant, so the middle layer is the only difference)
    * the same 1,200 patches and the same train/test split as the feature CSVs
      (qml/data/patches/<variant>/manifest.csv is row-aligned with features_<variant>.csv);
    * validation = the same 20 % group split of the TRAINING road stretches the VQC/QNN use;
    * Adam, batch 32, random horizontal/vertical flips, early stopping on validation macro F1,
      best-validation checkpoint evaluated ONCE on the test set;
    * the head learning rate (frozen setting) is picked on the validation split, per middle layer;
    * seeds: 42 is the headline run; extra seeds give mean +- std.

The quantum layer is a CLASSICAL SIMULATION (PennyLane default.qubit, backprop). No quantum
advantage is claimed: the ResNet18 does nearly all the work, which is exactly what the
classical-control ablation is there to show.

Usage
    python qml/src/qnn_hybrid.py                                   # cprd variant, both settings
    python qml/src/qnn_hybrid.py --variant cprd_unseen_highway
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from evaluation import GRAPHS_DIR, INK, METRICS_DIR, MUTED, compute_metrics, plot_confusion, save_metrics  # noqa: E402
from preprocessing import CLASSES, DATA_DIR, REPO_ROOT, SEED  # noqa: E402
from qnn_features import QuantumLayer  # noqa: E402

N_QUBITS = 4
N_CLASSES = 3
Q_LAYERS = 3
CKPT_DIR = DATA_DIR.parent / "results" / "checkpoints"     # git-ignored (fine-tuned backbones are 32 MB)
MIDDLE_COLORS = {"quantum": "#c2185b", "classical": "#7a7a7a", "identity": "#b8b8b8"}
MIDDLE_NAMES = {"quantum": "quantum layer (4 qubits)", "classical": "classical control (Linear 4-4 x2)",
                "identity": "no middle layer"}


# ============================================================================
# Data: all 1,200 patches fit in memory (1,200 x 3 x 128 x 128 uint8 = 59 MB)
# ============================================================================
def load_patches(variant):
    import pandas as pd
    import torch
    from PIL import Image

    from quantum_model import _group_val_split

    man = pd.read_csv(DATA_DIR / "patches" / variant / "manifest.csv")
    feats = pd.read_csv(DATA_DIR / f"features_{variant}.csv")
    assert (man.sample_id.values == feats.sample_id.values).all(), "manifest not row-aligned with features CSV"
    imgs = np.stack([np.asarray(Image.open(REPO_ROOT / p).convert("RGB")) for p in man.path])
    X = torch.from_numpy(imgs).permute(0, 3, 1, 2).contiguous()                  # (N,3,128,128) uint8
    y = torch.tensor(man.label.map({c: i for i, c in enumerate(CLASSES)}).to_numpy(), dtype=torch.long)
    tr = np.flatnonzero(man.split.values == "train")
    te = np.flatnonzero(man.split.values == "test")
    df_train = feats[feats.split == "train"].reset_index(drop=True)
    fit_rel, val_rel = _group_val_split(df_train)                                # same split as VQC / QNN
    return dict(X=X, y=y, fit=tr[fit_rel], val=tr[val_rel], test=te, train=tr)


MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)


def prep(xb_uint8, device):
    """uint8 (B,3,128,128) -> normalised float (B,3,224,224) on `device`."""
    import torch
    import torch.nn.functional as F
    x = xb_uint8.to(device, non_blocking=True).float().div_(255)
    x = F.interpolate(x, size=224, mode="bilinear", align_corners=False)
    m = torch.tensor(MEAN, device=device).view(1, 3, 1, 1)
    s = torch.tensor(STD, device=device).view(1, 3, 1, 1)
    return (x - m) / s


def flip(x, k):
    """k in 0..3: identity, horizontal, vertical, both (dims -1 / -2 of an image batch)."""
    if k & 1:
        x = x.flip(-1)
    if k & 2:
        x = x.flip(-2)
    return x


# ============================================================================
# Model
# ============================================================================
def make_backbone():
    import torch.nn as nn
    import torchvision
    bb = torchvision.models.resnet18(weights=torchvision.models.ResNet18_Weights.IMAGENET1K_V1)
    bb.fc = nn.Identity()
    return bb


def make_head(middle, q_layers=Q_LAYERS):
    import torch
    import torch.nn as nn

    class Head(nn.Module):
        """512-d features -> Linear(512,4) -> angles in [0,pi] -> middle -> Linear(4,3)."""

        def __init__(self):
            super().__init__()
            self.proj = nn.Linear(512, N_QUBITS)
            self.middle_kind = middle
            if middle == "quantum":
                self.middle = QuantumLayer.build(N_QUBITS, q_layers, reupload=True, encoding="ry")
            elif middle == "classical":
                self.middle = nn.Sequential(nn.Linear(N_QUBITS, N_QUBITS), nn.Tanh(),
                                            nn.Linear(N_QUBITS, N_QUBITS), nn.Tanh())
            else:
                self.middle = nn.Identity()
            self.head = nn.Linear(N_QUBITS, N_CLASSES)

        def angles(self, f):
            return (np.pi / 2) * (torch.tanh(self.proj(f.float())) + 1)

        def forward(self, f):
            a = self.angles(f)
            if self.middle_kind == "quantum":            # simulator runs on CPU in float32
                z = self.middle(a.cpu()).to(a.device)
            else:
                z = self.middle(a)
            return self.head(z)

    return Head()


def middle_params(head):
    return int(sum(p.numel() for p in head.middle.parameters()))


def trainable_params(*mods):
    return int(sum(p.numel() for m in mods for p in m.parameters() if p.requires_grad))


# ============================================================================
# Training loops
# ============================================================================
def _f1(y, p):
    from sklearn.metrics import f1_score
    return float(f1_score(y, p, average="macro"))


def _seed_all(seed):
    import random

    import torch
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def train_frozen(cache, y, idx, head, lr, max_epochs, patience, seed, device):
    """cache: (4, N, 512) features of the 4 flip versions; trains on idx['fit'], early-stops on idx['val']."""
    import torch
    import torch.nn.functional as F
    head.to(device)
    opt = torch.optim.Adam(head.parameters(), lr=lr)
    rng = np.random.default_rng(seed)
    fit, val = idx["fit"], idx["val"]
    yf, yv = y[fit].to(device), y[val]
    hist, best, best_state, bad = [], -1.0, None, 0
    for epoch in range(1, max_epochs + 1):
        head.train()
        order = rng.permutation(len(fit))
        ks = rng.integers(0, 4, size=len(fit))                       # random flip per sample
        tl, n = 0.0, 0
        for s in range(0, len(fit), 32):
            b = order[s:s + 32]
            f = cache[torch.as_tensor(ks[b]), torch.as_tensor(fit[b])].to(device)
            loss = F.cross_entropy(head(f), yf[b])
            opt.zero_grad()
            loss.backward()
            opt.step()
            tl += loss.item() * len(b)
            n += len(b)
        head.eval()
        with torch.no_grad():
            lv = head(cache[0, torch.as_tensor(val)].to(device)).cpu()
        vl = float(F.cross_entropy(lv, yv))
        vf = _f1(yv.numpy(), lv.argmax(1).numpy())
        rec = {"epoch": epoch, "train_loss": tl / n, "val_loss": vl, "val_acc": float((lv.argmax(1) == yv).float().mean()), "val_f1": vf}
        if vf > best + 1e-9:
            best, best_state, bad, rec["best"] = vf, copy.deepcopy(head.state_dict()), 0, True
        else:
            bad += 1
        hist.append(rec)
        if bad >= patience:
            break
    head.load_state_dict(best_state)
    return {"history": hist, "best_val_f1": best, "best_epoch": max(h["epoch"] for h in hist if h.get("best"))}


def train_finetune(data, backbone, head, head_lr, bb_lr, max_epochs, patience, seed, device, bs=32):
    """Fine-tune layer4 + head on raw images (AMP for the backbone), early stopping on val F1."""
    import torch
    import torch.nn.functional as F
    backbone.to(device).eval()                      # BN statistics frozen
    for p in backbone.parameters():
        p.requires_grad = False
    for p in backbone.layer4.parameters():
        p.requires_grad = True
    head.to(device)
    opt = torch.optim.Adam([{"params": head.parameters(), "lr": head_lr},
                            {"params": backbone.layer4.parameters(), "lr": bb_lr}])
    scaler = torch.amp.GradScaler("cuda", enabled=device == "cuda")
    rng = np.random.default_rng(seed)
    X, y = data["X"], data["y"]
    fit, val = data["fit"], data["val"]
    hist, best, best_state, bad = [], -1.0, None, 0
    for epoch in range(1, max_epochs + 1):
        head.train()
        order = rng.permutation(len(fit))
        tl, n = 0.0, 0
        for s in range(0, len(fit), bs):
            b = fit[order[s:s + bs]]
            x = flip(prep(X[b], device), int(rng.integers(0, 4)))
            with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=device == "cuda"):
                f = backbone(x)
            loss = F.cross_entropy(head(f.float()), y[b].to(device))
            opt.zero_grad()
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            tl += loss.item() * len(b)
            n += len(b)
        lv = predict_images(backbone, head, X, val, device).cpu()
        yv = y[val]
        vl = float(F.cross_entropy(lv, yv))
        vf = _f1(yv.numpy(), lv.argmax(1).numpy())
        rec = {"epoch": epoch, "train_loss": tl / n, "val_loss": vl, "val_acc": float((lv.argmax(1) == yv).float().mean()), "val_f1": vf}
        if vf > best + 1e-9:
            best, bad, rec["best"] = vf, 0, True
            best_state = (copy.deepcopy(head.state_dict()), copy.deepcopy(backbone.layer4.state_dict()))
        else:
            bad += 1
        hist.append(rec)
        print(f"    ep {epoch:2d} train_loss={rec['train_loss']:.3f} val_loss={vl:.3f} val_f1={vf:.3f}", flush=True)
        if bad >= patience:
            break
    head.load_state_dict(best_state[0])
    backbone.layer4.load_state_dict(best_state[1])
    return {"history": hist, "best_val_f1": best, "best_epoch": max(h["epoch"] for h in hist if h.get("best"))}


def backbone_features(backbone, X, idx, device, k=0, bs=64):
    import torch
    out = []
    with torch.no_grad(), torch.autocast(device_type="cuda", dtype=torch.float16, enabled=device == "cuda"):
        for s in range(0, len(idx), bs):
            out.append(backbone(flip(prep(X[idx[s:s + bs]], device), k)).float())
    return torch.cat(out)


def predict_images(backbone, head, X, idx, device, bs=64):
    import torch
    head.eval()
    with torch.no_grad():
        f = backbone_features(backbone, X, idx, device, bs=bs)
        return head(f)


def timed_inference(backbone, head, X, idx, device, bs=64):
    """End-to-end: uint8 patch -> prediction, incl. resize/normalise, backbone (GPU) and middle layer."""
    import torch
    predict_images(backbone, head, X, idx[:bs], device)            # warm-up
    if device == "cuda":
        torch.cuda.synchronize()
    t0 = time.perf_counter()
    logits = predict_images(backbone, head, X, idx, device, bs)
    if device == "cuda":
        torch.cuda.synchronize()
    total = time.perf_counter() - t0
    # middle layer alone on the same test batch
    with torch.no_grad():
        f = backbone_features(backbone, X, idx, device)
        a = head.angles(f)
        t1 = time.perf_counter()
        if head.middle_kind == "quantum":
            head.middle(a.cpu())
        else:
            head.middle(a)
        if device == "cuda":
            torch.cuda.synchronize()
        mid = time.perf_counter() - t1
    return logits.argmax(1).cpu().numpy(), total, mid


# ============================================================================
# Plots
# ============================================================================
def plot_curves(runs, title, path):
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 2, figsize=(10.5, 3.8))
    for mid, h in runs.items():
        c = MIDDLE_COLORS[mid]
        e = [r["epoch"] for r in h]
        ax[0].plot(e, [r["train_loss"] for r in h], color=c, label=f"{MIDDLE_NAMES[mid]} - train")
        ax[0].plot(e, [r["val_loss"] for r in h], color=c, ls="--", label="validation")
        ax[1].plot(e, [r["val_f1"] for r in h], color=c, label=MIDDLE_NAMES[mid])
    ax[0].set(title="Cross-entropy loss", xlabel="Epoch", ylabel="Loss")
    ax[1].set(title="Validation macro F1", xlabel="Epoch", ylabel="F1", ylim=(0, 1))
    for a in ax:
        a.grid(alpha=0.3)
        a.legend(fontsize=7, frameon=False)
    fig.suptitle(title, fontsize=10, x=0.01, ha="left", color=INK)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


# ============================================================================
# Experiment
# ============================================================================
def run(args):
    import torch
    torch.set_num_threads(args.threads)
    torch.backends.cudnn.benchmark = False
    torch.backends.cudnn.deterministic = True
    device = "cuda" if torch.cuda.is_available() and not args.cpu else "cpu"
    variant = args.variant
    prefix = "qnn_hybrid" + ("" if variant == "cprd" else "_unseen_highway")
    split_name = "unseen highways" if "unseen" in variant else "road stretches"
    CKPT_DIR.mkdir(parents=True, exist_ok=True)

    data = load_patches(variant)
    print(f"[hybrid] {variant}: fit {len(data['fit'])} / val {len(data['val'])} / test {len(data['test'])} "
          f"patches, device={device}", flush=True)
    gpu_name = torch.cuda.get_device_name(0) if device == "cuda" else "cpu"
    yt = data["y"][data["test"]].numpy()
    summary = {"variant": variant, "device": gpu_name, "settings": {}}

    def peak_reset():
        if device == "cuda":
            torch.cuda.empty_cache()
            torch.cuda.reset_peak_memory_stats()

    def peak():
        return float(torch.cuda.max_memory_allocated() / 2 ** 20) if device == "cuda" else 0.0

    # ------------------------------------------------------------------ frozen
    if "frozen" in args.settings:
        peak_reset()
        _seed_all(SEED)
        bb = make_backbone().to(device).eval()
        t0 = time.perf_counter()
        cache = torch.stack([backbone_features(bb, data["X"], np.arange(len(data["y"])), device, k=k).cpu()
                             for k in range(4)])                     # (4, N, 512)
        cache_time = time.perf_counter() - t0
        print(f"[frozen] cached 4 x {len(data['y'])} x 512 backbone features in {cache_time:.1f}s "
              f"(peak VRAM {peak():.0f} MiB)", flush=True)
        vram_cache = peak()
        res_setting = {"feature_cache_time_s": cache_time, "peak_vram_mib_feature_cache": vram_cache, "middles": {}}
        curves = {}
        for mid in args.middles:
            # learning rate chosen on the validation split (seed 42)
            lr_sel = {}
            for lr in args.frozen_lrs:
                _seed_all(SEED)
                h = make_head(mid)
                r = train_frozen(cache, data["y"], data, h, lr, args.frozen_epochs, args.frozen_patience, SEED, device)
                lr_sel[lr] = {"val_f1": r["best_val_f1"], "best_epoch": r["best_epoch"], "epochs_run": len(r["history"])}
                print(f"  [frozen/{mid}] lr={lr}: best val F1 {r['best_val_f1']:.3f} @ epoch {r['best_epoch']}", flush=True)
            lr = max(lr_sel, key=lambda k: lr_sel[k]["val_f1"])
            runs = {}
            for seed in args.seeds:
                _seed_all(seed)
                h = make_head(mid)
                t0 = time.perf_counter()
                r = train_frozen(cache, data["y"], data, h, lr, args.frozen_epochs, args.frozen_patience, seed, device)
                tt = time.perf_counter() - t0
                yp, it, mt = timed_inference(bb, h, data["X"], data["test"], device)
                m = compute_metrics(yt, yp, tt, it)
                runs[seed] = (m, r, h, mt)
                print(f"  [frozen/{mid}] seed {seed}: TEST acc={m['accuracy']:.3f} f1={m['f1_macro']:.3f} "
                      f"(val {r['best_val_f1']:.3f}, {tt:.1f}s)", flush=True)
            m, r, h, mt = runs[SEED]
            accs = [v[0]["accuracy"] for v in runs.values()]
            f1s = [v[0]["f1_macro"] for v in runs.values()]
            m.update({
                "model": f"hybrid_resnet18_{mid}", "setting": "frozen backbone (cached features)", "middle_layer": mid,
                "middle_layer_desc": MIDDLE_NAMES[mid], "middle_params": middle_params(h),
                "n_trainable_params": trainable_params(h), "n_qubits": N_QUBITS if mid == "quantum" else None,
                "quantum_layers": Q_LAYERS if mid == "quantum" else None, "learning_rate": lr, "lr_selection": lr_sel,
                "best_epoch": r["best_epoch"], "epochs_run": len(r["history"]), "validation_f1": r["best_val_f1"],
                "n_fit": int(len(data["fit"])), "n_val": int(len(data["val"])),
                "train_time_note": "head training on cached features (feature caching time reported separately)",
                "feature_cache_time_s": cache_time,
                "middle_layer_ms_per_sample": 1000 * mt / len(yt),
                "seeds": {str(s): {"accuracy": v[0]["accuracy"], "f1_macro": v[0]["f1_macro"],
                                   "validation_f1": v[1]["best_val_f1"]} for s, v in runs.items()},
                "accuracy_mean": float(np.mean(accs)), "accuracy_std": float(np.std(accs)),
                "f1_mean": float(np.mean(f1s)), "f1_std": float(np.std(f1s)),
                "device": f"backbone {gpu_name} (AMP fp16); middle layer CPU float32" if mid == "quantum" else gpu_name,
                "peak_vram_mib": max(vram_cache, peak()),
                "note": "quantum layer = classical state-vector simulation (PennyLane default.qubit, backprop)",
            })
            name = f"{prefix}_frozen_{mid}"
            save_metrics(name, m)
            (METRICS_DIR / f"{name}_history.json").write_text(json.dumps(r["history"], indent=2))
            (METRICS_DIR / f"{name}_weights.json").write_text(json.dumps({k: v.tolist() for k, v in h.state_dict().items()}))
            plot_confusion(m["confusion_matrix"], f"ResNet18 (frozen) + {MIDDLE_NAMES[mid]}\n{split_name}",
                           f"cm_{name}.png", cmap="RdPu" if mid == "quantum" else "Greys")
            curves[mid] = r["history"]
            res_setting["middles"][mid] = {k: m[k] for k in ("accuracy", "f1_macro", "accuracy_mean", "accuracy_std",
                                                            "f1_mean", "f1_std", "train_time_s", "inference_ms_per_sample",
                                                            "middle_params", "learning_rate")}
            if mid == "quantum":
                import pennylane as qml
                txt = qml.draw(h.middle.circuit, decimals=2, max_length=120)(
                    h.angles(cache[0, torch.as_tensor(data["test"][:1])].to(device)).detach().cpu(), h.middle.tl.weights.detach())
                (METRICS_DIR / f"{prefix}_circuit.txt").write_text(txt, encoding="utf-8")
        plot_curves(curves, f"Hybrid ResNet18 (frozen) - seed {SEED} ({split_name})",
                    GRAPHS_DIR / f"{prefix}_frozen_training_curve.png")
        summary["settings"]["frozen"] = res_setting
        del cache, bb
        peak_reset()

    # ------------------------------------------------------------------ fine-tune layer4
    if "finetune" in args.settings:
        frozen_lrs = {}
        for mid in args.middles:
            p = METRICS_DIR / f"{prefix}_frozen_{mid}.json"
            frozen_lrs[mid] = json.loads(p.read_text())["learning_rate"] if p.exists() else 0.01
        curves = {}
        res_setting = {"middles": {}}
        for mid in [m_ for m_ in args.middles if m_ in args.finetune_middles]:
            runs = {}
            for seed in args.finetune_seeds:
                peak_reset()
                _seed_all(seed)
                bb = make_backbone()
                h = make_head(mid)
                print(f"  [finetune/{mid}] seed {seed} head lr {frozen_lrs[mid]}, layer4 lr {args.bb_lr}", flush=True)
                t0 = time.perf_counter()
                r = train_finetune(data, bb, h, frozen_lrs[mid], args.bb_lr, args.ft_epochs, args.ft_patience, seed, device)
                tt = time.perf_counter() - t0
                yp, it, mt = timed_inference(bb, h, data["X"], data["test"], device)
                m = compute_metrics(yt, yp, tt, it)
                runs[seed] = (m, r, h, mt, peak(), bb if seed == SEED else None)   # keep only the headline backbone
                print(f"  [finetune/{mid}] seed {seed}: TEST acc={m['accuracy']:.3f} f1={m['f1_macro']:.3f} "
                      f"(val {r['best_val_f1']:.3f}, {tt:.0f}s, peak VRAM {peak():.0f} MiB)", flush=True)
                del bb
                if device == "cuda":
                    torch.cuda.empty_cache()
            m, r, h, mt, vram, bb = runs[SEED]
            accs = [v[0]["accuracy"] for v in runs.values()]
            f1s = [v[0]["f1_macro"] for v in runs.values()]
            m.update({
                "model": f"hybrid_resnet18_{mid}", "setting": "fine-tune layer4 (BN frozen), AMP", "middle_layer": mid,
                "middle_layer_desc": MIDDLE_NAMES[mid], "middle_params": middle_params(h),
                "n_trainable_params": trainable_params(h, bb.layer4), "n_qubits": N_QUBITS if mid == "quantum" else None,
                "quantum_layers": Q_LAYERS if mid == "quantum" else None,
                "head_learning_rate": frozen_lrs[mid], "backbone_learning_rate": args.bb_lr,
                "best_epoch": r["best_epoch"], "epochs_run": len(r["history"]), "validation_f1": r["best_val_f1"],
                "n_fit": int(len(data["fit"])), "n_val": int(len(data["val"])),
                "middle_layer_ms_per_sample": 1000 * mt / len(yt),
                "seeds": {str(s): {"accuracy": v[0]["accuracy"], "f1_macro": v[0]["f1_macro"],
                                   "validation_f1": v[1]["best_val_f1"], "train_time_s": v[0]["train_time_s"]}
                          for s, v in runs.items()},
                "accuracy_mean": float(np.mean(accs)), "accuracy_std": float(np.std(accs)),
                "f1_mean": float(np.mean(f1s)), "f1_std": float(np.std(f1s)),
                "device": f"backbone {gpu_name} (AMP fp16); middle layer CPU float32" if mid == "quantum" else gpu_name,
                "peak_vram_mib": max(v[4] for v in runs.values()),
                "note": "quantum layer = classical state-vector simulation (PennyLane default.qubit, backprop)",
            })
            name = f"{prefix}_finetune_{mid}"
            save_metrics(name, m)
            (METRICS_DIR / f"{name}_history.json").write_text(json.dumps(r["history"], indent=2))
            (METRICS_DIR / f"{name}_weights.json").write_text(json.dumps({k: v.tolist() for k, v in h.state_dict().items()}))
            torch.save({"head": h.state_dict(), "layer4": bb.layer4.state_dict()}, CKPT_DIR / f"{name}.pt")
            plot_confusion(m["confusion_matrix"], f"ResNet18 (fine-tuned layer4) + {MIDDLE_NAMES[mid]}\n{split_name}",
                           f"cm_{name}.png", cmap="RdPu" if mid == "quantum" else "Greys")
            curves[mid] = r["history"]
            res_setting["middles"][mid] = {k: m[k] for k in ("accuracy", "f1_macro", "accuracy_mean", "accuracy_std",
                                                            "f1_mean", "f1_std", "train_time_s", "inference_ms_per_sample",
                                                            "middle_params", "peak_vram_mib")}
            del runs, bb
            peak_reset()
        if curves:
            plot_curves(curves, f"Hybrid ResNet18 (fine-tune layer4) - seed {SEED} ({split_name})",
                        GRAPHS_DIR / f"{prefix}_finetune_training_curve.png")
        summary["settings"]["finetune"] = res_setting

    out = METRICS_DIR / f"{prefix}_summary.json"
    if out.exists():                                  # keep results of settings not re-run
        old = json.loads(out.read_text())
        old.get("settings", {}).update(summary["settings"])
        summary["settings"] = old.get("settings", summary["settings"])
    out.write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":       # required on Windows (spawned processes re-import this module)
    ap = argparse.ArgumentParser(description="Hybrid ResNet18 + quantum layer on the road patches.")
    ap.add_argument("--variant", default="cprd", choices=["cprd", "cprd_unseen_highway"])
    ap.add_argument("--settings", nargs="+", default=["frozen", "finetune"])
    ap.add_argument("--middles", nargs="+", default=["quantum", "classical", "identity"])
    ap.add_argument("--finetune-middles", nargs="+", default=["quantum", "classical"])
    ap.add_argument("--frozen-lrs", type=float, nargs="+", default=[0.003, 0.01, 0.03])
    ap.add_argument("--frozen-epochs", type=int, default=100)
    ap.add_argument("--frozen-patience", type=int, default=15)
    ap.add_argument("--seeds", type=int, nargs="+", default=[42, 0, 1, 2, 3])
    ap.add_argument("--finetune-seeds", type=int, nargs="+", default=[42, 0, 1])
    ap.add_argument("--bb-lr", type=float, default=1e-4)
    ap.add_argument("--ft-epochs", type=int, default=30)
    ap.add_argument("--ft-patience", type=int, default=8)
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--cpu", action="store_true")
    run(ap.parse_args())
