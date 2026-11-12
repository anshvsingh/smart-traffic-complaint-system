
require("dotenv").config({
  path: require("path").join(__dirname, ".env"),
});

const app = require("./app");
const connectDB = require("./config/db");
const seedDepartments = require("./seedDepartments");

const PORT = process.env.PORT || 5050;

const startServer = async () => {
  try {
    await connectDB();

    // Automatically create missing department accounts.
    await seedDepartments();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
