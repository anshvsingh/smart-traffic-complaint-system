require("dotenv").config({ path: require("path").join(__dirname, ".env") });

// All middleware and routes are registered in app.js.
const app = require("./app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 5050;

// Connect to MongoDB, then start Express
const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
