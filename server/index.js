// Entry point: load env, connect to MongoDB, start the API.
// All middleware and routes live in app.js (BUG-006: they used to be duplicated here,
// after app.js's 404 handler, where they never ran).
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const app = require("./app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 5050;

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
