
const express = require("express");
const mongoose = require("mongoose");

const Complaint = require("../models/Complaint");
const { protect, requireDepartment } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect, requireDepartment);

// Get complaints assigned to the logged-in department.
router.get("/complaints", async (req, res) => {
  try {
    const complaints = await Complaint.find({
      assignedDepartment: req.user.department,
    })
      .populate("user", "name email")
      .populate("progressUpdates.updatedBy", "name role")
      .sort({ updatedAt: -1 });

    res.status(200).json({
      status: "success",
      complaints,
    });
  } catch (error) {
    console.error("Department complaints error:", error);
    res.status(500).json({
      status: "error",
      message: "Unable to fetch department complaints",
    });
  }
});

// Accept an assigned complaint.
router.patch("/complaints/:id/accept", async (req, res) => {
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
      assignedDepartment: req.user.department,
    });

    if (!complaint) {
      return res.status(404).json({
        status: "error",
        message: "Assigned complaint not found",
      });
    }

    if (complaint.departmentStatus !== "Assigned") {
      return res.status(400).json({
        status: "error",
        message: "This complaint cannot be accepted in its current state",
      });
    }

    complaint.departmentStatus = "Accepted";
    complaint.status = "Accepted by Department";

    complaint.progressUpdates.push({
      updatedBy: req.user._id,
      role: "department",
      message: "Department accepted the complaint assignment.",
      status: complaint.status,
    });

    await complaint.save();

    res.status(200).json({
      status: "success",
      message: "Complaint accepted successfully",
      complaint,
    });
  } catch (error) {
    console.error("Accept complaint error:", error);
    res.status(500).json({
      status: "error",
      message: "Unable to accept complaint",
    });
  }
});

// Post a progress update or mark work completed.
router.patch("/complaints/:id/progress", async (req, res) => {
  try {
    const { id } = req.params;
    const { message, status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid complaint ID",
      });
    }

    const complaint = await Complaint.findOne({
      _id: id,
      assignedDepartment: req.user.department,
    });

    if (!complaint) {
      return res.status(404).json({
        status: "error",
        message: "Assigned complaint not found",
      });
    }

    if (
      !["Accepted", "Work in Progress"].includes(
        complaint.departmentStatus
      )
    ) {
      return res.status(400).json({
        status: "error",
        message: "Accept the complaint before posting progress",
      });
    }

    if (
      typeof message !== "string" ||
      !message.trim() ||
      message.trim().length > 1000
    ) {
      return res.status(400).json({
        status: "error",
        message: "A progress message of up to 1000 characters is required",
      });
    }

    if (
      status &&
      !["Work in Progress", "Work Completed"].includes(status)
    ) {
      return res.status(400).json({
        status: "error",
        message: "Invalid department progress status",
      });
    }

    if (status === "Work Completed") {
      complaint.departmentStatus = "Work Completed";
      complaint.status = "Work Completed";
    } else {
      complaint.departmentStatus = "Work in Progress";
      complaint.status = "Work in Progress";
    }

    complaint.progressUpdates.push({
      updatedBy: req.user._id,
      role: "department",
      message: message.trim(),
      status: complaint.status,
    });

    await complaint.save();

    res.status(200).json({
      status: "success",
      message: "Progress updated successfully",
      complaint,
    });
  } catch (error) {
    console.error("Department progress error:", error);
    res.status(500).json({
      status: "error",
      message: "Unable to update complaint progress",
    });
  }
});

module.exports = router;
