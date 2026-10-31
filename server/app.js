const cors = require("cors");
const express = require("express");
const complaintRoutes = require("./routes/complaintRoutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();
app.use(cors({
  origin: "http://localhost:5173",
}));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/admin", adminRoutes);

app.get("/", (req, res) => {
  res.status(200).json({
    message: "Welcome to the Smart Traffic Complaint and Monitoring System API",
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Smart Traffic Complaint API is running",
  });
});

app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
  });
});

// BUG-005: JSON error handler. Without it, a malformed or oversized JSON body
// got Express's default HTML error page, including a stack trace outside production.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;

  if (status === 400 && err.type === "entity.parse.failed") {
    return res.status(400).json({ status: "error", message: "Invalid JSON body" });
  }

  if (status === 413) {
    return res.status(413).json({ status: "error", message: "Request body too large" });
  }

  if (status >= 500) {
    console.error("Unhandled error:", err.message);
  }

  return res.status(status).json({
    status: "error",
    message: status >= 500 ? "Internal server error" : "Bad request",
  });
});

module.exports = app;
