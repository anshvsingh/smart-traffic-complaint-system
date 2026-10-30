
from pathlib import Path
import json

import torch
import torch.nn as nn
import matplotlib.pyplot as plt
import seaborn as sns

from torchvision import datasets, transforms, models
from torch.utils.data import DataLoader

from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix
)

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "datasets" / "raw" / "Testing"
MODEL_PATH = ROOT / "models" / "best_model.pth"
RESULTS_DIR = ROOT / "results"

RESULTS_DIR.mkdir(exist_ok=True)

# Device
device = torch.device(
    "mps" if torch.backends.mps.is_available() else "cpu"
)

print("Evaluation device:", device)

# Preprocessing
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])

# Test dataset
test_dataset = datasets.ImageFolder(
    DATA_DIR,
    transform=transform
)

test_loader = DataLoader(
    test_dataset,
    batch_size=16,
    shuffle=False,
    num_workers=0
)

class_names = [
    "Road Damage",
    "Normal Road",
    "Pothole"
]

print("Test images:", len(test_dataset))
print("Class mapping:", test_dataset.class_to_idx)

# Load model
model = models.resnet18(weights=None)
model.fc = nn.Linear(model.fc.in_features, 3)

checkpoint = torch.load(
    MODEL_PATH,
    map_location=device
)

model.load_state_dict(checkpoint["model_state_dict"])
model = model.to(device)
model.eval()

# Predictions
all_predictions = []
all_labels = []

with torch.no_grad():

    for images, labels in test_loader:

        images = images.to(device)

        outputs = model(images)
        predictions = outputs.argmax(dim=1)

        all_predictions.extend(
            predictions.cpu().numpy()
        )

        all_labels.extend(labels.numpy())

# Metrics
accuracy = accuracy_score(
    all_labels,
    all_predictions
)

report = classification_report(
    all_labels,
    all_predictions,
    target_names=class_names,
    output_dict=True,
    zero_division=0
)

print("\n========== TEST RESULTS ==========")
print(f"Test Accuracy: {accuracy * 100:.2f}%")

print("\nClassification Report:")

print(
    classification_report(
        all_labels,
        all_predictions,
        target_names=class_names,
        zero_division=0
    )
)

# Confusion matrix
cm = confusion_matrix(
    all_labels,
    all_predictions
)

plt.figure(figsize=(8, 6))

sns.heatmap(
    cm,
    annot=True,
    fmt="d",
    cmap="Blues",
    xticklabels=class_names,
    yticklabels=class_names
)

plt.xlabel("Predicted Class")
plt.ylabel("Actual Class")
plt.title("ResNet18 Test Confusion Matrix")

plt.tight_layout()

plt.savefig(
    RESULTS_DIR / "confusion_matrix.png",
    dpi=150
)

plt.close()

# Save metrics
metrics = {
    "test_accuracy": float(accuracy),
    "classification_report": report,
    "confusion_matrix": cm.tolist(),
    "test_images": len(test_dataset)
}

with open(RESULTS_DIR / "test_metrics.json", "w") as file:
    json.dump(metrics, file, indent=4)

print("\nConfusion matrix saved.")
print("Metrics saved.")
