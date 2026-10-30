
import random
import csv
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
import matplotlib.pyplot as plt

from torchvision import datasets, transforms, models
from torch.utils.data import DataLoader

# Reproducibility
SEED = 42
random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)

# Paths
ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "datasets" / "raw"
MODEL_DIR = ROOT / "models"
RESULTS_DIR = ROOT / "results"

MODEL_DIR.mkdir(exist_ok=True)
RESULTS_DIR.mkdir(exist_ok=True)

# Device
if torch.backends.mps.is_available():
    device = torch.device("mps")
elif torch.cuda.is_available():
    device = torch.device("cuda")
else:
    device = torch.device("cpu")

print("Training device:", device)

# Configuration
BATCH_SIZE = 16
EPOCHS = 10
LEARNING_RATE = 0.0001
NUM_CLASSES = 3

# Image transformations
train_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.RandomHorizontalFlip(),
    transforms.RandomRotation(10),
    transforms.ColorJitter(
        brightness=0.15,
        contrast=0.15
    ),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])

eval_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])

# Datasets
train_dataset = datasets.ImageFolder(
    DATA_DIR / "Training",
    transform=train_transform
)

val_dataset = datasets.ImageFolder(
    DATA_DIR / "Validation",
    transform=eval_transform
)

print("Class mapping:", train_dataset.class_to_idx)
print("Training images:", len(train_dataset))
print("Validation images:", len(val_dataset))

assert train_dataset.class_to_idx == val_dataset.class_to_idx

# Data loaders
train_loader = DataLoader(
    train_dataset,
    batch_size=BATCH_SIZE,
    shuffle=True,
    num_workers=0
)

val_loader = DataLoader(
    val_dataset,
    batch_size=BATCH_SIZE,
    shuffle=False,
    num_workers=0
)

# Load pretrained ResNet18
weights = models.ResNet18_Weights.DEFAULT
model = models.resnet18(weights=weights)

# Replace final layer
model.fc = nn.Linear(
    model.fc.in_features,
    NUM_CLASSES
)

model = model.to(device)

# Loss and optimizer
criterion = nn.CrossEntropyLoss()

optimizer = optim.Adam(
    model.parameters(),
    lr=LEARNING_RATE
)

best_val_accuracy = 0.0

# Store training history
history = {
    "epoch": [],
    "train_loss": [],
    "train_accuracy": [],
    "val_loss": [],
    "val_accuracy": []
}

# Training loop
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
        train_correct += (predictions == labels).sum().item()
        train_total += labels.size(0)

    # Validation
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
            val_correct += (predictions == labels).sum().item()
            val_total += labels.size(0)

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

    # Record metrics
    history["epoch"].append(epoch + 1)
    history["train_loss"].append(train_loss)
    history["train_accuracy"].append(train_accuracy)
    history["val_loss"].append(val_loss)
    history["val_accuracy"].append(val_accuracy)

    # Save best validation model
    if val_accuracy > best_val_accuracy:

        best_val_accuracy = val_accuracy

        torch.save({
            "model_state_dict": model.state_dict(),
            "class_to_idx": train_dataset.class_to_idx,
            "best_val_accuracy": best_val_accuracy,
            "epoch": epoch + 1
        }, MODEL_DIR / "best_model.pth")

        print("Best model saved!")

# Save training history as CSV
history_file = RESULTS_DIR / "training_history.csv"

with open(history_file, "w", newline="") as file:
    writer = csv.writer(file)
    writer.writerow(history.keys())

    for row in zip(*history.values()):
        writer.writerow(row)

print("Training history saved:", history_file)

# Plot accuracy
plt.figure(figsize=(9, 5))
plt.plot(history["epoch"], history["train_accuracy"], marker="o",
         label="Training Accuracy")
plt.plot(history["epoch"], history["val_accuracy"], marker="o",
         label="Validation Accuracy")
plt.title("Training and Validation Accuracy")
plt.xlabel("Epoch")
plt.ylabel("Accuracy (%)")
plt.xticks(history["epoch"])
plt.legend()
plt.grid(True)
plt.tight_layout()
plt.savefig(RESULTS_DIR / "accuracy_curve.png", dpi=300)
plt.close()

# Plot loss
plt.figure(figsize=(9, 5))
plt.plot(history["epoch"], history["train_loss"], marker="o",
         label="Training Loss")
plt.plot(history["epoch"], history["val_loss"], marker="o",
         label="Validation Loss")
plt.title("Training and Validation Loss")
plt.xlabel("Epoch")
plt.ylabel("Loss")
plt.xticks(history["epoch"])
plt.legend()
plt.grid(True)
plt.tight_layout()
plt.savefig(RESULTS_DIR / "loss_curve.png", dpi=300)
plt.close()

print("Accuracy graph saved.")
print("Loss graph saved.")
print("\nTraining completed.")
print("Best validation accuracy:", best_val_accuracy)
