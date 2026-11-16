"""Arrange the public CPRD patches as Training/Validation/Testing class folders.

train.py (MLflow-tracked training) reads ImageFolder-style data. This script
copies the CPRD patches exported by qml/src/export_patches.py into that layout,
using exactly the same grouped split as compare_models.py:

    dl/datasets/cprd_imagefolder/{Training,Validation,Testing}/{Cracks,Normal,Pothole}/*.png

Then train with MLflow:

    DL_DATA_DIR=dl/datasets/cprd_imagefolder DL_OUTPUT_DIR=dl/runs/cprd \\
    DL_RUN_NAME=ResNet18-CPRD DL_DATASET_NAME="CPRD (public)" python dl/src/train.py
"""
import argparse
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from compare_models import CLASSES, REPO_ROOT, load_split  # noqa: E402  pylint: disable=wrong-import-position

SPLIT_DIRS = {"train": "Training", "val": "Validation", "test": "Testing"}


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n", maxsplit=1)[0])
    parser.add_argument("--variant", default="cprd", choices=["cprd", "cprd_unseen_highway"])
    parser.add_argument("--out", type=Path, default=REPO_ROOT / "dl" / "datasets" / "cprd_imagefolder")
    args = parser.parse_args()

    if args.out.exists():
        shutil.rmtree(args.out)
    split = load_split(args.variant)
    for name, frame in split.items():
        for label in CLASSES:
            (args.out / SPLIT_DIRS[name] / label).mkdir(parents=True, exist_ok=True)
        for row in frame.itertuples():
            src = REPO_ROOT / row.path
            shutil.copy2(src, args.out / SPLIT_DIRS[name] / row.label / src.name)
        counts = {label: int((frame["label"] == label).sum()) for label in CLASSES}
        print(f"{SPLIT_DIRS[name]:<10} {len(frame):>4} images {counts}")
    print(f"Saved to {args.out}")


if __name__ == "__main__":
    main()
