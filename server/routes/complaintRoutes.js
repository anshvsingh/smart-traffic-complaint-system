
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const Complaint = require("../models/Complaint");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// Create upload directory if it does not exist
const uploadDirectory = path.join(__dirname, "../uploads");
fs.mkdirSync(uploadDirectory, { recursive: true });

// Configure image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png"];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPG and PNG images are allowed"));
    }

    cb(null, true);
  },
});

// Remove uploaded file if a later step fails validation
async function removeUploadedFile(file) {
  if (file?.path) {
    await fs.promises.unlink(file.path).catch(() => {});
  }
}

// Submit a complaint for the logged-in citizen
router.post("/", protect, upload.single("image"), async (req, res) => {
  try {
    const { category, description, location } = req.body;

    if (
      typeof category !== "string" ||
      typeof description !== "string" ||
      typeof location !== "string" ||
      !category.trim() ||
      !description.trim() ||
      !location.trim()
    ) {
      await removeUploadedFile(req.file);

      return res.status(400).json({
        status: "error",
        message: "Category, description, and location are required",
      });
    }

    let aiPrediction = {
      status: "Not Requested",
      category: null,
      confidence: null,
      probabilities: null,
    };

    let imageUrl = null;

    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;

      try {
        const imageBuffer = await fs.promises.readFile(req.file.path);

        const formData = new FormData();

        formData.append(
          "file",
          new Blob([imageBuffer], { type: req.file.mimetype }),
          req.file.originalname
        );

        const predictionUrl =
          process.env.DL_API_URL ||
          "http://127.0.0.1:8000/predict";

        const response = await fetch(predictionUrl, {
          method: "POST",
          body: formData,
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          throw new Error(`AI API returned HTTP ${response.status}`);
        }

        const result = await response.json();

        if (
          !result.success ||
          !result.prediction ||
          typeof result.prediction.category !== "string" ||
          typeof result.prediction.confidence !== "number"
        ) {
          throw new Error("Invalid prediction response from AI API");
        }

        aiPrediction = {
          status: "Completed",
          category: result.prediction.category,
          confidence: result.prediction.confidence,
          probabilities: result.prediction.probabilities || null,
        };
      } catch (aiError) {
        console.error("AI prediction error:", aiError.message);

        aiPrediction.status = "Failed";
      }
    }

    const complaint = await Complaint.create({
      user: req.user._id,
      category: category.trim(),
      description: description.trim(),
      location: location.trim(),
      imageUrl,
      aiPrediction,
    });

    return res.status(201).json({
      status: "success",
      message: "Complaint submitted successfully",
      complaint,
    });
  } catch (error) {
    console.error("Create complaint error:", error.message);

    await removeUploadedFile(req.file);

    return res.status(500).json({
      status: "error",
      message: "Unable to submit complaint",
    });
  }
});

// Fetch only the logged-in citizen's complaints
router.get("/", protect, async (req, res) => {
  try {
    const complaints = await Complaint.find({
      user: req.user._id,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      status: "success",
      count: complaints.length,
      complaints,
    });
  } catch (error) {
    console.error("Fetch complaints error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to fetch complaints",
    });
  }
});

// View a complaint only if it belongs to the authenticated citizen
router.get("/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid complaint ID",
      });
    }

    const complaint = await Complaint.findOne({
      _id: id,
      user: req.user._id,
    });

    if (!complaint) {
      return res.status(404).json({
        status: "error",
        message: "Complaint not found",
      });
    }

    return res.status(200).json({
      status: "success",
      complaint,
    });
  } catch (error) {
    console.error("Fetch complaint detail error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to fetch complaint",
    });
  }
});

// Handle Multer upload errors
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      status: "error",
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Image must be 10 MB or smaller"
          : "Image upload error",
    });
  }

  if (error.message === "Only JPG and PNG images are allowed") {
    return res.status(400).json({
      status: "error",
      message: error.message,
    });
  }

  next(error);
});

module.exports = router;
