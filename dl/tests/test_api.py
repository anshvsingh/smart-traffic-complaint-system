import io
import unittest
from unittest.mock import patch

import torch
from fastapi.testclient import TestClient
from PIL import Image

from src import api


class FakeModel:
    """A predictable model used only for testing the API."""

    def __call__(self, tensor):
        return torch.tensor([[3.0, 1.0, 0.0]])


class TestTrafficCareAPI(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(api.app)

    def create_test_image(self):
        image = Image.new("RGB", (100, 100), color="white")
        image_bytes = io.BytesIO()
        image.save(image_bytes, format="JPEG")
        image_bytes.seek(0)
        return image_bytes

    def test_health_endpoint(self):
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])
        self.assertTrue(response.json()["model_loaded"])

    def test_reject_unsupported_file_type(self):
        response = self.client.post(
            "/predict",
            files={"file": ("document.pdf", b"sample", "application/pdf")}
        )

        self.assertEqual(response.status_code, 400)

    def test_reject_empty_image(self):
        response = self.client.post(
            "/predict",
            files={"file": ("empty.jpg", b"", "image/jpeg")}
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"],
                         "Uploaded image is empty.")

    def test_reject_oversized_image(self):
        large_file = b"x" * (api.MAX_FILE_SIZE + 1)

        response = self.client.post(
            "/predict",
            files={"file": ("large.jpg", large_file, "image/jpeg")}
        )

        self.assertEqual(response.status_code, 413)

    def test_reject_corrupted_image(self):
        response = self.client.post(
            "/predict",
            files={"file": ("corrupted.jpg", b"not an image", "image/jpeg")}
        )

        self.assertEqual(response.status_code, 400)

    def test_valid_image_prediction(self):
        image = self.create_test_image()

        with patch.object(api, "model", FakeModel()):
            response = self.client.post(
                "/predict",
                files={"file": ("road.jpg", image, "image/jpeg")}
            )

        self.assertEqual(response.status_code, 200)

        result = response.json()

        self.assertTrue(result["success"])
        self.assertIn("category", result["prediction"])
        self.assertIn("confidence", result["prediction"])
        self.assertIn("probabilities", result["prediction"])

        self.assertAlmostEqual(
            sum(result["prediction"]["probabilities"].values()),
            1.0,
            places=3
        )


if __name__ == "__main__":
    unittest.main()
