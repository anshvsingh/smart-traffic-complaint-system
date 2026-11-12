
const mongoose = require("mongoose");

const complaintSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    // Uploaded road image
    imageUrl: {
      type: String,
      default: null,
    },

    // Deep learning prediction
    aiPrediction: {
      status: {
        type: String,
        enum: ["Not Requested", "Completed", "Failed"],
        default: "Not Requested",
      },
      category: {
        type: String,
        default: null,
      },
      confidence: {
        type: Number,
        default: null,
      },
      probabilities: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
    },

    
    status: {
      type: String,
      enum: [
        "Submitted",
        "Under Review",
        "Assigned to Department",
        "Accepted by Department",
        "In Progress",
        "Work in Progress",
        "Work Completed",
        "Resolved",
        "Rejected",
      ],
      default: "Submitted",
    },


    assignedDepartment: {
      type: String,
      trim: true,
      default: null,
    },

    departmentStatus: {
      type: String,
      enum: [
        "Not Assigned",
        "Assigned",
        "Accepted",
        "Work in Progress",
        "Work Completed",
      ],
      default: "Not Assigned",
    },

    progressUpdates: [
      {
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        role: {
          type: String,
          enum: ["citizen", "admin", "department"],
          required: true,
        },
        message: {
          type: String,
          required: true,
          trim: true,
          maxlength: 1000,
        },
        status: {
          type: String,
          default: null,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Complaint", complaintSchema);
