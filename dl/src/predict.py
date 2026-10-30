
import argparse
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F

from PIL import Image
from torchvision import models, transforms

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "models" / "best_model.pth"

CLASS_NAMES = {
    0: "Road Damage",
    1: "Normal Road",
    2: "Pothole"
}

device = torch.device(
    "mps" if torch.backends.mps.is_available() else "cpu"
)

# Image preprocessing
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])

def load_model():

    model = models.resnet18(weights=None)

    model.fc = nn.Linear(
        model.fc.in_features, 3
    )

    checkpoint = torch.load(
        MODEL_PATH,
        map_location=device
    )

    model.load_state_dict(
        checkpoint["model_state_dict"]
    )

    model.to(device)
    model.eval()

    return model


def predict(image_path):

    image_path = Path(image_path)

    if not image_path.exists():
        raise FileNotFoundError(
            f"Image not found: {image_path}"
        )

    model = load_model()

    image = Image.open(image_path).convert("RGB")
    image = transform(image).unsqueeze(0).to(device)

    with torch.no_grad():

        outputs = model(image)
        probabilities = F.softmax(outputs, dim=1)

        confidence, predicted = probabilities.max(dim=1)

    predicted_class = CLASS_NAMES[predicted.item()]

    result = {
        "predicted_class": predicted_class,
        "confidence": round(confidence.item(), 4),
        "probabilities": {
            CLASS_NAMES[i]: round(probabilities[0][i].item(), 4)
            for i in range(3)
        }
    }

    return result


if __name__ == "__main__":

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--image",
        required=True,
        help="Path to road image"
    )

    args = parser.parse_args()

    result = predict(args.image)

    import json
    print(json.dumps(result, indent=4))
