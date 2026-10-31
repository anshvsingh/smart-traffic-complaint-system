
const mongoose = require("mongoose");
const {
  COMPLAINT_CATEGORIES,
  COMPLAINT_STATUSES,
  COMPLAINT_PRIORITIES,
  LIMITS,
} = require("../constants/complaint");

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
      enum: COMPLAINT_CATEGORIES,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: LIMITS.descriptionMax,
    },

    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: LIMITS.locationMax,
    },

    status: {
      type: String,
      enum: COMPLAINT_STATUSES,
      default: "Submitted",
    },

    priority: {
      type: String,
      enum: COMPLAINT_PRIORITIES,
      default: "Medium",
    },
  },
  { timestamps: true }
);

// Indexes for the queries the app actually runs (faster lists as data grows):
//   citizen list:  find({ user }).sort({ createdAt: -1 })
//   admin list:    find().sort({ createdAt: -1 })
complaintSchema.index({ user: 1, createdAt: -1 });
complaintSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Complaint", complaintSchema);
