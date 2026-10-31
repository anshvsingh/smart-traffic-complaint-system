// Single source of truth for complaint values used by the model, the routes
// and (by copy) the React dropdown in client/src/Dashboard.jsx.

const COMPLAINT_CATEGORIES = [
  "Pothole",
  "Traffic Signal",
  "Illegal Parking",
  "Road Blockage",
  "Traffic Congestion",
  "Street Lighting",
  "Accident",
  "Pedestrian Safety",
  "Road Sign",
  "Public Transport",
  "Other",
];

const COMPLAINT_STATUSES = ["Submitted", "Under Review", "In Progress", "Resolved", "Rejected"];

const COMPLAINT_PRIORITIES = ["Low", "Medium", "High"];

const LIMITS = {
  nameMax: 100,
  descriptionMax: 2000,
  locationMax: 200,
};

module.exports = { COMPLAINT_CATEGORIES, COMPLAINT_STATUSES, COMPLAINT_PRIORITIES, LIMITS };
