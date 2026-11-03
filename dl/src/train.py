
import csv
import json
import random
from pathlib import Path

import matplotlib.pyplot as plt
import mlflow
import numpy as np
import torch
from torch import nn, optim
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms


# ==========================================
# 1. REPRODUCIBILITY
# ==========================================

SEED = 42

random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)


# ==========================================
# 2. PROJECT PATHS
# ==========================================

ROOT = Path(__file__).resolve().parents[1]

DATA_DIR = ROOT / "datasets" / "raw"
MODEL_DIR = ROOT / "models"
RESULTS_DIR = ROOT / "results"
MLFLOW_DIR = ROOT / "mlruns"

MODEL_DIR.mkdir(exist_ok=True)
RESULTS_DIR.mkdir(exist_ok=True)
MLFLOW_DIR.mkdir(exist_ok=True)


# ==========================================
# 3. MLFLOW CONFIGURATION
# ==========================================

mlflow.set_tracking_uri(MLFLOW_DIR.as_uri())
mlflow.set_experiment("Smart-Traffic-DL")

print("MLflow Tracking URI:", mlflow.get_tracking_uri())


# ==========================================
# 4. DEVICE CONFIGURATION
# ==========================================

if torch.backends.mps.is_available():
    device = torch.device("mps")
elif torch.cuda.is_available():
    device = torch.device("cuda")
else:
    device = torch.device("cpu")

print("Training device:", device)


# ==========================================
# 5. HYPERPARAMETERS
# ==========================================

BATCH_SIZE = 16
EPOCHS = 10
LEARNING_RATE = 0.0001
NUM_CLASSES = 3


# ==========================================
# 6. IMAGE TRANSFORMATIONS
# ==========================================

train_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.RandomHorizontalFlip(),
    transforms.RandomRotation(10),
    transforms.ColorJitter(
        brightness=0.15,
        contrast=0.15,
    ),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225],
    ),
])

eval_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225],
    ),
])


# ==========================================
# 7. LOAD DATASETS
# ==========================================

train_path = DATA_DIR / "Training"
val_path = DATA_DIR / "Validation"

if not train_path.is_dir() or not val_path.is_dir():
    raise FileNotFoundError(
        "Training or Validation dataset directory is missing."
    )

train_dataset = datasets.ImageFolder(
    train_path,
    transform=train_transform,
)

val_dataset = datasets.ImageFolder(
    val_path,
    transform=eval_transform,
)

print("Class mapping:", train_dataset.class_to_idx)
print("Training images:", len(train_dataset))
print("Validation images:", len(val_dataset))

if len(train_dataset) == 0 or len(val_dataset) == 0:
    raise ValueError("Training or validation dataset is empty.")

if train_dataset.class_to_idx != val_dataset.class_to_idx:
    raise ValueError("Training and validation class mappings differ.")

if len(train_dataset.classes) != NUM_CLASSES:
    raise ValueError("Dataset class count does not match NUM_CLASSES.")


# ==========================================
# 8. DATA LOADERS
# ==========================================

train_loader = DataLoader(
    train_dataset,
    batch_size=BATCH_SIZE,
    shuffle=True,
    num_workers=0,
)

val_loader = DataLoader(
    val_dataset,
    batch_size=BATCH_SIZE,
    shuffle=False,
    num_workers=0,
)


# ==========================================
# 9. LOAD RESNET18
# ==========================================

weights = models.ResNet18_Weights.DEFAULT
model = models.resnet18(weights=weights)

model.fc = nn.Linear(
    model.fc.in_features,
    NUM_CLASSES,
)

model = model.to(device)


# ==========================================
# 10. LOSS AND OPTIMIZER
# ==========================================

criterion = nn.CrossEntropyLoss()

optimizer = optim.Adam(
    model.parameters(),
    lr=LEARNING_RATE,
)

best_val_accuracy = 0.0


# ==========================================
# 11. TRAINING HISTORY
# ==========================================

history = {
    "epoch": [],
    "train_loss": [],
    "train_accuracy": [],
    "val_loss": [],
    "val_accuracy": [],
}


# ==========================================
# 12. START MLFLOW EXPERIMENT
# ==========================================

