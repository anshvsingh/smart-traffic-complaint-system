"""
Compare three CNNs for road-damage classification on identical data.

Models (see ``model_zoo.py``): ResNet18 (the model the app already uses),
EfficientNet-B0 and MobileNetV3-Large, all ImageNet-pretrained and fine-tuned.

Data: the 128x128 CPRD road patches exported by ``qml/src/export_patches.py``.
They are the exact samples and the exact train/test split the QML and
classical models in ``qml/`` use, so all numbers are on the same 300 test
patches. Two split variants:

* ``cprd``                - train/test grouped by 500 m road stretch
* ``cprd_unseen_highway`` - test patches come from highway sections never seen in training

A validation set (20 %) is held out from TRAIN only, grouped by the same
``group`` column, and is used for early stopping / checkpoint selection.
The test set is only touched once, by the selected checkpoint.

Training recipe (identical for every model, ResNet18 recipe from ``train.py``):
224x224 resize, flip / +-10 deg rotation / brightness-contrast jitter,
ImageNet normalisation, cross-entropy, Adam lr 1e-4 (constant), batch 32,
up to 30 epochs, early stopping on validation macro-F1 (patience 8).
Mixed precision (AMP) + channels_last on CUDA. The augmentation is applied
batch-wise on the GPU (``GpuAugment``), validation/test images use exactly
the ``api.py`` preprocessing.

Each (model, variant) is trained with several seeds (default 42, 43, 44).
Seed 42 is the "primary" run: its checkpoint, curves and confusion matrix are
saved; the other seeds give a mean +- std so small differences are not
over-interpreted.

Usage:
    python -u dl/src/compare_models.py                       # everything
    python -u dl/src/compare_models.py --variants cprd --seeds 42
    python -u dl/src/compare_models.py --report-only         # rebuild tables/figures
    python -u dl/src/compare_models.py --bench-only          # re-time inference from saved checkpoints
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import platform
import random
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from PIL import Image
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_recall_fscore_support
from sklearn.model_selection import StratifiedGroupKFold
from torch import nn, optim
from torch.nn import functional as F
from torch.utils.data import DataLoader, TensorDataset
from torchvision import transforms

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_zoo import MODEL_NAMES, MODEL_SPECS, build_model, count_parameters  # noqa: E402

DL_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = DL_ROOT.parent
PATCH_DIR = REPO_ROOT / "qml" / "data" / "patches"
RESULTS_DIR = DL_ROOT / "results" / "comparison"
MODEL_DIR = DL_ROOT / "models" / "comparison"
QML_METRICS = REPO_ROOT / "qml" / "results" / "metrics"

VARIANTS = ["cprd", "cprd_unseen_highway"]
VARIANT_TITLES = {
    "cprd": "CPRD, stretch-grouped split",
    "cprd_unseen_highway": "CPRD, unseen-highway split",
}
CLASSES = ["Cracks", "Normal", "Pothole"]           # same order as ImageFolder in train.py
CLASS_TO_IDX = {c: i for i, c in enumerate(CLASSES)}
DISPLAY_NAMES = {"Cracks": "Road Damage", "Normal": "Normal Road", "Pothole": "Pothole"}

PRIMARY_SEED = 42
IMAGE_SIZE = 224
MEAN, STD = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]

# train.py's training augmentation is Resize(224) -> RandomHorizontalFlip -> RandomRotation(10)
# -> ColorJitter(brightness=0.15, contrast=0.15) -> ToTensor -> Normalize. GpuAugment below applies
# the same operations to a whole batch on the GPU: per-image random parameters, nearest-neighbour
# rotation with black fill, jitter in random order, as torchvision does.
# Evaluation uses exactly the api.py / evaluate.py transform:
EVAL_TRANSFORM = transforms.Compose([
    transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=MEAN, std=STD),
])

# Plot colours: first three slots of a colour-blind-checked categorical palette,
# one fixed colour per model in every figure.
MODEL_COLORS = {"resnet18": "#2a78d6", "efficientnet_b0": "#eb6834", "mobilenet_v3_large": "#1baf7a"}
INK, INK_2, GRID, SURFACE = "#0b0b0b", "#52514e", "#e4e3df", "#fcfcfb"


# ----------------------------------------------------------------------------
# Data
# ----------------------------------------------------------------------------
def load_images(frame: pd.DataFrame) -> list[Image.Image]:
    return [Image.open(REPO_ROOT / p).convert("RGB") for p in frame["path"]]


def labels_of(frame: pd.DataFrame) -> torch.Tensor:
    return torch.as_tensor(frame["label"].map(CLASS_TO_IDX).to_numpy().copy(), dtype=torch.long)


def uint8_tensor(images) -> torch.Tensor:
    """(N, 3, 128, 128) uint8 - raw training patches, augmented later on the GPU."""
    return torch.stack([torch.from_numpy(np.asarray(im).copy()).permute(2, 0, 1) for im in images])


def eval_tensor(images) -> torch.Tensor:
    """(N, 3, 224, 224) float - preprocessed exactly like api.py."""
    return torch.stack([EVAL_TRANSFORM(im) for im in images])


class GpuAugment:
    """Batched equivalent of train.py's augmentation, run on the training device.

    Input: uint8 batch (B, 3, H, W). Output: normalised float batch (B, 3, 224, 224).
    Doing this on the GPU keeps training fast even when the CPU is busy with other jobs.
    """

    def __init__(self, device: torch.device, seed: int, degrees: float = 10.0, jitter: float = 0.15):
        self.device, self.degrees, self.jitter = device, degrees, jitter
        self.gen = torch.Generator(device=device).manual_seed(seed)
        self.mean = torch.tensor(MEAN, device=device).view(1, 3, 1, 1)
        self.std = torch.tensor(STD, device=device).view(1, 3, 1, 1)

    def _rand(self, n):
        return torch.rand(n, device=self.device, generator=self.gen)

    @staticmethod
    def _contrast(x, c):
        gray = (0.299 * x[:, 0] + 0.587 * x[:, 1] + 0.114 * x[:, 2]).mean(dim=(1, 2)).view(-1, 1, 1, 1)
        return (c * x + (1 - c) * gray).clamp(0, 1)

    def __call__(self, x_u8: torch.Tensor) -> torch.Tensor:
        b = x_u8.shape[0]
        x = x_u8.float().div_(255)
        x = F.interpolate(x, size=(IMAGE_SIZE, IMAGE_SIZE), mode="bilinear", align_corners=False)
        # RandomHorizontalFlip(p=0.5)
        x = torch.where((self._rand(b) < 0.5).view(b, 1, 1, 1), x.flip(-1), x)
        # RandomRotation(10): angle ~ U(-10, 10) deg, nearest, black fill
        a = (self._rand(b) * 2 - 1) * np.deg2rad(self.degrees)
        theta = torch.zeros(b, 2, 3, device=self.device)
        theta[:, 0, 0], theta[:, 0, 1], theta[:, 1, 0], theta[:, 1, 1] = a.cos(), -a.sin(), a.sin(), a.cos()
        grid = F.affine_grid(theta, list(x.shape), align_corners=False)
        x = F.grid_sample(x, grid, mode="nearest", padding_mode="zeros", align_corners=False)
        # ColorJitter(brightness=0.15, contrast=0.15): factors ~ U(0.85, 1.15), random order
        bf = (1 + (self._rand(b) * 2 - 1) * self.jitter).view(b, 1, 1, 1)
        cf = (1 + (self._rand(b) * 2 - 1) * self.jitter).view(b, 1, 1, 1)
        bright_first = self._contrast((x * bf).clamp(0, 1), cf)
        contrast_first = (self._contrast(x, cf) * bf).clamp(0, 1)
        x = torch.where((self._rand(b) < 0.5).view(b, 1, 1, 1), bright_first, contrast_first)
        return (x - self.mean) / self.std


def load_split(variant: str, val_fraction_folds: int = 5) -> dict:
    """Return train / val / test frames. Validation comes from TRAIN only, grouped."""
    manifest_path = PATCH_DIR / variant / "manifest.csv"
    if not manifest_path.exists():
        raise FileNotFoundError(f"{manifest_path} missing - run: python qml/src/export_patches.py")
    df = pd.read_csv(manifest_path)
    train_all = df[df.split == "train"].reset_index(drop=True)
    test = df[df.split == "test"].reset_index(drop=True)

    sgkf = StratifiedGroupKFold(n_splits=val_fraction_folds, shuffle=True, random_state=PRIMARY_SEED)
    fit_idx, val_idx = next(sgkf.split(train_all, train_all["label"], groups=train_all["group"]))
    train, val = train_all.iloc[fit_idx].reset_index(drop=True), train_all.iloc[val_idx].reset_index(drop=True)

    groups = {name: set(f["group"]) for name, f in (("train", train), ("val", val), ("test", test))}
    assert not groups["train"] & groups["val"], "train/val group overlap"
    assert not groups["train"] & groups["test"] and not groups["val"] & groups["test"], "group leaks into test"
    return {"train": train, "val": val, "test": test}


def split_summary(split: dict) -> dict:
    return {name: {"n": int(len(f)), "groups": int(f["group"].nunique()),
                   "per_class": {c: int((f["label"] == c).sum()) for c in CLASSES}}
            for name, f in split.items()}


# ----------------------------------------------------------------------------
# Training helpers
# ----------------------------------------------------------------------------
def seed_everything(seed: int):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def make_loader(dataset, batch_size, shuffle, workers, generator, device):
    """Workers only collate ready-made tensors (augmentation runs on the GPU).

    The shuffle order comes from ``generator`` in the main process, so re-seeding it
    before each run gives every model the same batch order for the same seed, even
    with persistent workers.
    """
    kwargs = dict(batch_size=batch_size, shuffle=shuffle, num_workers=workers,
                  pin_memory=device.type == "cuda", generator=generator)
    if workers > 0:
        kwargs["persistent_workers"] = True
    return DataLoader(dataset, **kwargs)


def run_epoch(model, loader, device, criterion, optimizer=None, scaler=None, amp=False, augment=None):
    """One pass over ``loader``. Trains when an optimizer is given. Returns loss, acc, macro-F1, preds."""
    training = optimizer is not None
    model.train(training)
    total_loss, preds, labels = 0.0, [], []
    with torch.set_grad_enabled(training):
        for x, y in loader:
            x = x.to(device, non_blocking=True)
            if augment is not None:
                x = augment(x)
            if device.type == "cuda":
                x = x.contiguous(memory_format=torch.channels_last)
            y = y.to(device, non_blocking=True)
            with torch.autocast(device_type=device.type, dtype=torch.float16, enabled=amp):
                out = model(x)
                loss = criterion(out, y)
            if training:
                optimizer.zero_grad(set_to_none=True)
                scaler.scale(loss).backward()
                scaler.step(optimizer)
                scaler.update()
            total_loss += loss.item() * y.size(0)
            preds.append(out.argmax(1).cpu())
            labels.append(y.cpu())
    preds, labels = torch.cat(preds).numpy(), torch.cat(labels).numpy()
    return (total_loss / len(labels), accuracy_score(labels, preds),
            f1_score(labels, preds, average="macro", zero_division=0), preds)


def test_metrics(labels, preds) -> dict:
    p, r, f, s = precision_recall_fscore_support(labels, preds, labels=range(len(CLASSES)), zero_division=0)
    pm, rm, fm, _ = precision_recall_fscore_support(labels, preds, average="macro", zero_division=0)
    return {
        "accuracy": float(accuracy_score(labels, preds)),
        "precision_macro": float(pm), "recall_macro": float(rm), "f1_macro": float(fm),
        "per_class": {c: {"precision": float(p[i]), "recall": float(r[i]), "f1": float(f[i]), "support": int(s[i])}
                      for i, c in enumerate(CLASSES)},
        "confusion_matrix": confusion_matrix(labels, preds, labels=range(len(CLASSES))).tolist(),
    }


def train_model(name, data, args, device, seed) -> dict:
    """Train one model with one seed; falls back to a smaller batch on CUDA OOM."""
    batch_size, oom_retries = args.batch_size, 0
    while True:
        try:
            return _train_model(name, data, args, device, seed, batch_size) | {"oom_retries": oom_retries}
        except torch.OutOfMemoryError:
            oom_retries += 1
            if device.type == "cuda":
                torch.cuda.empty_cache()
            if batch_size <= 4:
                raise
            batch_size //= 2
            print(f"    CUDA out of memory -> retrying {name} with batch size {batch_size}")


def _train_model(name, data, args, device, seed, batch_size) -> dict:
    seed_everything(seed)
    model = build_model(name, num_classes=len(CLASSES), pretrained=True).to(device)
    if device.type == "cuda":
        model = model.to(memory_format=torch.channels_last)
    amp = device.type == "cuda" and not args.no_amp
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=args.lr)
    scaler = torch.amp.GradScaler(device.type, enabled=amp)
    augment = GpuAugment(device, seed)
    data["shuffle_gen"].manual_seed(seed)
    train_loader = data["train_loader"]
    if train_loader.batch_size != batch_size:  # OOM fallback
        train_loader = make_loader(data["train_ds"], batch_size, True, 0, data["shuffle_gen"], device)

    if device.type == "cuda":
        torch.cuda.reset_peak_memory_stats(device)
    history, best = [], {"f1": -1.0, "loss": float("inf"), "epoch": 0, "state": None}
    bad_epochs, t0 = 0, time.perf_counter()
    for epoch in range(1, args.epochs + 1):
        te = time.perf_counter()
        tr_loss, tr_acc, tr_f1, _ = run_epoch(model, train_loader, device, criterion, optimizer, scaler, amp,
                                              augment=augment)
        va_loss, va_acc, va_f1, _ = run_epoch(model, data["val_loader"], device, criterion, amp=amp)
        history.append({"epoch": epoch, "train_loss": tr_loss, "train_accuracy": tr_acc, "train_f1_macro": tr_f1,
                        "val_loss": va_loss, "val_accuracy": va_acc, "val_f1_macro": va_f1,
                        "epoch_time_s": time.perf_counter() - te})
        improved = va_f1 > best["f1"] + 1e-9 or (abs(va_f1 - best["f1"]) <= 1e-9 and va_loss < best["loss"])
        if improved:
            best = {"f1": va_f1, "loss": va_loss, "epoch": epoch,
                    "state": {k: v.detach().cpu().clone().contiguous() for k, v in model.state_dict().items()}}
            bad_epochs = 0
        else:
            bad_epochs += 1
        print(f"    [{name} s{seed}] epoch {epoch:2d}  train loss {tr_loss:.3f} acc {tr_acc:.3f} f1 {tr_f1:.3f} | "
              f"val loss {va_loss:.3f} acc {va_acc:.3f} f1 {va_f1:.3f}{'  *' if improved else ''}")
        if bad_epochs >= args.patience:
            print(f"    early stop: no val macro-F1 gain for {args.patience} epochs")
            break
    train_time = time.perf_counter() - t0
    peak_mb = torch.cuda.max_memory_allocated(device) / 2**20 if device.type == "cuda" else None

    model.load_state_dict(best["state"])
    _, te_acc, _, test_preds = run_epoch(model, data["test_loader"], device, criterion, amp=False)  # fp32 like the API
    assert abs(te_acc - accuracy_score(data["test_labels"], test_preds)) < 1e-9, "test labels out of sync"
    result = {
        "model": name, "display_name": MODEL_SPECS[name]["display"], "seed": seed,
        "batch_size": batch_size, "epochs_run": len(history), "best_epoch": best["epoch"],
        "best_val_f1_macro": best["f1"], "best_val_loss": best["loss"],
        "train_time_s": train_time, "peak_vram_mb": peak_mb,
        "test": test_metrics(data["test_labels"], test_preds), "test_predictions": test_preds.tolist(),
        "_history": history, "_model": model.float().to(memory_format=torch.contiguous_format),
        "_state": best["state"],
    }
    print(f"    -> best epoch {best['epoch']}, val F1 {best['f1']:.3f}, test acc {result['test']['accuracy']:.3f}, "
          f"test F1 {result['test']['f1_macro']:.3f}, {train_time:.0f}s"
          + (f", peak VRAM {peak_mb:.0f} MiB" if peak_mb else ""))
    return result


# ----------------------------------------------------------------------------
# Speed benchmarks (model forward pass only, fp32, eval mode, like api.py)
# ----------------------------------------------------------------------------
@torch.inference_mode()
def bench_ms(model, x_single, x_batch, device, warmup, runs):
    model = model.to(device).eval()
    sync = torch.cuda.synchronize if device.type == "cuda" else (lambda: None)
    xs = x_single.to(device)
    for _ in range(warmup):
        model(xs)
    sync()
    times = []
    for _ in range(runs):
        t = time.perf_counter()
        model(xs)
        sync()
        times.append(time.perf_counter() - t)
    single = 1000 * float(np.median(times))

    xb = x_batch.to(device)
    model(xb)
    sync()
    t = time.perf_counter()
    for _ in range(3):
        model(xb)
    sync()
    batched = 1000 * (time.perf_counter() - t) / (3 * len(xb))
    return single, batched


def benchmark(model, test_x, device, args) -> dict:
    x_single, x_batch = test_x[:1], test_x[:64]
    out = {"cpu_threads": torch.get_num_threads(), "measured_at": time.strftime("%Y-%m-%d %H:%M:%S")}
    out["cpu_ms_per_sample"], out["cpu_ms_per_sample_batch64"] = bench_ms(
        copy.deepcopy(model).cpu(), x_single, x_batch, torch.device("cpu"), warmup=5, runs=args.cpu_runs)
    if device.type == "cuda":
        out["gpu_ms_per_sample"], out["gpu_ms_per_sample_batch64"] = bench_ms(
            copy.deepcopy(model), x_single, x_batch, device, warmup=20, runs=100)
    return out


# ----------------------------------------------------------------------------
# Experiment
# ----------------------------------------------------------------------------
def mcnemar(labels, a, b) -> dict:
    """Exact McNemar test: do two models make significantly different errors on the same test set?"""
    from scipy.stats import binomtest
    a_ok, b_ok = np.asarray(a) == labels, np.asarray(b) == labels
    n01, n10 = int((a_ok & ~b_ok).sum()), int((~a_ok & b_ok).sum())
    p = 1.0 if n01 + n10 == 0 else float(binomtest(n01, n01 + n10, 0.5).pvalue)
    return {"a_right_b_wrong": n01, "a_wrong_b_right": n10, "p_value": p}


def run_variant(variant, args, device) -> dict:
    print(f"\n=== Variant {variant} ===")
    split = load_split(variant)
    summary = split_summary(split)
    print("  split:", {k: (v["n"], v["groups"]) for k, v in summary.items()}, "(samples, groups)")
    imgs = {k: load_images(split[k]) for k in ("train", "val", "test")}
    data = {"train_ds": TensorDataset(uint8_tensor(imgs["train"]), labels_of(split["train"])),
            "val_ds": TensorDataset(eval_tensor(imgs["val"]), labels_of(split["val"])),
            "test_ds": TensorDataset(eval_tensor(imgs["test"]), labels_of(split["test"])),
            "shuffle_gen": torch.Generator().manual_seed(PRIMARY_SEED)}
    # Own copy of the labels: a .numpy() view of the dataset tensor would dangle once the DataLoader
    # workers move that tensor's storage into shared memory (Windows spawn).
    data["test_x"], data["test_labels"] = data["test_ds"].tensors[0], labels_of(split["test"]).numpy().copy()
    data["train_loader"] = make_loader(data["train_ds"], args.batch_size, True, args.workers,
                                       data["shuffle_gen"], device)
    # Eval tensors are already preprocessed in memory, so worker processes would only add copying.
    data["val_loader"] = make_loader(data["val_ds"], 64, False, 0, None, device)
    data["test_loader"] = make_loader(data["test_ds"], 64, False, 0, None, device)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    models_out = {}
    for name in args.models:
        runs = []
        for seed in args.seeds:
            print(f"  -- {MODEL_SPECS[name]['display']} | seed {seed}")
            res = train_model(name, data, args, device, seed)
            if seed == args.seeds[0]:
                pd.DataFrame(res["_history"]).to_csv(RESULTS_DIR / f"history_{name}_{variant}.csv", index=False)
                ckpt_path = MODEL_DIR / f"{name}_{variant}.pth"
                torch.save({"model_state_dict": res["_state"], "class_to_idx": CLASS_TO_IDX, "arch": name,
                            "variant": variant, "seed": seed, "epoch": res["best_epoch"],
                            "best_val_f1_macro": res["best_val_f1_macro"], "image_size": IMAGE_SIZE,
                            "normalize_mean": MEAN, "normalize_std": STD}, ckpt_path)
                res["checkpoint"] = ckpt_path.relative_to(REPO_ROOT).as_posix()
                res["checkpoint_mb"] = os.path.getsize(ckpt_path) / 2**20
                res["params"] = count_parameters(res["_model"])
                res["params_m"] = res["params"] / 1e6
                if not args.no_bench:
                    res["speed"] = benchmark(res["_model"], data["test_x"], device, args)
                    print(f"    speed: {res['speed']}")
            res["history"] = res.pop("_history")
            del res["_model"], res["_state"]
            runs.append(res)
            if device.type == "cuda":
                torch.cuda.empty_cache()  # GPU is shared with the QNN experiments
        primary = runs[0]
        agg = {}
        for key in ("accuracy", "f1_macro", "precision_macro", "recall_macro"):
            vals = [r["test"][key] for r in runs]
            agg[key] = {"mean": float(np.mean(vals)), "std": float(np.std(vals, ddof=1)) if len(vals) > 1 else 0.0,
                        "values": vals}
        agg["train_time_s"] = {"mean": float(np.mean([r["train_time_s"] for r in runs]))}
        models_out[name] = {**{k: v for k, v in primary.items() if k != "history"},
                            "history": primary["history"], "seed_runs": [
                                {"seed": r["seed"], "test": {k: r["test"][k] for k in
                                                             ("accuracy", "precision_macro", "recall_macro",
                                                              "f1_macro")},
                                 "per_class_f1": {c: r["test"]["per_class"][c]["f1"] for c in CLASSES},
                                 "best_epoch": r["best_epoch"], "epochs_run": r["epochs_run"],
                                 "train_time_s": r["train_time_s"], "peak_vram_mb": r["peak_vram_mb"],
                                 "batch_size": r["batch_size"]} for r in runs],
                            "across_seeds": agg}

    names = list(models_out)
    pairwise = {f"{a}_vs_{b}": mcnemar(data["test_labels"], models_out[a]["test_predictions"],
                                       models_out[b]["test_predictions"])
                for i, a in enumerate(names) for b in names[i + 1:]}
    del data
    return {
        "variant": variant, "title": VARIANT_TITLES[variant],
        "data": {"manifest": f"qml/data/patches/{variant}/manifest.csv", "split": summary,
                 "validation": "20% of TRAIN, StratifiedGroupKFold(5) by group, seed 42; test never used for selection"},
        "recipe": {"image_size": IMAGE_SIZE,
                   "augmentation": "Resize 224, HFlip, Rotation 10, ColorJitter(0.15, 0.15) (batched on GPU)",
                   "normalisation": "ImageNet mean/std", "optimizer": "Adam", "lr": args.lr, "lr_schedule": "constant",
                   "loss": "CrossEntropyLoss", "batch_size": args.batch_size, "max_epochs": args.epochs,
                   "early_stopping": f"val macro-F1, patience {args.patience}", "selection": "best val macro-F1",
                   "seeds": args.seeds, "primary_seed": args.seeds[0],
                   "amp": device.type == "cuda" and not args.no_amp,
                   "channels_last": device.type == "cuda", "pretrained": "ImageNet (torchvision DEFAULT weights)"},
        "environment": {"device": str(device),
                        "gpu": torch.cuda.get_device_name(0) if device.type == "cuda" else None,
                        "torch": torch.__version__, "python": platform.python_version(),
                        "cpu": platform.processor(), "cpu_threads": torch.get_num_threads()},
        "timing_note": ("train_time_s = wall time of the training loop incl. per-epoch validation (GPU, AMP). "
                        "Inference = model forward pass only (no image decoding/resizing), fp32, eval mode, "
                        "median of single-image runs (batch 1, as in the API); *_batch64 = per-sample time in a "
                        "batch of 64. The GPU was shared with other experiments, so GPU timings are indicative."),
        "models": models_out,
        "pairwise_mcnemar_primary_seed": pairwise,
    }


# ----------------------------------------------------------------------------
# Reporting
# ----------------------------------------------------------------------------
QML_FILES = [  # (file stem, label, module/type)
    ("classical_logistic_regression_full", "Logistic Regression (16 features)", "Classical ML (qml/)"),
    ("classical_svm_rbf_full", "SVM, RBF (16 features)", "Classical ML (qml/)"),
    ("classical_random_forest_full", "Random Forest (16 features)", "Classical ML (qml/)"),
    ("classical_logistic_regression_reduced", "Logistic Regression (8 PCA features)", "Classical ML (qml/)"),
    ("classical_svm_rbf_reduced", "SVM, RBF (8 PCA features)", "Classical ML (qml/)"),
    ("classical_random_forest_reduced", "Random Forest (8 PCA features)", "Classical ML (qml/)"),
    ("quantum_vqc", "VQC, 4 qubits (8 PCA features)", "Quantum ML, simulated (qml/)"),
    ("quantum_qsvm", "QSVM, quantum kernel, 4 qubits (8 PCA features)", "Quantum ML, simulated (qml/)"),
]


def load_qml_rows(variant) -> list[dict]:
    rows = []
    for stem, label, kind in QML_FILES:
        if variant == "cprd":
            f = QML_METRICS / f"{stem}.json"
        else:
            f = QML_METRICS / f"unseen_highway_{stem.replace('quantum_', '')}.json"
        if not f.exists():
            continue
        d = json.loads(f.read_text())
        rows.append({"label": label, "kind": kind, "accuracy": d["accuracy"], "precision_macro": d["precision_macro"],
                     "recall_macro": d["recall_macro"], "f1_macro": d["f1_macro"],
                     "train_time_s": d.get("train_time_s"), "infer_ms": d.get("inference_ms_per_sample"),
                     "n_test": d.get("n_test"), "source": f.relative_to(REPO_ROOT).as_posix()})
    return rows


def _style(ax):
    ax.set_facecolor(SURFACE)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(INK_2)
    ax.tick_params(colors=INK_2, labelsize=9)
    ax.yaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def make_figures(m: dict):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.ticker  # noqa: F401
    import seaborn as sns

    variant, models = m["variant"], m["models"]
    names = list(models)
    labels = [DISPLAY_NAMES[c] for c in CLASSES]

    # Confusion matrices (primary seed)
    fig, axes = plt.subplots(1, len(names), figsize=(5.2 * len(names), 4.6), facecolor=SURFACE)
    for ax, n in zip(np.atleast_1d(axes), names):
        cm = np.array(models[n]["test"]["confusion_matrix"])
        sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", cbar=False, ax=ax, vmin=0, vmax=100,
                    xticklabels=labels, yticklabels=labels, annot_kws={"size": 12})
        ax.set_title(f"{models[n]['display_name']}\nacc {models[n]['test']['accuracy']:.3f} | "
                     f"macro-F1 {models[n]['test']['f1_macro']:.3f}", color=INK, fontsize=11)
        ax.set_xlabel("Predicted class", color=INK_2)
        ax.set_ylabel("Actual class", color=INK_2)
    fig.suptitle(f"Test confusion matrices - {m['title']} (300 patches, seed {m['recipe']['primary_seed']})",
                 color=INK, fontsize=12)
    fig.tight_layout()
    fig.savefig(RESULTS_DIR / f"confusion_matrices_{variant}.png", dpi=150, facecolor=SURFACE)
    plt.close(fig)

    # Training curves (primary seed): train dashed, validation solid
    fig, axes = plt.subplots(1, 3, figsize=(16, 4.6), facecolor=SURFACE)
    for ax, (key, title) in zip(axes, [("loss", "Cross-entropy loss"), ("accuracy", "Accuracy"),
                                       ("f1_macro", "Macro-F1")]):
        _style(ax)
        for n in names:
            h = pd.DataFrame(models[n]["history"])
            c = MODEL_COLORS[n]
            ax.plot(h["epoch"], h[f"train_{key}"], color=c, lw=1.5, ls="--", alpha=0.8)
            ax.plot(h["epoch"], h[f"val_{key}"], color=c, lw=2, label=models[n]["display_name"])
            be = models[n]["best_epoch"]
            ax.plot(be, h.loc[h.epoch == be, f"val_{key}"].iloc[0], "o", ms=8, color=c,
                    markeredgecolor=SURFACE, markeredgewidth=2)
        ax.set_title(title, color=INK, fontsize=11)
        ax.set_xlabel("Epoch", color=INK_2)
        ax.xaxis.set_major_locator(matplotlib.ticker.MaxNLocator(integer=True))
    handles, lbls = axes[0].get_legend_handles_labels()
    from matplotlib.lines import Line2D
    handles += [Line2D([], [], color=INK_2, lw=2), Line2D([], [], color=INK_2, lw=1.5, ls="--"),
                Line2D([], [], color=INK_2, marker="o", ls="", ms=8)]
    lbls += ["validation", "train", "selected epoch"]
    fig.legend(handles, lbls, loc="lower center", ncol=6, frameon=False, fontsize=9, labelcolor=INK)
    fig.suptitle(f"Training curves - {m['title']} (seed {m['recipe']['primary_seed']})", color=INK, fontsize=12)
    fig.tight_layout(rect=(0, 0.07, 1, 1))
    fig.savefig(RESULTS_DIR / f"training_curves_{variant}.png", dpi=150, facecolor=SURFACE)
    plt.close(fig)

    # Bar chart: quality (mean +- std over seeds), CPU latency, size. Separate panels, no dual axis.
    fig, axes = plt.subplots(1, 3, figsize=(16, 4.8), facecolor=SURFACE,
                             gridspec_kw={"width_ratios": [2.2, 1, 1]})
    metrics = [("accuracy", "Accuracy"), ("f1_macro", "Macro-F1")] + \
              [(f"f1_{c}", f"F1 {DISPLAY_NAMES[c]}") for c in CLASSES]
    width = 0.8 / len(names)
    ax = axes[0]
    _style(ax)
    for j, n in enumerate(names):
        mm = models[n]
        vals, errs = [], []
        for key, _ in metrics:
            if key.startswith("f1_") and key != "f1_macro":
                per = [r["per_class_f1"][key[3:]] for r in mm["seed_runs"]]
            else:
                per = mm["across_seeds"][key]["values"]
            vals.append(np.mean(per))
            errs.append(np.std(per, ddof=1) if len(per) > 1 else 0)
        xs = np.arange(len(metrics)) + (j - (len(names) - 1) / 2) * width
        ax.bar(xs, vals, width * 0.92, yerr=errs, color=MODEL_COLORS[n], label=mm["display_name"],
               error_kw={"ecolor": INK_2, "elinewidth": 1, "capsize": 2})
    ax.set_xticks(np.arange(len(metrics)), [t for _, t in metrics], color=INK_2)
    ax.set_ylim(0, 1)
    nseeds = len(models[names[0]]["seed_runs"])
    ax.set_title(f"Test quality (mean of {nseeds} seeds, error bar = std)", color=INK, fontsize=11)
    ax.set_ylim(0, 1.12)
    ax.legend(frameon=False, fontsize=9, loc="upper center", ncol=len(names), labelcolor=INK)

    for ax, key, title, unit in [(axes[1], "cpu", "CPU inference, batch 1", "ms / image"),
                                 (axes[2], "size", "Model size (fp32 checkpoint)", "MiB")]:
        _style(ax)
        vals = [models[n].get("speed", {}).get("cpu_ms_per_sample", np.nan) if key == "cpu"
                else models[n]["checkpoint_mb"] for n in names]
        bars = ax.bar(range(len(names)), vals, 0.6, color=[MODEL_COLORS[n] for n in names])
        for b, v in zip(bars, vals):
            ax.annotate(f"{v:.1f}", (b.get_x() + b.get_width() / 2, v), ha="center", va="bottom",
                        fontsize=9, color=INK, xytext=(0, 2), textcoords="offset points")
        ax.set_xticks(range(len(names)), [models[n]["display_name"] for n in names], color=INK_2, fontsize=8)
        ax.set_title(title, color=INK, fontsize=11)
        ax.set_ylabel(unit, color=INK_2)
    fig.suptitle(f"Model comparison - {m['title']}", color=INK, fontsize=12)
    fig.tight_layout()
    fig.savefig(RESULTS_DIR / f"comparison_bars_{variant}.png", dpi=150, facecolor=SURFACE)
    plt.close(fig)


def _f(x, nd=3):
    return "-" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:.{nd}f}"


def make_markdown(m: dict) -> str:
    variant, models = m["variant"], m["models"]
    names = list(models)
    seeds = m["recipe"]["seeds"]
    s = m["data"]["split"]
    out = [f"# DL model comparison - {m['title']}", "",
           f"Data: `{m['data']['manifest']}` (exported by `qml/src/export_patches.py`). "
           f"Train {s['train']['n']} / validation {s['val']['n']} / test {s['test']['n']} patches "
           f"({s['train']['groups']} / {s['val']['groups']} / {s['test']['groups']} road groups). "
           f"Validation is taken from the training split only; the test set is the same 300 patches the "
           f"`qml/` models are scored on.", "",
           f"Recipe (all models): {m['recipe']['augmentation']}, {m['recipe']['optimizer']} lr {m['recipe']['lr']} "
           f"({m['recipe']['lr_schedule']}), batch {m['recipe']['batch_size']}, max {m['recipe']['max_epochs']} "
           f"epochs, early stopping on {m['recipe']['early_stopping']}, AMP {m['recipe']['amp']}. "
           f"Device: {m['environment']['gpu'] or m['environment']['device']}.", "",
           f"## Test results, primary seed {seeds[0]} (saved checkpoints)", "",
           "| Model | Accuracy | Precision (macro) | Recall (macro) | F1 (macro) | F1 Road Damage | F1 Normal Road | "
           "F1 Pothole | Best epoch / run |",
           "|---|---|---|---|---|---|---|---|---|"]
    for n in names:
        t = models[n]["test"]
        out.append(f"| {models[n]['display_name']} | {_f(t['accuracy'])} | {_f(t['precision_macro'])} | "
                   f"{_f(t['recall_macro'])} | {_f(t['f1_macro'])} | "
                   + " | ".join(_f(t["per_class"][c]["f1"]) for c in CLASSES)
                   + f" | {models[n]['best_epoch']} / {models[n]['epochs_run']} |")
    if len(seeds) > 1:
        out += ["", f"## Across seeds {', '.join(map(str, seeds))} (mean +- std)", "",
                "| Model | Accuracy | F1 (macro) | Per-seed macro-F1 | Mean train time (s) |", "|---|---|---|---|---|"]
        for n in names:
            a = models[n]["across_seeds"]
            out.append(f"| {models[n]['display_name']} | {a['accuracy']['mean']:.3f} +- {a['accuracy']['std']:.3f} | "
                       f"{a['f1_macro']['mean']:.3f} +- {a['f1_macro']['std']:.3f} | "
                       + ", ".join(f"{v:.3f}" for v in a["f1_macro"]["values"])
                       + f" | {a['train_time_s']['mean']:.0f} |")
    out += ["", "## Size and speed (primary seed)", "",
            "| Model | Params (M) | Checkpoint (MiB) | Train time (s) | Epochs | Batch | Peak VRAM (MiB) | "
            "CPU ms/img (bs 1) | CPU ms/img (bs 64) | GPU ms/img (bs 1) | GPU ms/img (bs 64) |",
            "|---|---|---|---|---|---|---|---|---|---|---|"]
    for n in names:
        mm, sp = models[n], models[n].get("speed", {})
        out.append(f"| {mm['display_name']} | {mm['params_m']:.2f} | {mm['checkpoint_mb']:.1f} | "
                   f"{mm['train_time_s']:.0f} | {mm['epochs_run']} | {mm['batch_size']} | "
                   f"{_f(mm['peak_vram_mb'], 0)} | {_f(sp.get('cpu_ms_per_sample'), 1)} | "
                   f"{_f(sp.get('cpu_ms_per_sample_batch64'), 1)} | {_f(sp.get('gpu_ms_per_sample'), 2)} | "
                   f"{_f(sp.get('gpu_ms_per_sample_batch64'), 2)} |")
    out += ["", m["timing_note"], "", "## Are the differences significant? (exact McNemar test, primary seed)", "",
            "| Pair | only first right | only second right | p-value |", "|---|---|---|---|"]
    for k, v in m["pairwise_mcnemar_primary_seed"].items():
        a, b = k.split("_vs_")
        out.append(f"| {MODEL_SPECS[a]['display']} vs {MODEL_SPECS[b]['display']} | {v['a_right_b_wrong']} | "
                   f"{v['a_wrong_b_right']} | {v['p_value']:.3f} |")

    qml_rows = load_qml_rows(variant)
    if qml_rows:
        out += ["", "## All modules on the same 300 test patches", "",
                "DL rows: this module (`dl/`), primary seed, CNN on raw pixels. Other rows are copied from "
                "`qml/results/metrics/` (hand-crafted 16 texture/colour features, or 8 PCA features for QML). "
                "Inference time for the `qml/` rows excludes feature extraction and is per sample in a batch; "
                "DL inference is single-image CPU time. Times are not directly comparable across modules.", "",
                "| Model | Module / type | Accuracy | Precision (macro) | Recall (macro) | F1 (macro) | "
                "Train time (s) | Inference (ms/sample) |", "|---|---|---|---|---|---|---|---|"]
        rows = [{"label": models[n]["display_name"], "kind": "Deep learning, CNN (dl/)", **models[n]["test"],
                 "train_time_s": models[n]["train_time_s"],
                 "infer_ms": models[n].get("speed", {}).get("cpu_ms_per_sample")} for n in names] + qml_rows
        for r in sorted(rows, key=lambda r: -r["f1_macro"]):
            out.append(f"| {r['label']} | {r['kind']} | {_f(r['accuracy'])} | {_f(r['precision_macro'])} | "
                       f"{_f(r['recall_macro'])} | {_f(r['f1_macro'])} | {_f(r['train_time_s'], 2)} | "
                       f"{_f(r['infer_ms'], 3)} |")
    out += ["", "## Figures", "", f"![Confusion matrices](confusion_matrices_{variant}.png)", "",
            f"![Training curves](training_curves_{variant}.png)", "",
            f"![Comparison](comparison_bars_{variant}.png)", ""]
    return "\n".join(out)


def rebench(variants, args, rounds: int = 5):
    """Re-measure inference speed from the saved checkpoints, more robustly than during training.

    Speed depends only on the architecture (not on the trained weights or the split), so each
    architecture is timed once and the result is written into every variant's metrics file.
    The models are interleaved over ``rounds`` rounds, so a background burst of CPU load hits all
    of them; reported value = median of the per-round medians, plus the min-max of the rounds.
    """
    from model_zoo import load_checkpoint

    device = torch.device("cuda" if torch.cuda.is_available() and not args.cpu else "cpu")
    metrics = {v: json.loads((RESULTS_DIR / f"metrics_{v}.json").read_text()) for v in variants}
    first = metrics[variants[0]]
    test_x = eval_tensor(load_images(load_split(variants[0])["test"]))
    models = {n: load_checkpoint(REPO_ROOT / mm["checkpoint"], device="cpu")[0] for n, mm in first["models"].items()}
    keys = ["cpu_ms_per_sample", "cpu_ms_per_sample_batch64"] + \
           (["gpu_ms_per_sample", "gpu_ms_per_sample_batch64"] if device.type == "cuda" else [])
    raw = {n: {k: [] for k in keys} for n in models}
    for r in range(rounds):
        for n, model in models.items():
            s = benchmark(model, test_x, device, args)
            for k in keys:
                raw[n][k].append(s[k])
            if device.type == "cuda":
                torch.cuda.empty_cache()
        print(f"  round {r + 1}/{rounds}: " + ", ".join(f"{n} {raw[n]['cpu_ms_per_sample'][-1]:.1f} ms" for n in models))
    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    for n in models:
        speed = {"cpu_threads": torch.get_num_threads(), "measured_at": stamp, "rounds": rounds,
                 "runs_per_round_cpu": args.cpu_runs, "method": "median of per-round medians (models interleaved)"}
        for k in keys:
            speed[k] = float(np.median(raw[n][k]))
            speed[k + "_range"] = [float(min(raw[n][k])), float(max(raw[n][k]))]
        print(f"  {n}: " + ", ".join(f"{k} {speed[k]:.2f}" for k in keys))
        for v in variants:
            metrics[v]["models"][n]["speed"] = speed
    for v in variants:
        metrics[v]["timing_note"] = (
            "train_time_s = wall time of the training loop incl. per-epoch validation (GPU, AMP); the GPU and "
            "CPU were shared with the QNN experiments during training, so train times are indicative only. "
            f"Inference was re-measured on {stamp} with the machine otherwise idle (`--bench-only`): model forward "
            "pass only (no image decoding/resizing), fp32, eval mode, batch 1 as in the API (bs 64 = per-image "
            f"time inside a batch of 64); median over {rounds} interleaved rounds of {args.cpu_runs} CPU / 100 GPU "
            f"runs, {torch.get_num_threads()} CPU threads. Speed depends only on the architecture, so the same "
            "numbers are reported for both split variants.")
        (RESULTS_DIR / f"metrics_{v}.json").write_text(json.dumps(metrics[v], indent=2), encoding="utf-8")


def write_report(variant):
    m = json.loads((RESULTS_DIR / f"metrics_{variant}.json").read_text())
    make_figures(m)
    (RESULTS_DIR / f"comparison_{variant}.md").write_text(make_markdown(m), encoding="utf-8")
    print(f"  report written: dl/results/comparison/comparison_{variant}.md (+ figures)")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--variants", nargs="+", choices=VARIANTS, default=VARIANTS)
    parser.add_argument("--models", nargs="+", choices=MODEL_NAMES, default=MODEL_NAMES)
    parser.add_argument("--seeds", nargs="+", type=int, default=[42, 43, 44],
                        help="first seed is the primary run (checkpoint, curves, confusion matrix)")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--patience", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--cpu-runs", type=int, default=30, help="single-image CPU timing repetitions")
    parser.add_argument("--no-amp", action="store_true")
    parser.add_argument("--no-bench", action="store_true")
    parser.add_argument("--cpu", action="store_true", help="force CPU training")
    parser.add_argument("--report-only", action="store_true", help="rebuild markdown/figures from saved metrics")
    parser.add_argument("--bench-only", action="store_true",
                        help="re-measure inference speed from saved checkpoints, then rebuild the report")
    args = parser.parse_args()

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    if args.bench_only:
        rebench(args.variants, args)
        for variant in args.variants:
            write_report(variant)
    elif not args.report_only:
        device = torch.device("cuda" if torch.cuda.is_available() and not args.cpu else "cpu")
        print("Device:", device, "|", torch.cuda.get_device_name(0) if device.type == "cuda" else platform.processor())
        if device.type == "cuda":
            torch.backends.cudnn.benchmark = False
            torch.backends.cudnn.deterministic = True
        for variant in args.variants:
            m = run_variant(variant, args, device)
            path = RESULTS_DIR / f"metrics_{variant}.json"
            path.write_text(json.dumps(m, indent=2), encoding="utf-8")
            print(f"  metrics saved: {path.relative_to(REPO_ROOT).as_posix()}")
            write_report(variant)
    else:
        for variant in args.variants:
            write_report(variant)


if __name__ == "__main__":
    main()
