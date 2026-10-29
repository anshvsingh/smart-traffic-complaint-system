
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const complaintRoutes = require("./routes/complaintRoutes");
const express = require("express");
const connectDB = require("./config/db");

const app = express();
const PORT = process.env.PORT || 5050;

app.use(express.json());
app.use(cors());
app.use("/api/auth", authRoutes);
app.use("/api/complaints", complaintRoutes);

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

// Connect to MongoDB, then start Express
const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
