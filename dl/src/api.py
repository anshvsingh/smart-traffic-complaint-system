
import os
from io import BytesIO
from pathlib import Path

import torch
from torch import nn
from torch.nn import functional as F
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from torchvision import models, transforms


# Paths
ROOT = Path(__file__).resolve().parents[1]
# Optional override, e.g. DL_MODEL_PATH=dl/models/comparison/resnet18_cprd.pth
# (must be a ResNet18 checkpoint in the train.py format). Default is unchanged.
MODEL_PATH = Path(os.environ.get("DL_MODEL_PATH", ROOT / "models" / "best_model.pth"))

# Configuration
MAX_FILE_SIZE = 10 * 1024 * 1024

ALLOWED_TYPES = {
    "image/jpeg",
    "image/png",
    "image/jpg",
}

# Device
if torch.backends.mps.is_available():
    DEVICE = torch.device("mps")
elif torch.cuda.is_available():
    DEVICE = torch.device("cuda")
else:
    DEVICE = torch.device("cpu")

# API
app = FastAPI(
    title="Smart Traffic Deep Learning API",
    description="Road damage classification using ResNet18",
    version="1.0.0",
)

# Preprocessing
TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225],
    ),
])

DISPLAY_NAMES = {
    "Cracks": "Road Damage",
    "Normal": "Normal Road",
    "Pothole": "Pothole",
}


def load_model():
    """Load the trained ResNet18 model and its class mapping."""
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(
            f"Model weights not found: {MODEL_PATH}"
        )

    checkpoint = torch.load(
        MODEL_PATH,
        map_location=DEVICE,
        weights_only=True,
    )

    required_keys = {"model_state_dict", "class_to_idx"}
    if not required_keys.issubset(checkpoint):
        raise KeyError(
            "Model checkpoint must contain model_state_dict and class_to_idx."
        )

    class_mapping = checkpoint["class_to_idx"]

    if set(class_mapping) != set(DISPLAY_NAMES):
        raise ValueError(
            "Checkpoint classes do not match the expected road-condition classes."
        )

    model_instance = models.resnet18(weights=None)
    model_instance.fc = nn.Linear(
        model_instance.fc.in_features,
        len(class_mapping),
    )

    model_instance.load_state_dict(checkpoint["model_state_dict"])
    model_instance.to(DEVICE)
    model_instance.eval()

    return model_instance, class_mapping


# Load model at application startup
model, class_to_idx = load_model()

IDX_TO_NAME = {
    index: DISPLAY_NAMES[name]
    for name, index in class_to_idx.items()
}


@app.get("/")
def home():
    """Return API status."""
    return {
        "success": True,
        "message": "Smart Traffic DL API is running",
        "device": str(DEVICE),
    }


@app.get("/health")
def health():
    """Check API and model availability."""
    return {
        "success": True,
        "model_loaded": model is not None,
        "device": str(DEVICE),
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """Classify an uploaded road image."""
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Only JPEG and PNG images are allowed.",
        )

    contents = await file.read(MAX_FILE_SIZE + 1)

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Image exceeds the 10 MB upload limit.",
        )

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="Uploaded image is empty.",
        )

    try:
        with Image.open(BytesIO(contents)) as uploaded_image:
            uploaded_image.verify()

        with Image.open(BytesIO(contents)) as uploaded_image:
            image = uploaded_image.convert("RGB")

    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail="Invalid or corrupted image.",
        ) from exc

    image_tensor = TRANSFORM(image).unsqueeze(0).to(DEVICE)

    try:
        with torch.inference_mode():
            outputs = model(image_tensor)
            probabilities = F.softmax(outputs, dim=1)
            confidence, predicted = probabilities.max(dim=1)

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Model prediction failed.",
        ) from exc

    predicted_index = predicted.item()
    category = IDX_TO_NAME[predicted_index]

    return {
        "success": True,
        "prediction": {
            "category": category,
            "confidence": round(confidence.item(), 4),
            "probabilities": {
                IDX_TO_NAME[index]: round(
                    probabilities[0][index].item(), 4
                )
                for index in range(len(IDX_TO_NAME))
            },
        },
    }
