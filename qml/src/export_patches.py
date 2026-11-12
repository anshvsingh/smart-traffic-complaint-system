"""
Export the exact CPRD patches used by the QML feature tables as PNG images.

The feature CSVs (``qml/data/features_cprd*.csv``) only store 16 hand-crafted
features per patch. The deep-learning comparison (``dl/src/compare_models.py``)
and the quantum neural nets need the pixels, so this script cuts the SAME
128x128 patches out of the CPRD photos again and saves them losslessly.
Every model then sees identical samples with an identical train/test split.

A patch is identified by its ``sample_id`` = ``<image_id>@<y>_<x>``: the photo
folder plus the top-left corner of the crop (see ``patches_from_image`` in
``preprocessing.py``).

Output (git-ignored):
    qml/data/patches/<variant>/<split>/<label>/<sanitised sample_id>.png
    qml/data/patches/<variant>/manifest.csv   (sample_id, path, label, split, group)

``path`` in the manifest is relative to the repository root.

Verification (on by default): the 16 features are recomputed from every saved
PNG with ``extract_features`` and must match the CSV, so a wrong crop or an
off-by-one can not slip through. Counts per split/label must match too.

Usage:
    python qml/src/export_patches.py            # both variants + READY marker
    python qml/src/export_patches.py --no-verify
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from preprocessing import (  # noqa: E402
    CLASSES,
    DATA_DIR,
    FEATURE_NAMES,
    PATCH,
    REPO_ROOT,
    extract_features,
)

PATCH_DIR = DATA_DIR / "patches"
VARIANTS = {
    "cprd": DATA_DIR / "features_cprd.csv",
    "cprd_unseen_highway": DATA_DIR / "features_cprd_unseen_highway.csv",
}
SAMPLE_RE = re.compile(r"^(?P<image_id>.+)@(?P<y>\d+)_(?P<x>\d+)$")


def sanitise(sample_id: str) -> str:
    """'1091633_DF_251_..._00627@192_576' -> '1091633_DF_251_..._00627__y192_x576' (file-name safe)."""
    m = SAMPLE_RE.match(sample_id)
    if not m:
        raise ValueError(f"Unexpected sample_id {sample_id!r}")
    return f"{m['image_id']}__y{m['y']}_x{m['x']}"


def crop(dataset_dir: Path, sample_id: str, cache: dict) -> np.ndarray:
    m = SAMPLE_RE.match(sample_id)
    image_id, y, x = m["image_id"], int(m["y"]), int(m["x"])
    if image_id not in cache:
        cache.clear()  # rows are grouped by image below, so one photo in memory is enough
        cache[image_id] = np.asarray(Image.open(dataset_dir / image_id / f"{image_id}_RAW.jpg").convert("RGB"))
    rgb = cache[image_id]
    patch = rgb[y:y + PATCH, x:x + PATCH]
    if patch.shape[:2] != (PATCH, PATCH):
        raise ValueError(f"{sample_id}: crop {patch.shape} out of bounds")
    return patch


def export_variant(variant: str, csv_path: Path, dataset_dir: Path, verify: bool) -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    if df["sample_id"].duplicated().any():
        raise ValueError(f"{csv_path.name}: duplicate sample_id")
    names = df["sample_id"].map(sanitise)
    if names.duplicated().any():
        raise ValueError(f"{csv_path.name}: sanitised names collide")

    out_root = PATCH_DIR / variant
    rows, max_err, cache = [], 0.0, {}
    order = df.sort_values("image_id").index  # read each photo once
    for n, i in enumerate(order, 1):
        r = df.loc[i]
        patch = crop(dataset_dir, r["sample_id"], cache)
        path = out_root / r["split"] / r["label"] / f"{names[i]}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(patch).save(path)

        if verify:
            saved = np.asarray(Image.open(path).convert("RGB"))
            if not np.array_equal(saved, patch):
                raise AssertionError(f"{path}: PNG round-trip changed pixels")
            feats = extract_features(saved)
            err = np.abs(feats - r[FEATURE_NAMES].to_numpy(dtype=np.float64)).max()
            max_err = max(max_err, float(err))
            if not np.allclose(feats, r[FEATURE_NAMES].to_numpy(dtype=np.float64), rtol=1e-6, atol=1e-8):
                raise AssertionError(f"{r['sample_id']}: features of the exported patch do not match the CSV "
                                     f"(max abs diff {err:.3g})")
        rows.append({"_order": i, "sample_id": r["sample_id"],
                     "path": path.relative_to(REPO_ROOT).as_posix(),
                     "label": r["label"], "split": r["split"], "group": r["group"]})
        if n % 300 == 0:
            print(f"  [{variant}] {n}/{len(df)} patches")

    manifest = pd.DataFrame(rows).sort_values("_order").drop(columns="_order").reset_index(drop=True)
    manifest.to_csv(out_root / "manifest.csv", index=False)

    # Count checks against the source table.
    assert len(manifest) == len(df), "row count mismatch"
    assert manifest["sample_id"].tolist() == df["sample_id"].tolist(), "row order mismatch"
    want = df.groupby(["split", "label"]).size()
    got = manifest.groupby(["split", "label"]).size()
    assert want.equals(got), f"split/label counts differ:\n{want}\n{got}"
    assert set(manifest["label"]) <= set(CLASSES)
    assert all((REPO_ROOT / p).exists() for p in manifest["path"])
    train_groups = set(manifest.loc[manifest.split == "train", "group"])
    test_groups = set(manifest.loc[manifest.split == "test", "group"])
    assert not train_groups & test_groups, "a group is on both sides of the split"

    print(f"[{variant}] saved {len(manifest)} patches -> {out_root.relative_to(REPO_ROOT).as_posix()}")
    print(got.unstack().to_string())
    if verify:
        print(f"[{variant}] feature re-check passed (max abs diff {max_err:.2e})")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cprd-root", type=Path, default=DATA_DIR / "cprd")
    parser.add_argument("--variants", nargs="+", choices=list(VARIANTS), default=list(VARIANTS))
    parser.add_argument("--no-verify", action="store_true", help="skip the feature re-computation check")
    args = parser.parse_args()

    dataset_dir = args.cprd_root / "Dataset"
    if not dataset_dir.exists():
        raise FileNotFoundError(f"{dataset_dir} not found (see qml/docs/02_dataset.md for how to get CPRD)")

    ready = PATCH_DIR / "READY"
    if ready.exists():
        ready.unlink()  # re-exporting: consumers must wait again
    for variant in args.variants:
        export_variant(variant, VARIANTS[variant], dataset_dir, verify=not args.no_verify)
    if set(args.variants) == set(VARIANTS):
        ready.touch()
        print(f"Wrote marker {ready.relative_to(REPO_ROOT).as_posix()}")


if __name__ == "__main__":
    main()
