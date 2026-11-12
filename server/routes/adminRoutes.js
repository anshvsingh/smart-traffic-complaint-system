
const express = require("express");
const mongoose = require("mongoose");

const User = require("../models/User");
const Complaint = require("../models/Complaint");

const {
  protect,
  requireAdmin,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect, requireAdmin);

// Allowed complaint statuses
const allowedStatuses = [
  "Submitted",
  "Under Review",
  "Assigned to Department",
  "Accepted by Department",
  "In Progress",
  "Work in Progress",
  "Work Completed",
  "Resolved",
  "Rejected",
];

const allowedPriorities = ["Low", "Medium", "High"];

// --------------------------------------------------
// POST /api/admin/departments
// Create a department account
// --------------------------------------------------

router.post("/departments", async (req, res) => {
  try {
    const { name, email, password, department } = req.body;

    if (!name || !email || !password || !department) {
      return res.status(400).json({
        status: "error",
        message: "Name, email, password and department are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        status: "error",
        message: "Password must contain at least 8 characters",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        status: "error",
        message: "An account with this email already exists",
      });
    }

    const departmentUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: "department",
      department: department.trim(),
    });

    return res.status(201).json({
      status: "success",
      message: "Department account created successfully",
      user: {
        id: departmentUser._id,
        name: departmentUser.name,
        email: departmentUser.email,
        role: departmentUser.role,
        department: departmentUser.department,
      },
    });
  } catch (error) {
    console.error("Department creation error:", error);

    return res.status(500).json({
      status: "error",
      message: "Unable to create department account",
    });
  }
});

// --------------------------------------------------
// GET /api/admin/complaints
// Get all complaints
// --------------------------------------------------

router.get("/complaints", async (req, res) => {
  try {
    const complaints = await Complaint.find()
      .populate("user", "name email")
      .populate("progressUpdates.updatedBy", "name email role")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: "success",
      count: complaints.length,
      complaints,
    });
  } catch (error) {
    console.error("Fetch complaints error:", error);

    return res.status(500).json({
      status: "error",
      message: "Unable to fetch complaints",
    });
  }
});

// --------------------------------------------------
// PATCH /api/admin/complaints/:id/assign
// Assign or reassign a complaint to a department
// --------------------------------------------------

router.patch("/complaints/:id/assign", async (req, res) => {
  try {
    const { id } = req.params;

    // Accept both frontend field names.
    const department = (
      req.body.department ||
      req.body.assignedDepartment ||
      ""
    ).trim();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid complaint ID",
      });
    }

    if (!department) {
      return res.status(400).json({
        status: "error",
        message: "Department name is required",
      });
    }

    // Confirm that the department account exists.
    const departmentUser = await User.findOne({
      role: "department",
      department,
    });

    if (!departmentUser) {
      return res.status(404).json({
        status: "error",
        message: `No account found for ${department}. Check the department account in MongoDB.`,
      });
    }

    const complaint = await Complaint.findById(id);

    if (!complaint) {
      return res.status(404).json({
        status: "error",
        message: "Complaint not found",
      });
    }

    const previousDepartment = complaint.assignedDepartment;

    complaint.assignedDepartment = departmentUser.department;
    complaint.departmentStatus = "Assigned";
    complaint.status = "Assigned to Department";

    complaint.progressUpdates.push({
      updatedBy: req.user._id,
      role: "admin",
      message: previousDepartment
        ? `Complaint reassigned from ${previousDepartment} to ${departmentUser.department}.`
        : `Complaint assigned to ${departmentUser.department}.`,
      status: "Assigned to Department",
    });

    await complaint.save();

    return res.status(200).json({
      status: "success",
      message: "Complaint assigned successfully",
      complaint,
    });
  } catch (error) {
    console.error("Complaint assignment error:", error);

    return res.status(500).json({
      status: "error",
      message: "Unable to assign complaint",
    });
  }
});

// --------------------------------------------------
// PATCH /api/admin/complaints/:id
// Update complaint status or priority
// --------------------------------------------------

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

    if (status === undefined && priority === undefined) {
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

    const complaint = await Complaint.findById(id);

    if (!complaint) {
      return res.status(404).json({
        status: "error",
        message: "Complaint not found",
      });
    }

    if (status !== undefined) {
      complaint.status = status;

      if (status === "Resolved") {
        complaint.departmentStatus = "Work Completed";
      }

      complaint.progressUpdates.push({
        updatedBy: req.user._id,
        role: "admin",
        message: `Administrator updated complaint status to ${status}.`,
        status,
      });
    }

    if (priority !== undefined) {
      complaint.priority = priority;
    }

    await complaint.save();

    return res.status(200).json({
      status: "success",
      message: "Complaint updated successfully",
      complaint,
    });
  } catch (error) {
    console.error("Complaint update error:", error);

    return res.status(500).json({
      status: "error",
      message: "Unable to update complaint",
    });
  }
});

// --------------------------------------------------
// GET /api/admin/dashboard
// Get complaint dashboard statistics
// --------------------------------------------------

router.get("/dashboard", async (req, res) => {
  try {
    const total = await Complaint.countDocuments();

    const statusCounts = await Complaint.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const byStatus = {};

    statusCounts.forEach((item) => {
      byStatus[item._id] = item.count;
    });

    return res.status(200).json({
      status: "success",
      total,
      byStatus,
    });
  } catch (error) {
    console.error("Dashboard statistics error:", error);

    return res.status(500).json({
      status: "error",
      message: "Unable to fetch dashboard statistics",
    });
  }
});

module.exports = router;
