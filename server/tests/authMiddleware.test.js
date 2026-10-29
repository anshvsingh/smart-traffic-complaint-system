const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../app");
const User = require("../models/User");

let mongoServer;
let citizen;
let citizenToken;
let originalSecret;

beforeAll(async () => {
  originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "middleware-test-secret";

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();

  if (originalSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalSecret;
  }
});

beforeEach(async () => {
  process.env.JWT_SECRET = "middleware-test-secret";
  await User.deleteMany({});

  citizen = await User.create({
    name: "Middleware Test Citizen",
    email: "middleware@example.com",
    password: "Password123!",
    role: "citizen",
  });

  citizenToken = jwt.sign(
    { sub: citizen._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
});

describe("Authentication middleware", () => {
  test("rejects a malformed token", async () => {
    const response = await request(app)
      .get("/api/complaints")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid or expired authentication");
  });

  test("rejects an expired token", async () => {
    const expiredToken = jwt.sign(
      { sub: citizen._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: -1 }
    );

    const response = await request(app)
      .get("/api/complaints")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid or expired authentication");
  });

  test("rejects a valid token for a user who no longer exists", async () => {
    const deletedUserId = new mongoose.Types.ObjectId();

    const token = jwt.sign(
      { sub: deletedUserId.toString() },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/complaints")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid or expired authentication");
  });

  test("rejects a token signed with a different secret", async () => {
    const wrongSecretToken = jwt.sign(
      { sub: citizen._id.toString() },
      "different-secret",
      { expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/complaints")
      .set("Authorization", `Bearer ${wrongSecretToken}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid or expired authentication");
  });

  test("rejects a request when JWT_SECRET is not configured", async () => {
    delete process.env.JWT_SECRET;

    const response = await request(app)
      .get("/api/complaints")
      .set("Authorization", `Bearer ${citizenToken}`);

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Authentication is not configured");
  });
});
