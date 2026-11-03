
import argparse
import json
from pathlib import Path

import torch
from torch import nn
from torch.nn import functional as F
from PIL import Image
from torchvision import models, transforms


ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "models" / "best_model.pth"

CLASS_NAMES = {
    0: "Road Damage",
    1: "Normal Road",
    2: "Pothole",
}

if torch.backends.mps.is_available():
    DEVICE = torch.device("mps")
elif torch.cuda.is_available():
    DEVICE = torch.device("cuda")
else:
    DEVICE = torch.device("cpu")


# Image preprocessing
TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225],
    ),
])


def load_model():
    """Load the trained ResNet18 model."""
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Trained model not found: {MODEL_PATH}"
        )

    model = models.resnet18(weights=None)
    model.fc = nn.Linear(model.fc.in_features, len(CLASS_NAMES))

    checkpoint = torch.load(
        MODEL_PATH,
        map_location=DEVICE,
    )

    if "model_state_dict" not in checkpoint:
        raise KeyError(
            "Checkpoint does not contain 'model_state_dict'."
        )

    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(DEVICE)
    model.eval()

    return model


def predict(image_path):
    """Predict the road condition shown in an image."""
    image_path = Path(image_path)

    if not image_path.is_file():
        raise FileNotFoundError(
            f"Image not found: {image_path}"
        )

    model = load_model()

    with Image.open(image_path) as image_file:
        image = image_file.convert("RGB")

    image_tensor = TRANSFORM(image).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        outputs = model(image_tensor)
        probabilities = F.softmax(outputs, dim=1)
        confidence, predicted = probabilities.max(dim=1)

    predicted_index = predicted.item()

    prediction_result = {
        "predicted_class": CLASS_NAMES[predicted_index],
        "confidence": round(confidence.item(), 4),
        "probabilities": {
            CLASS_NAMES[index]: round(
                probabilities[0][index].item(), 4
            )
            for index in range(len(CLASS_NAMES))
        },
    }

    return prediction_result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Predict road conditions from an image."
    )

    parser.add_argument(
        "--image",
        required=True,
        help="Path to road image",
    )

    arguments = parser.parse_args()
    output = predict(arguments.image)

    print(json.dumps(output, indent=4))
