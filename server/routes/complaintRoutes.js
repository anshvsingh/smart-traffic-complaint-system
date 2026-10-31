
const express = require("express");
const mongoose = require("mongoose");
const Complaint = require("../models/Complaint");
const { protect } = require("../middleware/authMiddleware");
const { COMPLAINT_CATEGORIES, LIMITS } = require("../constants/complaint");

const router = express.Router();

// Submit a complaint for the logged-in citizen
router.post("/", protect, async (req, res) => {
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
      return res.status(400).json({
        status: "error",
        message: "Category, description, and location are required",
      });
    }

    // BUG-001: only the categories offered in the app are accepted
    if (!COMPLAINT_CATEGORIES.includes(category.trim())) {
      return res.status(400).json({
        status: "error",
        message: "Invalid complaint category",
      });
    }

    // BUG-002: length limits answered with a clear 400 instead of a 500
    if (description.trim().length > LIMITS.descriptionMax) {
      return res.status(400).json({
        status: "error",
        message: `Description must be ${LIMITS.descriptionMax} characters or fewer`,
      });
    }

    if (location.trim().length > LIMITS.locationMax) {
      return res.status(400).json({
        status: "error",
        message: `Location must be ${LIMITS.locationMax} characters or fewer`,
      });
    }

    const complaint = await Complaint.create({
      user: req.user._id,
      category: category.trim(),
      description: description.trim(),
      location: location.trim(),
    });

    return res.status(201).json({
      status: "success",
      message: "Complaint submitted successfully",
      complaint,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        status: "error",
        message: "Invalid complaint details",
      });
    }

    console.error("Create complaint error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to submit complaint",
    });
  }
});

// Fetch only the logged-in citizen's complaints
router.get("/", protect, async (req, res) => {
  try {
    // lean(): plain objects, skips building Mongoose documents (faster, same JSON)
    const complaints = await Complaint.find({
      user: req.user._id,
    })
      .sort({ createdAt: -1 })
      .lean();

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

// GET /api/complaints/:id
// View a complaint only if it belongs to the authenticated citizen.
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
    }).lean();

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

module.exports = router;
