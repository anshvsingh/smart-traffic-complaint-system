
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
        "In Progress",
        "Resolved",
        "Rejected",
      ],
      default: "Submitted",
    },

    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Complaint", complaintSchema);
