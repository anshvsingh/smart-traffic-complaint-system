
const cors = require("cors");
const express = require("express");
const path = require("path");

const complaintRoutes = require("./routes/complaintRoutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

app.use(express.json());

// Serve uploaded complaint images
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res) => {
      // Stop browsers from sniffing an upload into HTML/script.
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  })
);

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

// Final error handler: always answer in JSON and never leak stack traces.
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      status: "error",
      message: "Malformed JSON in request body",
    });
  }

  console.error("Unhandled error:", error.message);

  return res.status(error.status || 500).json({
    status: "error",
    message: "Something went wrong",
  });
});

module.exports = app;
