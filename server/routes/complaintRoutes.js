
const express = require("express");
const mongoose = require("mongoose");
const Complaint = require("../models/Complaint");
const { protect } = require("../middleware/authMiddleware");

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

module.exports = router;
