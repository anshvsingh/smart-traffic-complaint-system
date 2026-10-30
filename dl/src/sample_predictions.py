
import random
from pathlib import Path

import torch
import torch.nn as nn
import matplotlib.pyplot as plt
from PIL import Image
from torchvision import datasets, models, transforms

# Reproducibility
random.seed(42)

# Paths
ROOT = Path(__file__).resolve().parents[1]
TEST_DIR = ROOT / "datasets" / "raw" / "Testing"
MODEL_PATH = ROOT / "models" / "best_model.pth"
RESULTS_DIR = ROOT / "results"

RESULTS_DIR.mkdir(exist_ok=True)

# Device
if torch.backends.mps.is_available():
    device = torch.device("mps")
elif torch.cuda.is_available():
    device = torch.device("cuda")
else:
    device = torch.device("cpu")

print("Prediction device:", device)

# Image preprocessing
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])

# Load test dataset
test_dataset = datasets.ImageFolder(TEST_DIR)

# Load checkpoint
checkpoint = torch.load(
    MODEL_PATH,
    map_location=device,
    weights_only=True
)

class_to_idx = checkpoint["class_to_idx"]
idx_to_class = {v: k for k, v in class_to_idx.items()}

display_names = {
    "Cracks": "Road Damage",
    "Normal": "Normal Road",
    "Pothole": "Pothole"
}

# Load model
model = models.resnet18(weights=None)
model.fc = nn.Linear(
    model.fc.in_features,
    len(class_to_idx)
)

model.load_state_dict(checkpoint["model_state_dict"])
model = model.to(device)
model.eval()

# Store predictions by actual class
correct_by_class = {
    class_index: []
    for class_index in idx_to_class
}

incorrect_samples = []

# Predict test images
with torch.inference_mode():

    for image_path, actual_label in test_dataset.samples:

        image = Image.open(image_path).convert("RGB")
        tensor = transform(image).unsqueeze(0).to(device)

        outputs = model(tensor)
        probabilities = torch.softmax(outputs, dim=1)[0]

        confidence, predicted_label = probabilities.max(dim=0)

        result = {
            "path": image_path,
            "actual": actual_label,
            "predicted": predicted_label.item(),
            "confidence": confidence.item()
        }

        if predicted_label.item() == actual_label:
            correct_by_class[actual_label].append(result)
        else:
            incorrect_samples.append(result)

# Select one correct example from each class
selected_correct = []

for class_index in sorted(correct_by_class):

    samples = correct_by_class[class_index]

    if samples:
        selected_correct.append(random.choice(samples))
    else:
        print(
            "Warning: No correct example found for",
            display_names[idx_to_class[class_index]]
        )

# Select up to three incorrect examples
random.shuffle(incorrect_samples)
selected_incorrect = incorrect_samples[:3]

selected_samples = selected_correct + selected_incorrect

if not selected_samples:
    raise RuntimeError("No test predictions were generated.")

print("Correct examples selected:", len(selected_correct))
print("Incorrect examples selected:", len(selected_incorrect))

# Create visualization
columns = 3
rows = (len(selected_samples) + columns - 1) // columns

fig, axes = plt.subplots(
    rows,
    columns,
    figsize=(16, 5 * rows)
)

axes = axes.flatten() if hasattr(axes, "flatten") else [axes]

for index, sample in enumerate(selected_samples):

    ax = axes[index]

    image = Image.open(sample["path"]).convert("RGB")

    actual_name = display_names[
        idx_to_class[sample["actual"]]
    ]

    predicted_name = display_names[
        idx_to_class[sample["predicted"]]
    ]

    is_correct = sample["actual"] == sample["predicted"]

    ax.imshow(image)
    ax.axis("off")

    status = "CORRECT" if is_correct else "INCORRECT"

    ax.set_title(
        f"{status}\n"
        f"Actual: {actual_name}\n"
        f"Predicted: {predicted_name}\n"
        f"Confidence: {sample['confidence'] * 100:.2f}%",
        fontsize=11,
        fontweight="bold"
    )

# Hide unused axes
for index in range(len(selected_samples), len(axes)):
    axes[index].axis("off")

fig.suptitle(
    "ResNet18 - Sample Test Predictions",
    fontsize=17,
    fontweight="bold"
)

plt.tight_layout()

output_path = RESULTS_DIR / "sample_predictions.png"

plt.savefig(
    output_path,
    dpi=300,
    bbox_inches="tight"
)

plt.close()

print("\nVisualization saved to:", output_path)
print("Sample prediction visualization completed.")
