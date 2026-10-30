// Shared setup for the QA suite: in-memory MongoDB + helpers to create users/tokens.
// Mirrors the pattern already used in server/tests so results are comparable.

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../../server/app");
const User = require("../../server/models/User");
const Complaint = require("../../server/models/Complaint");

const JWT_SECRET = "qa-test-only-secret";
let mongoServer;

function useTestDatabase() {
  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri(), { serverSelectionTimeoutMS: 10000 });
    await User.init(); // make sure the unique email index exists before duplicate tests
  }, 120000);

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Complaint.deleteMany({})]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });
}

async function createUser(overrides = {}) {
  return User.create({
    name: "QA Citizen",
    email: `citizen${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: "Password123",
    role: "citizen",
    ...overrides,
  });
}

// Same token shape the real /login route issues: { role } with subject = user id
function tokenFor(user, { secret = JWT_SECRET, expiresIn = "1h", role } = {}) {
  return jwt.sign({ role: role || user.role }, secret, {
    subject: user._id.toString(),
    expiresIn,
  });
}

async function createComplaint(user, overrides = {}) {
  return Complaint.create({
    user: user._id,
    category: "Pothole",
    description: "Large pothole near the bus stop",
    location: "Outer Ring Road, Bengaluru",
    ...overrides,
  });
}

const VALID_COMPLAINT = {
  category: "Pothole",
  description: "Large pothole near the bus stop",
  location: "Outer Ring Road, Bengaluru",
};

module.exports = {
  app,
  User,
  Complaint,
  JWT_SECRET,
  useTestDatabase,
  createUser,
  tokenFor,
  createComplaint,
  VALID_COMPLAINT,
};
