
from pathlib import Path
from io import BytesIO

import torch
import torch.nn as nn
import torch.nn.functional as F

from PIL import Image, UnidentifiedImageError
from fastapi import FastAPI, File, UploadFile, HTTPException
from torchvision import models, transforms

# Paths
ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "models" / "best_model.pth"

# Configuration
MAX_FILE_SIZE = 10 * 1024 * 1024

ALLOWED_TYPES = {
    "image/jpeg",
    "image/png",
    "image/jpg"
}

# Device
device = torch.device(
    "mps" if torch.backends.mps.is_available() else "cpu"
)

# API
app = FastAPI(
    title="Smart Traffic Deep Learning API",
    description="Road damage classification using ResNet18",
    version="1.0.0"
)

# Preprocessing
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])

# Load trained model
def load_model():

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Model weights not found: {MODEL_PATH}"
        )

    checkpoint = torch.load(
        MODEL_PATH,
        map_location=device,
        weights_only=True
    )

    model = models.resnet18(weights=None)

    model.fc = nn.Linear(
        model.fc.in_features, 3
    )

    model.load_state_dict(
        checkpoint["model_state_dict"]
    )

    model.to(device)
    model.eval()

    return model, checkpoint["class_to_idx"]


model, class_to_idx = load_model()

# Convert original labels into application labels
DISPLAY_NAMES = {
    "Cracks": "Road Damage",
    "Normal": "Normal Road",
    "Pothole": "Pothole"
}

idx_to_name = {
    index: DISPLAY_NAMES[name]
    for name, index in class_to_idx.items()
}

@app.get("/")
def home():
    return {
        "success": True,
        "message": "Smart Traffic DL API is running",
        "device": str(device)
    }


@app.get("/health")
def health():
    return {
        "success": True,
        "model_loaded": model is not None,
        "device": str(device)
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)):

    # Validate file type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Only JPEG and PNG images are allowed."
        )

    # Read with size limit
    contents = await file.read(MAX_FILE_SIZE + 1)

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Image exceeds the 10 MB upload limit."
        )

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="Uploaded image is empty."
        )

    # Validate and preprocess image
    try:
        image = Image.open(BytesIO(contents))
        image.verify()

        image = Image.open(BytesIO(contents)).convert("RGB")

    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="Invalid or corrupted image."
        )

    tensor = transform(image).unsqueeze(0).to(device)

    # Model inference
    try:
        with torch.inference_mode():
            outputs = model(tensor)
            probabilities = F.softmax(outputs, dim=1)

            confidence, predicted = probabilities.max(dim=1)

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Model prediction failed."
        )

    category = idx_to_name[predicted.item()]

    return {
        "success": True,
        "prediction": {
            "category": category,
            "confidence": round(confidence.item(), 4),
            "probabilities": {
                idx_to_name[i]: round(
                    probabilities[0][i].item(), 4
                )
                for i in range(len(idx_to_name))
            }
        }
    }
