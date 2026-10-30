
from pathlib import Path
import random
import matplotlib.pyplot as plt
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATASET_DIR = PROJECT_ROOT / "datasets" / "raw"
RESULTS_DIR = PROJECT_ROOT / "results"

RESULTS_DIR.mkdir(parents=True, exist_ok=True)

classes = {
    "Cracks": "Road Damage",
    "Normal": "Normal Road",
    "Pothole": "Pothole"
}

random.seed(42)

fig, axes = plt.subplots(3, 5, figsize=(15, 9))

for row, (folder_name, display_name) in enumerate(classes.items()):

    image_folder = DATASET_DIR / "Training" / folder_name

    images = list(image_folder.glob("*.jpg"))
    selected_images = random.sample(images, 5)

    for col, image_path in enumerate(selected_images):

        image = Image.open(image_path).convert("RGB")

        axes[row, col].imshow(image)
        axes[row, col].set_title(display_name)
        axes[row, col].axis("off")

plt.suptitle(
    "Sample Images from Smart Traffic Dataset",
    fontsize=16
)

plt.tight_layout()

output_path = RESULTS_DIR / "dataset_samples.png"

plt.savefig(output_path, dpi=150, bbox_inches="tight")

print("Visualization saved to:", output_path)

plt.show()
