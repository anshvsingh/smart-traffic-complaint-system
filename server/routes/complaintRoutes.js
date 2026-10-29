
const express = require("express");
const Complaint = require("../models/Complaint");

const router = express.Router();

// Create a complaint
router.post("/", async (req, res) => {
  try {
    const { category, description, location } = req.body;

    if (!category || !description || !location) {
      return res.status(400).json({
        status: "error",
        message: "Category, description, and location are required",
      });
    }

    const complaint = await Complaint.create({
      category,
      description,
      location,
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
        message: "Invalid complaint data",
      });
    }

    console.error("Create complaint error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to submit complaint",
    });
  }
});

// List complaints (temporary development endpoint)
router.get("/", async (req, res) => {
  try {
    const complaints = await Complaint.find().sort({ createdAt: -1 });

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

module.exports = router;
