
const express = require("express");
const mongoose = require("mongoose");
const Complaint = require("../models/Complaint");
const { protect, requireAdmin } = require("../middleware/authMiddleware");
const { COMPLAINT_STATUSES, COMPLAINT_PRIORITIES } = require("../constants/complaint");

const router = express.Router();

// Every route in this file requires an authenticated administrator.
router.use(protect, requireAdmin);

// GET /api/admin/complaints
// View all complaints, newest first.
router.get("/complaints", async (req, res) => {
  try {
    const complaints = await Complaint.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      status: "success",
      count: complaints.length,
      complaints,
    });
  } catch (error) {
    console.error("Admin fetch complaints error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to fetch complaints",
    });
  }
});

// PATCH /api/admin/complaints/:id
// Update a complaint's status and/or priority.
router.patch("/complaints/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid complaint ID",
      });
    }

    const allowedStatuses = COMPLAINT_STATUSES;
    const allowedPriorities = COMPLAINT_PRIORITIES;

    if (
      status === undefined &&
      priority === undefined
    ) {
      return res.status(400).json({
        status: "error",
        message: "Provide a status or priority to update",
      });
    }

    if (
      status !== undefined &&
      !allowedStatuses.includes(status)
    ) {
      return res.status(400).json({
        status: "error",
        message: "Invalid complaint status",
      });
    }

    if (
      priority !== undefined &&
      !allowedPriorities.includes(priority)
    ) {
      return res.status(400).json({
        status: "error",
        message: "Invalid complaint priority",
      });
    }

    const updates = {};
    if (status !== undefined) updates.status = status;
    if (priority !== undefined) updates.priority = priority;

    const complaint = await Complaint.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate("user", "name email");

    if (!complaint) {
      return res.status(404).json({
        status: "error",
        message: "Complaint not found",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Complaint updated successfully",
      complaint,
    });
  } catch (error) {
    console.error("Admin update complaint error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to update complaint",
    });
  }
});

// GET /api/admin/dashboard
// Summary counts for the administrator dashboard.
router.get("/dashboard", async (req, res) => {
  try {
    // One aggregation instead of countDocuments + aggregate: total is the sum
    const statusCounts = await Complaint.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const byStatus = {};
    let total = 0;
    for (const item of statusCounts) {
      byStatus[item._id] = item.count;
      total += item.count;
    }

    return res.status(200).json({
      status: "success",
      total,
      byStatus,
    });
  } catch (error) {
    console.error("Admin dashboard error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to load dashboard",
    });
  }
});

module.exports = router;
