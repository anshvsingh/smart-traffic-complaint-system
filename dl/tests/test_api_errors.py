"""Error-path tests for the DL inference API: checkpoint loading, the
service-info endpoint, PNG input and model failures."""
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import torch
from fastapi.testclient import TestClient
from PIL import Image
from torch import nn
from torchvision import models

from src import api


def make_image(fmt="JPEG"):
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), color="gray").save(buffer, format=fmt)
    buffer.seek(0)
    return buffer


class FailingModel:
    """A model that raises during inference."""

    def __call__(self, tensor):
        raise RuntimeError("CUDA out of memory")


class FixedModel:
    """Always predicts the class with index 2."""

    def __call__(self, tensor):
        return torch.tensor([[0.0, 1.0, 4.0]])


class TestLoadModel(unittest.TestCase):
    """load_model() must refuse missing or incompatible checkpoints."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "model.pth"

    def tearDown(self):
        self.tmp.cleanup()

    def _save(self, checkpoint):
        torch.save(checkpoint, self.path)

    def _state_dict(self):
        net = models.resnet18(weights=None)
        net.fc = nn.Linear(net.fc.in_features, 3)
        return net.state_dict()

    def test_missing_file(self):
        with patch.object(api, "MODEL_PATH", self.path):
            with self.assertRaises(FileNotFoundError):
                api.load_model()

    def test_missing_keys(self):
        self._save({"weights": {}})
        with patch.object(api, "MODEL_PATH", self.path):
            with self.assertRaises(KeyError):
                api.load_model()

    def test_wrong_classes(self):
        self._save({
            "model_state_dict": self._state_dict(),
            "class_to_idx": {"Cat": 0, "Dog": 1, "Bird": 2},
        })
        with patch.object(api, "MODEL_PATH", self.path):
            with self.assertRaises(ValueError):
                api.load_model()

    def test_valid_checkpoint(self):
        mapping = {"Cracks": 0, "Normal": 1, "Pothole": 2}
        self._save({"model_state_dict": self._state_dict(), "class_to_idx": mapping})
        with patch.object(api, "MODEL_PATH", self.path):
            model, class_mapping = api.load_model()
        self.assertEqual(class_mapping, mapping)
        self.assertFalse(model.training)


class TestEndpoints(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(api.app)

    def test_home_endpoint(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])
        self.assertIn("device", response.json())

    def test_png_image_is_accepted(self):
        with patch.object(api, "model", FixedModel()):
            response = self.client.post(
                "/predict", files={"file": ("road.png", make_image("PNG"), "image/png")}
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["prediction"]["category"], api.IDX_TO_NAME[2]
        )

    def test_prediction_has_all_three_classes(self):
        with patch.object(api, "model", FixedModel()):
            response = self.client.post(
                "/predict", files={"file": ("road.jpg", make_image(), "image/jpeg")}
            )
        probabilities = response.json()["prediction"]["probabilities"]
        self.assertEqual(
            set(probabilities), {"Road Damage", "Normal Road", "Pothole"}
        )
        confidence = response.json()["prediction"]["confidence"]
        self.assertEqual(confidence, max(probabilities.values()))

    def test_model_failure_returns_500(self):
        with patch.object(api, "model", FailingModel()):
            response = self.client.post(
                "/predict", files={"file": ("road.jpg", make_image(), "image/jpeg")}
            )
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()["detail"], "Model prediction failed.")
        self.assertNotIn("CUDA", response.text)


if __name__ == "__main__":
    unittest.main()
