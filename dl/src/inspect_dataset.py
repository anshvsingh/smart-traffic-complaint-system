
from pathlib import Path
from collections import Counter
from PIL import Image
import csv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATASET_DIR = PROJECT_ROOT / "datasets" / "raw"
RESULTS_DIR = PROJECT_ROOT / "results"

RESULTS_DIR.mkdir(parents=True, exist_ok=True)

splits = ["Training", "Validation", "Testing"]
classes = ["Cracks", "Normal", "Pothole"]

total_images = 0
total_corrupt = 0
report = []

print("\n========== DATASET INSPECTION ==========\n")

for split in splits:
    print(f"\n--- {split} ---")

    for class_name in classes:
        folder = DATASET_DIR / split / class_name

        if not folder.exists():
            print(f"ERROR: Missing folder: {folder}")
            continue

        images = [
            p for p in folder.iterdir()
            if p.suffix.lower() in [".jpg", ".jpeg", ".png"]
        ]

        valid = 0
        corrupt = 0
        dimensions = Counter()

        for image_path in images:
            try:
                with Image.open(image_path) as img:
                    img.verify()

                with Image.open(image_path) as img:
                    dimensions[img.size] += 1

                valid += 1

            except Exception:
                corrupt += 1
                print(f"Corrupt image: {image_path.name}")

        total_images += len(images)
        total_corrupt += corrupt

        print(
            f"{class_name}: "
            f"Total={len(images)}, "
            f"Valid={valid}, "
            f"Corrupt={corrupt}"
        )

        report.append({
            "split": split,
            "class": class_name,
            "total": len(images),
            "valid": valid,
            "corrupt": corrupt,
            "dimensions": str(dimensions.most_common(5))
        })

with open(RESULTS_DIR / "dataset_inspection.csv",
          "w", newline="") as file:

    writer = csv.DictWriter(
        file,
        fieldnames=report[0].keys()
    )
    writer.writeheader()
    writer.writerows(report)

print("\n========== FINAL SUMMARY ==========")
print("Total images:", total_images)
print("Corrupted images:", total_corrupt)
print("Valid images:", total_images - total_corrupt)
print("\nReport saved to:")
print(RESULTS_DIR / "dataset_inspection.csv")
