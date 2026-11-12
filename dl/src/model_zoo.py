"""
The three CNN architectures compared in ``compare_models.py``.

All three are torchvision ImageNet models. Only the final classification layer
is replaced so it outputs our 3 classes (Cracks / Normal / Pothole):

* ResNet18          - residual blocks (the model ``train.py`` / ``api.py`` use)
* EfficientNet-B0   - MBConv (depthwise-separable) blocks + squeeze-excitation,
                      width/depth/resolution set by compound scaling
* MobileNetV3-Large - depthwise-separable inverted residuals + SE + h-swish,
                      designed for phones / CPUs (deployment-friendly option)

Checkpoints use the same format as ``train.py``:
``{"model_state_dict", "class_to_idx", ...}`` plus an ``"arch"`` key so a
loader knows which network to build. ``api.py`` only needs the first two
keys, so a ResNet18 checkpoint saved here also works with the API.
"""

from __future__ import annotations

from pathlib import Path

import torch
from torch import nn
from torchvision import models

MODEL_SPECS = {
    "resnet18": {
        "display": "ResNet18",
        "builder": models.resnet18,
        "weights": models.ResNet18_Weights.DEFAULT,
    },
    "efficientnet_b0": {
        "display": "EfficientNet-B0",
        "builder": models.efficientnet_b0,
        "weights": models.EfficientNet_B0_Weights.DEFAULT,
    },
    "mobilenet_v3_large": {
        "display": "MobileNetV3-Large",
        "builder": models.mobilenet_v3_large,
        "weights": models.MobileNet_V3_Large_Weights.DEFAULT,
    },
}
MODEL_NAMES = list(MODEL_SPECS)


def build_model(name: str, num_classes: int = 3, pretrained: bool = True) -> nn.Module:
    """Return the network with a new ``num_classes`` output layer."""
    if name not in MODEL_SPECS:
        raise ValueError(f"Unknown model {name!r}; choose from {MODEL_NAMES}")
    spec = MODEL_SPECS[name]
    model = spec["builder"](weights=spec["weights"] if pretrained else None)

    if name == "resnet18":
        model.fc = nn.Linear(model.fc.in_features, num_classes)
    elif name == "efficientnet_b0":
        # classifier = [Dropout(0.2), Linear(1280, 1000)]
        model.classifier[1] = nn.Linear(model.classifier[1].in_features, num_classes)
    else:
        # classifier = [Linear(960, 1280), Hardswish, Dropout(0.2), Linear(1280, 1000)]
        model.classifier[3] = nn.Linear(model.classifier[3].in_features, num_classes)
    return model


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())


def load_checkpoint(path: Path | str, device: torch.device | str = "cpu", arch: str | None = None):
    """Load a checkpoint saved by ``train.py`` or ``compare_models.py``.

    Returns ``(model, class_to_idx, checkpoint)``. Old ``train.py`` checkpoints
    have no ``arch`` key and are ResNet18.
    """
    checkpoint = torch.load(path, map_location=device, weights_only=True)
    if not {"model_state_dict", "class_to_idx"}.issubset(checkpoint):
        raise KeyError("Checkpoint must contain model_state_dict and class_to_idx.")
    arch = arch or checkpoint.get("arch", "resnet18")
    model = build_model(arch, num_classes=len(checkpoint["class_to_idx"]), pretrained=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device).eval()
    return model, checkpoint["class_to_idx"], checkpoint
