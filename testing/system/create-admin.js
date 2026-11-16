// Creates (or resets) the administrator account used by the system tests.
// There is no API for creating administrators, so this writes to the database
// configured in server/.env. Use a TEST database only.
//
//   node testing/system/create-admin.js
//
// Reads MONGODB_URI, SYSTEM_TEST_ADMIN_EMAIL and SYSTEM_TEST_ADMIN_PASSWORD
// from server/.env.
const path = require("path");
const serverDir = path.join(__dirname, "..", "..", "server");
require(path.join(serverDir, "node_modules", "dotenv")).config({
  path: path.join(serverDir, ".env"),
  quiet: true,
});
const mongoose = require(path.join(serverDir, "node_modules", "mongoose"));
const User = require(path.join(serverDir, "models", "User"));

(async () => {
  const { MONGODB_URI, SYSTEM_TEST_ADMIN_EMAIL, SYSTEM_TEST_ADMIN_PASSWORD } =
    process.env;
  if (!MONGODB_URI || !SYSTEM_TEST_ADMIN_EMAIL || !SYSTEM_TEST_ADMIN_PASSWORD) {
    console.error(
      "Set MONGODB_URI, SYSTEM_TEST_ADMIN_EMAIL and SYSTEM_TEST_ADMIN_PASSWORD in server/.env"
    );
    process.exit(1);
  }
  await mongoose.connect(MONGODB_URI);
  let admin = await User.findOne({ email: SYSTEM_TEST_ADMIN_EMAIL.toLowerCase() });
  if (!admin) {
    admin = new User({
      name: "System Test Admin",
      email: SYSTEM_TEST_ADMIN_EMAIL,
    });
  }
  admin.role = "admin";
  admin.password = SYSTEM_TEST_ADMIN_PASSWORD;
  await admin.save();
  console.log(`Administrator ready: ${admin.email}`);
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
