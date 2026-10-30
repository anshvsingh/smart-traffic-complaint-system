
from pathlib import Path
from collections import defaultdict
import hashlib

ROOT = Path(__file__).resolve().parents[1] / "datasets" / "raw"

for split in ["Training", "Validation", "Testing"]:
    print(f"\n--- {split} ---")

    groups = defaultdict(list)

    for path in (ROOT / split).rglob("*"):
        if path.suffix.lower() not in [".jpg", ".jpeg", ".png"]:
            continue

        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        groups[digest].append(path)

    duplicates = [
        paths for paths in groups.values()
        if len(paths) > 1
    ]

    print("Images:", sum(len(v) for v in groups.values()))
    print("Duplicate groups:", len(duplicates))

    for index, paths in enumerate(duplicates, 1):
        print(f"\nDuplicate group {index}:")
        for path in paths:
            print(" ", path.relative_to(ROOT))