with mlflow.start_run(run_name="ResNet18-Traffic-Damage"):

    print("\nMLflow experiment started!")

    mlflow.log_params({
        "model": "ResNet18",
        "batch_size": BATCH_SIZE,
        "epochs": EPOCHS,
        "learning_rate": LEARNING_RATE,
        "optimizer": "Adam",
        "loss_function": "CrossEntropyLoss",
        "num_classes": NUM_CLASSES,
        "seed": SEED,
        "device": str(device),
        "image_size": "224x224",
        "pretrained_weights": "DEFAULT",
        "training_images": len(train_dataset),
        "validation_images": len(val_dataset),
    })

    mlflow.log_dict(
        train_dataset.class_to_idx,
        "class_mapping.json",
    )

    # ======================================
    # 13. TRAINING LOOP
    # ======================================

    for epoch in range(EPOCHS):

        model.train()

        train_loss = 0.0
        train_correct = 0
        train_total = 0

        for images, labels in train_loader:

            images = images.to(device)
            labels = labels.to(device)

            optimizer.zero_grad()

            outputs = model(images)
            loss = criterion(outputs, labels)

            loss.backward()
            optimizer.step()

            train_loss += loss.item() * images.size(0)

            predictions = outputs.argmax(dim=1)

            train_correct += (
                predictions == labels
            ).sum().item()

            train_total += labels.size(0)

        # ==================================
        # VALIDATION
        # ==================================

        model.eval()

        val_loss = 0.0
        val_correct = 0
        val_total = 0

        with torch.no_grad():

            for images, labels in val_loader:

                images = images.to(device)
                labels = labels.to(device)

                outputs = model(images)
                loss = criterion(outputs, labels)

                val_loss += loss.item() * images.size(0)

                predictions = outputs.argmax(dim=1)

                val_correct += (
                    predictions == labels
                ).sum().item()

                val_total += labels.size(0)

        # ==================================
        # CALCULATE METRICS
        # ==================================

        train_loss /= train_total
        val_loss /= val_total

        train_accuracy = 100 * train_correct / train_total
        val_accuracy = 100 * val_correct / val_total

        print(
            f"Epoch [{epoch + 1}/{EPOCHS}] "
            f"Train Loss: {train_loss:.4f} "
            f"Train Acc: {train_accuracy:.2f}% "
            f"Val Loss: {val_loss:.4f} "
            f"Val Acc: {val_accuracy:.2f}%"
        )

        # ==================================
        # SAVE TRAINING HISTORY
        # ==================================

        history["epoch"].append(epoch + 1)
        history["train_loss"].append(train_loss)
        history["train_accuracy"].append(train_accuracy)
        history["val_loss"].append(val_loss)
        history["val_accuracy"].append(val_accuracy)

        # ==================================
        # MLFLOW METRIC LOGGING
        # ==================================

        mlflow.log_metrics({
            "train_loss": train_loss,
            "train_accuracy": train_accuracy,
            "val_loss": val_loss,
            "val_accuracy": val_accuracy,
        }, step=epoch + 1)

        # ==================================
        # SAVE BEST MODEL
        # ==================================

        if val_accuracy > best_val_accuracy:

            best_val_accuracy = val_accuracy

            torch.save({
                "model_state_dict": model.state_dict(),
                "class_to_idx": train_dataset.class_to_idx,
                "best_val_accuracy": best_val_accuracy,
                "epoch": epoch + 1,
            }, MODEL_DIR / "best_model.pth")

            print("Best model saved!")

    # ======================================
    # 14. SAVE TRAINING HISTORY CSV
    # ======================================

    history_file = RESULTS_DIR / "training_history.csv"

    with open(
        history_file,
        "w",
        newline="",
        encoding="utf-8",
    ) as file:

        writer = csv.writer(file)
        writer.writerow(history.keys())

        for row in zip(*history.values()):
            writer.writerow(row)

    print("Training history saved:", history_file)

    # ======================================
    # 15. PLOT ACCURACY
    # ======================================

    plt.figure(figsize=(9, 5))

    plt.plot(
        history["epoch"],
        history["train_accuracy"],
        marker="o",
        label="Training Accuracy",
    )

    plt.plot(
        history["epoch"],
        history["val_accuracy"],
        marker="o",
        label="Validation Accuracy",
    )

    plt.title("Training and Validation Accuracy")
    plt.xlabel("Epoch")
    plt.ylabel("Accuracy (%)")
    plt.xticks(history["epoch"])
    plt.legend()
    plt.grid(True)
    plt.tight_layout()

    accuracy_path = RESULTS_DIR / "accuracy_curve.png"

    plt.savefig(accuracy_path, dpi=300)
    plt.close()

    # ======================================
    # 16. PLOT LOSS
    # ======================================

    plt.figure(figsize=(9, 5))

    plt.plot(
        history["epoch"],
        history["train_loss"],
        marker="o",
        label="Training Loss",
    )

    plt.plot(
        history["epoch"],
        history["val_loss"],
        marker="o",
        label="Validation Loss",
    )

    plt.title("Training and Validation Loss")
    plt.xlabel("Epoch")
    plt.ylabel("Loss")
    plt.xticks(history["epoch"])
    plt.legend()
    plt.grid(True)
    plt.tight_layout()

    loss_path = RESULTS_DIR / "loss_curve.png"

    plt.savefig(loss_path, dpi=300)
    plt.close()

    # ======================================
    # 17. MLFLOW ARTIFACT LOGGING
    # ======================================

    best_model_path = MODEL_DIR / "best_model.pth"

    if not best_model_path.exists():
        raise RuntimeError("Best model checkpoint was not created.")

    mlflow.log_metric(
        "best_val_accuracy",
        best_val_accuracy,
    )

    mlflow.log_artifact(
        str(best_model_path),
        artifact_path="model",
    )

    mlflow.log_artifact(
        str(history_file),
        artifact_path="training_results",
    )

    mlflow.log_artifact(
        str(accuracy_path),
        artifact_path="training_results",
    )

    mlflow.log_artifact(
        str(loss_path),
        artifact_path="training_results",
    )

    # ======================================
    # 18. SAVE EXPERIMENT SUMMARY
    # ======================================

    summary = {
        "model": "ResNet18",
        "best_validation_accuracy": best_val_accuracy,
        "epochs": EPOCHS,
        "training_images": len(train_dataset),
        "validation_images": len(val_dataset),
        "class_mapping": train_dataset.class_to_idx,
    }

    summary_path = RESULTS_DIR / "mlflow_run_summary.json"

    with open(
        summary_path,
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(summary, file, indent=4)

    mlflow.log_artifact(
        str(summary_path),
        artifact_path="training_results",
    )

    print("\nMLflow experiment logged successfully!")


# ==========================================
# 19. TRAINING COMPLETED
# ==========================================

print("\nAccuracy graph saved.")
print("Loss graph saved.")
print("\nTraining completed.")
print("Best validation accuracy:", best_val_accuracy)
