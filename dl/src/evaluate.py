
"""Evaluate the trained ResNet18 traffic damage classification model."""

import json
from pathlib import Path

import matplotlib.pyplot as plt
import seaborn as sns
import torch
from torch import nn
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
)


# ==========================================
# 1. PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parents[1]

DATA_DIR = ROOT / "datasets" / "raw" / "Testing"
MODEL_PATH = ROOT / "models" / "best_model.pth"
RESULTS_DIR = ROOT / "results"

RESULTS_DIR.mkdir(exist_ok=True)


# ==========================================
# 2. DEVICE CONFIGURATION
# ==========================================

if torch.backends.mps.is_available():
    device = torch.device("mps")
elif torch.cuda.is_available():
    device = torch.device("cuda")
else:
    device = torch.device("cpu")

print("Evaluation device:", device)


# ==========================================
# 3. IMAGE PREPROCESSING
# ==========================================

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225],
    ),
])


# ==========================================
# 4. LOAD TEST DATASET
# ==========================================

if not DATA_DIR.is_dir():
    raise FileNotFoundError(
        f"Testing dataset not found: {DATA_DIR}"
    )

if not MODEL_PATH.is_file():
    raise FileNotFoundError(
        f"Trained model not found: {MODEL_PATH}"
    )

test_dataset = datasets.ImageFolder(
    DATA_DIR,
    transform=transform,
)

if len(test_dataset) == 0:
    raise ValueError("Testing dataset is empty.")

test_loader = DataLoader(
    test_dataset,
    batch_size=16,
    shuffle=False,
    num_workers=0,
)

print("Test images:", len(test_dataset))
print("Class mapping:", test_dataset.class_to_idx)


# ==========================================
# 5. LOAD TRAINED MODEL
# ==========================================

model = models.resnet18(weights=None)

model.fc = nn.Linear(
    model.fc.in_features,
    len(test_dataset.classes),
)

checkpoint = torch.load(
    MODEL_PATH,
    map_location=device,
    weights_only=True,
)

if "model_state_dict" not in checkpoint:
    raise KeyError(
        "Checkpoint does not contain model_state_dict."
    )

if "class_to_idx" in checkpoint:
    if checkpoint["class_to_idx"] != test_dataset.class_to_idx:
        raise ValueError(
            "Testing dataset class mapping does not match "
            "the trained model."
        )

model.load_state_dict(checkpoint["model_state_dict"])

model = model.to(device)
model.eval()

print("ResNet18 model loaded successfully.")


# ==========================================
# 6. CLASS LABELS
# ==========================================

class_name_mapping = {
    "Cracks": "Road Damage",
    "Normal": "Normal Road",
    "Pothole": "Pothole",
}

class_names = [
    class_name_mapping.get(class_name, class_name)
    for class_name in test_dataset.classes
]


# ==========================================
# 7. GENERATE PREDICTIONS
# ==========================================

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


# ==========================================
# 8. CALCULATE EVALUATION METRICS
# ==========================================

accuracy = accuracy_score(
    all_labels,
    all_predictions,
)

report = classification_report(
    all_labels,
    all_predictions,
    labels=list(range(len(class_names))),
    target_names=class_names,
    output_dict=True,
    zero_division=0,
)

print("\n========== TEST RESULTS ==========")
print(f"Test Accuracy: {accuracy * 100:.2f}%")
print("\nClassification Report:")

print(
    classification_report(
        all_labels,
        all_predictions,
        labels=list(range(len(class_names))),
        target_names=class_names,
        zero_division=0,
    )
)


# ==========================================
# 9. GENERATE CONFUSION MATRIX
# ==========================================

cm = confusion_matrix(
    all_labels,
    all_predictions,
    labels=list(range(len(class_names))),
)

plt.figure(figsize=(8, 6))

sns.heatmap(
    cm,
    annot=True,
    fmt="d",
    cmap="Blues",
    xticklabels=class_names,
    yticklabels=class_names,
)

plt.xlabel("Predicted Class")
plt.ylabel("Actual Class")
plt.title("ResNet18 Test Confusion Matrix")
plt.tight_layout()

confusion_matrix_path = RESULTS_DIR / "confusion_matrix.png"

plt.savefig(
    confusion_matrix_path,
    dpi=150,
)

plt.close()


# ==========================================
# 10. SAVE EVALUATION METRICS
# ==========================================

metrics = {
    "model": "ResNet18",
    "test_accuracy": float(accuracy),
    "classification_report": report,
    "confusion_matrix": cm.tolist(),
    "test_images": len(test_dataset),
    "class_mapping": test_dataset.class_to_idx,
}

metrics_path = RESULTS_DIR / "test_metrics.json"

with open(
    metrics_path,
    "w",
    encoding="utf-8",
) as file:
    json.dump(metrics, file, indent=4)

print("\nConfusion matrix saved:", confusion_matrix_path)
print("Metrics saved:", metrics_path)
print("\nEvaluation completed successfully.")
