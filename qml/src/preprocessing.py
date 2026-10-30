"""
Dataset preparation for the QML experiment.

Classes (same folder names Arnav uses in dl/): Cracks, Normal, Pothole.
In the app these map to "Road Damage", "Normal Road" and "Pothole".

Two data sources are supported:

1. ``cprd`` (default, public): the "Cracks and Potholes in Road Images" dataset
   (Passos et al., 2020, MIT licence, https://github.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset).
   Every road photo comes with pixel masks for LANE, CRACK and POTHOLE, so we
   cut 128x128 patches from the road surface and label each patch from its
   masks. Train/test are split by ROAD SEGMENT so near-identical neighbouring
   frames never appear on both sides.

2. ``dl`` : Arnav's image folders ``dl/datasets/raw/{Training,Validation,Testing}/{Cracks,Normal,Pothole}``
   (not in git). Training + Validation -> our train set, Testing -> our test set,
   so we never train on his test images.

Either way every image (or patch) is turned into a short vector of
hand-crafted texture/colour features. A quantum circuit with 4-6 qubits cannot
take raw pixels, so this step is what makes QML possible here.

Usage:
    python qml/src/preprocessing.py --source cprd
    python qml/src/preprocessing.py --source dl --dl-root dl/datasets/raw
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image
from skimage.feature import canny, graycomatrix, graycoprops, local_binary_pattern
from skimage.filters import sobel
from sklearn.model_selection import StratifiedGroupKFold

QML_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = QML_ROOT.parent
DATA_DIR = QML_ROOT / "data"

CLASSES = ["Cracks", "Normal", "Pothole"]
DISPLAY_NAMES = {"Cracks": "Road Damage", "Normal": "Normal Road", "Pothole": "Pothole"}

SEED = 42

# Patch extraction settings (CPRD)
PATCH = 128            # patch size in original pixels
STRIDE = 64            # half-overlapping grid
FEATURE_SIZE = 128     # every patch/image is resized to this before features
MIN_LANE = 0.95        # patch must be (almost) entirely on the road
MIN_POTHOLE = 0.08     # >= 8 % pothole pixels -> Pothole
MIN_CRACK = 0.015      # >= 1.5 % crack pixels and no pothole -> Cracks
MAX_PER_IMAGE = 3      # cap patches per class per photo (stops one photo dominating)

FEATURE_NAMES = [
    "gray_mean",        # overall brightness
    "gray_std",         # contrast
    "gray_skew",        # potholes/shadows skew the histogram dark
    "dark_ratio",       # share of clearly darker-than-usual pixels
    "sobel_mean",       # average edge strength
    "sobel_std",
    "edge_density",     # share of Canny edge pixels (cracks are thin edges)
    "laplacian_var",    # sharpness / fine texture
    "glcm_contrast",    # grey-level co-occurrence texture descriptors
    "glcm_homogeneity",
    "glcm_energy",
    "glcm_correlation",
    "lbp_entropy",      # local binary pattern texture richness
    "sat_mean",         # colour saturation (wet/dirty potholes)
    "val_std",          # brightness variation in HSV
    "center_dark_diff", # centre vs border brightness (bowl-shaped holes)
]


# ----------------------------------------------------------------------------
# Feature extraction
# ----------------------------------------------------------------------------
def extract_features(rgb: np.ndarray) -> np.ndarray:
    """Return the 16 hand-crafted features for one RGB image (H, W, 3) uint8."""
    img = Image.fromarray(rgb).convert("RGB").resize((FEATURE_SIZE, FEATURE_SIZE), Image.BILINEAR)
    rgb = np.asarray(img)
    gray_u8 = np.asarray(img.convert("L"))
    gray = gray_u8.astype(np.float64) / 255.0

    mean, std = gray.mean(), gray.std() + 1e-8
    skew = float(((gray - mean) ** 3).mean() / std**3)
    dark_ratio = float((gray < mean - 1.5 * std).mean())

    grad = sobel(gray)
    edges = canny(gray, sigma=1.5)

    lap = (
        -4 * gray[1:-1, 1:-1]
        + gray[:-2, 1:-1] + gray[2:, 1:-1] + gray[1:-1, :-2] + gray[1:-1, 2:]
    )

    quant = (gray_u8 // 8).astype(np.uint8)  # 32 grey levels keeps GLCM stable
    glcm = graycomatrix(quant, distances=[1, 2], angles=[0, np.pi / 4, np.pi / 2, 3 * np.pi / 4],
                        levels=32, symmetric=True, normed=True)
    glcm_feats = [float(graycoprops(glcm, p).mean()) for p in ("contrast", "homogeneity", "energy", "correlation")]

    lbp = local_binary_pattern(gray_u8, P=8, R=1, method="uniform")
    hist, _ = np.histogram(lbp, bins=np.arange(11), density=True)
    hist = hist[hist > 0]
    lbp_entropy = float(-(hist * np.log2(hist)).sum())

    hsv = np.asarray(img.convert("HSV")).astype(np.float64) / 255.0
    sat_mean = float(hsv[..., 1].mean())
    val_std = float(hsv[..., 2].std())

    h, w = gray.shape
    centre = gray[h // 4: 3 * h // 4, w // 4: 3 * w // 4].mean()
    border_mask = np.ones_like(gray, dtype=bool)
    border_mask[h // 4: 3 * h // 4, w // 4: 3 * w // 4] = False
    centre_dark_diff = float(gray[border_mask].mean() - centre)

    return np.array(
        [mean, std, skew, dark_ratio, grad.mean(), grad.std(), edges.mean(), lap.var(),
         *glcm_feats, lbp_entropy, sat_mean, val_std, centre_dark_diff],
        dtype=np.float64,
    )


# ----------------------------------------------------------------------------
# Source 1: CPRD patches
# ----------------------------------------------------------------------------
SEGMENT_RE = re.compile(r"^\d+_([A-Z]{2}_\d+_[A-Z0-9]+(?:_\d+)?)_(\d+)$")
STRETCH_M = 500  # frames are ~5 m apart; group them into 500 m stretches of road


def road_segment(image_id: str) -> str:
    """'1007599_RS_386_386RS289112_28920' -> 'RS_386_386RS289112' (one survey video / highway section)."""
    m = SEGMENT_RE.match(image_id)
    return m.group(1) if m else image_id


def road_stretch(image_id: str) -> str:
    """'..._28920' -> 'RS_386_386RS289112#57' : the 500 m stretch of road the photo belongs to.

    Neighbouring frames (5 m apart) look almost identical, so they must stay on
    the same side of the train/test split. Grouping by 500 m stretch does that
    while still letting every highway appear in both train and test.
    """
    m = SEGMENT_RE.match(image_id)
    if not m:
        return image_id
    return f"{m.group(1)}#{int(m.group(2)) // STRETCH_M}"


def _mask(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("L")) > 127


def patches_from_image(folder: Path, rng: np.random.Generator):
    """Yield (label, patch_rgb, y, x) for one CPRD photo."""
    image_id = folder.name
    rgb = np.asarray(Image.open(folder / f"{image_id}_RAW.jpg").convert("RGB"))
    lane = _mask(folder / f"{image_id}_LANE.png")
    crack = _mask(folder / f"{image_id}_CRACK.png")
    pothole = _mask(folder / f"{image_id}_POTHOLE.png")

    h, w = lane.shape
    candidates = {c: [] for c in CLASSES}
    for y in range(0, h - PATCH + 1, STRIDE):
        for x in range(0, w - PATCH + 1, STRIDE):
            sl = (slice(y, y + PATCH), slice(x, x + PATCH))
            if lane[sl].mean() < MIN_LANE:
                continue
            p_frac, c_frac = pothole[sl].mean(), crack[sl].mean()
            if p_frac >= MIN_POTHOLE:
                candidates["Pothole"].append((y, x))
            elif p_frac == 0 and c_frac >= MIN_CRACK:
                candidates["Cracks"].append((y, x))
            elif p_frac == 0 and c_frac == 0:
                # Normal = no damage pixels in the patch *or* a margin around it,
                # so damage just outside the border does not leak in.
                y0, y1 = max(0, y - 16), min(h, y + PATCH + 16)
                x0, x1 = max(0, x - 16), min(w, x + PATCH + 16)
                if not crack[y0:y1, x0:x1].any() and not pothole[y0:y1, x0:x1].any():
                    candidates["Normal"].append((y, x))
            # anything else (a little damage, mixed) is ambiguous -> skipped

    for label, coords in candidates.items():
        if not coords:
            continue
        idx = rng.permutation(len(coords))[:MAX_PER_IMAGE]
        for i in idx:
            y, x = coords[i]
            yield label, rgb[y:y + PATCH, x:x + PATCH], y, x


def build_cprd(cprd_root: Path, per_class_train: int, per_class_test: int,
               group_by: str = "stretch") -> pd.DataFrame:
    dataset_dir = cprd_root / "Dataset"
    if not dataset_dir.exists():
        raise FileNotFoundError(
            f"{dataset_dir} not found. Clone it first:\n"
            "  git clone --depth 1 https://github.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset.git qml/data/cprd"
        )
    rng = np.random.default_rng(SEED)
    rows = []
    folders = sorted(p for p in dataset_dir.iterdir() if p.is_dir())
    for n, folder in enumerate(folders, 1):
        for label, patch, y, x in patches_from_image(folder, rng):
            rows.append({
                "sample_id": f"{folder.name}@{y}_{x}",
                "image_id": folder.name,
                "segment": road_segment(folder.name),
                "group": road_stretch(folder.name) if group_by == "stretch" else road_segment(folder.name),
                "label": label,
                **dict(zip(FEATURE_NAMES, extract_features(patch))),
            })
        if n % 250 == 0:
            print(f"  processed {n}/{len(folders)} photos, {len(rows)} candidate patches")

    pool = pd.DataFrame(rows)
    print("Candidate patches per class:\n", pool["label"].value_counts().to_string())

    # Group split: a whole group (500 m stretch, or whole highway section with
    # --group-by segment) goes to either train or test, never both.
    sgkf = StratifiedGroupKFold(n_splits=4, shuffle=True, random_state=SEED)
    train_idx, test_idx = next(sgkf.split(pool, pool["label"], groups=pool["group"]))
    pool["split"] = "train"
    pool.loc[pool.index[test_idx], "split"] = "test"
    assert not set(pool.loc[pool.split == "train", "group"]) & set(pool.loc[pool.split == "test", "group"])

    # Balanced subsample so the QML simulation stays small and classes are equal.
    parts = []
    for split, cap in (("train", per_class_train), ("test", per_class_test)):
        for label in CLASSES:
            sub = pool[(pool.split == split) & (pool.label == label)]
            parts.append(sub.sample(n=min(cap, len(sub)), random_state=SEED))
    return pd.concat(parts).reset_index(drop=True)


# ----------------------------------------------------------------------------
# Source 2: Arnav's folders
# ----------------------------------------------------------------------------
def build_dl(dl_root: Path, per_class_train: int, per_class_test: int) -> pd.DataFrame:
    rows = []
    split_map = {"Training": "train", "Validation": "train", "Testing": "test"}
    for folder_split, split in split_map.items():
        for label in CLASSES:
            folder = dl_root / folder_split / label
            if not folder.exists():
                raise FileNotFoundError(f"Missing folder {folder}")
            for path in sorted(folder.iterdir()):
                if path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                    continue
                rows.append({"sample_id": f"{folder_split}/{label}/{path.name}", "image_id": path.stem,
                             "group": path.stem, "label": label, "split": split, "path": str(path)})
    index = pd.DataFrame(rows)
    parts = []
    for split, cap in (("train", per_class_train), ("test", per_class_test)):
        for label in CLASSES:
            sub = index[(index.split == split) & (index.label == label)]
            parts.append(sub.sample(n=min(cap, len(sub)), random_state=SEED))
    index = pd.concat(parts).reset_index(drop=True)
    feats = [extract_features(np.asarray(Image.open(p).convert("RGB"))) for p in index.pop("path")]
    return pd.concat([index, pd.DataFrame(feats, columns=FEATURE_NAMES)], axis=1)


# ----------------------------------------------------------------------------
# Loading for the models
# ----------------------------------------------------------------------------
def load_features(csv_path: Path | str | None = None):
    """Return X_train, X_test, y_train, y_test (labels as ints in CLASSES order) and the frame."""
    csv_path = Path(csv_path) if csv_path else DATA_DIR / "features_cprd.csv"
    df = pd.read_csv(csv_path)
    label_to_int = {c: i for i, c in enumerate(CLASSES)}
    train, test = df[df.split == "train"], df[df.split == "test"]
    return (train[FEATURE_NAMES].to_numpy(), test[FEATURE_NAMES].to_numpy(),
            train.label.map(label_to_int).to_numpy(), test.label.map(label_to_int).to_numpy(), df)


def make_reducer(n_components: int):
    """Standardise -> PCA to `n_components` -> rescale each component to [0, pi].

    Fitted on TRAINING data only. The [0, pi] range is what angle encoding
    expects (a rotation angle per qubit). Classical models get the exact same
    reduced features in the "reduced" comparison so the comparison is fair.
    """
    from sklearn.decomposition import PCA
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import FunctionTransformer, MinMaxScaler, StandardScaler

    return Pipeline([
        ("scale", StandardScaler()),
        ("pca", PCA(n_components=n_components, random_state=SEED)),
        ("angle", MinMaxScaler(feature_range=(0.0, np.pi))),
        # test points can fall slightly outside the training range
        ("clip", FunctionTransformer(lambda a: np.clip(a, 0.0, np.pi))),
    ])


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", choices=["cprd", "dl"], default="cprd")
    parser.add_argument("--cprd-root", type=Path, default=DATA_DIR / "cprd")
    parser.add_argument("--dl-root", type=Path, default=REPO_ROOT / "dl" / "datasets" / "raw")
    parser.add_argument("--train-per-class", type=int, default=300)
    parser.add_argument("--test-per-class", type=int, default=100)
    parser.add_argument("--group-by", choices=["stretch", "segment"], default="stretch",
                        help="stretch = 500 m road stretches (default); segment = whole highway sections "
                             "(stricter 'unseen road' test, used for the robustness check)")
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    if args.source == "cprd":
        df = build_cprd(args.cprd_root, args.train_per_class, args.test_per_class, args.group_by)
    else:
        df = build_dl(args.dl_root, args.train_per_class, args.test_per_class)

    out = args.out or DATA_DIR / f"features_{args.source}.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)
    print(f"\nSaved {len(df)} samples -> {out}")
    print(df.groupby(["split", "label"]).size().unstack().to_string())
    if "group" in df and args.source == "cprd":
        for col in ("segment", "group"):
            print(f"Distinct {col}s: train", df[df.split == "train"][col].nunique(),
                  "| test", df[df.split == "test"][col].nunique())


if __name__ == "__main__":
    main()
