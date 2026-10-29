
const express = require("express");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5050;

// Middleware
app.use(express.json());

// Root route
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Welcome to the Smart Traffic Complaint and Monitoring System API",
  });
});

// Health check route
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Smart Traffic Complaint API is running",
  });
});

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
