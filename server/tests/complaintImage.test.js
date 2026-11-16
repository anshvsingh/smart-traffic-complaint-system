// Image upload, AI prediction integration and API error handling.
// STP cases TC-CMP-06 … TC-CMP-08, TC-AI-01 … TC-AI-03, TC-SEC-06 and TC-SEC-08.
// The DL service is replaced by a mocked global fetch.
const fs = require("fs");
const path = require("path");
const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../app");
const User = require("../models/User");
const Complaint = require("../models/Complaint");

const UPLOADS = path.join(__dirname, "..", "uploads");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let mongoServer;
let citizen;
let token;
let uploadsBefore;
let fetchSpy;

const validPrediction = {
  success: true,
  prediction: {
    category: "Pothole",
    confidence: 0.91,
    probabilities: { "Road Damage": 0.05, "Normal Road": 0.04, Pothole: 0.91 },
  },
};

const mockFetch = (impl) => {
  fetchSpy = jest.spyOn(global, "fetch").mockImplementation(impl);
};

const okResponse = (body) => async () => ({
  ok: true,
  status: 200,
  json: async () => body,
});

function submit({ file, filename = "road.jpg", contentType = "image/jpeg", fields = {} } = {}) {
  const req = request(app)
    .post("/api/complaints")
    .set("Authorization", `Bearer ${token}`)
    .field("category", fields.category ?? "Pothole")
    .field("description", fields.description ?? "Large pothole in the left lane")
    .field("location", fields.location ?? "Outer Ring Road");
  return file ? req.attach("image", file, { filename, contentType }) : req;
}

const listUploads = () =>
  fs.existsSync(UPLOADS) ? new Set(fs.readdirSync(UPLOADS)) : new Set();

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-key";
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  await Complaint.deleteMany({});
  await User.deleteMany({});
  citizen = await User.create({
    name: "Citizen",
    email: "citizen@example.com",
    password: "Password123",
  });
  token = jwt.sign({ sub: citizen._id.toString() }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
  uploadsBefore = listUploads();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  // Remove only the files created by this test.
  for (const name of listUploads()) {
    if (!uploadsBefore.has(name)) fs.unlinkSync(path.join(UPLOADS, name));
  }
  jest.restoreAllMocks();
});

const newUploads = () => [...listUploads()].filter((n) => !uploadsBefore.has(n));

describe("Image upload with AI prediction", () => {
  test("stores a JPEG and records a completed prediction", async () => {
    mockFetch(okResponse(validPrediction));

    const response = await submit({ file: JPEG });

    expect(response.status).toBe(201);
    const { complaint } = response.body;
    expect(complaint.imageUrl).toMatch(/^\/uploads\/[0-9a-f-]{36}\.jpg$/);
    expect(complaint.aiPrediction.status).toBe("Completed");
    expect(complaint.aiPrediction.category).toBe("Pothole");
    expect(complaint.aiPrediction.confidence).toBe(0.91);
    expect(complaint.aiPrediction.probabilities.Pothole).toBe(0.91);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(newUploads()).toHaveLength(1);
  });

  test("calls the configured DL_API_URL", async () => {
    process.env.DL_API_URL = "http://dl.test/predict";
    mockFetch(okResponse(validPrediction));

    await submit({ file: JPEG });

    expect(fetchSpy.mock.calls[0][0]).toBe("http://dl.test/predict");
    delete process.env.DL_API_URL;
  });

  test("names a PNG upload with a .png extension, ignoring the client file name", async () => {
    mockFetch(okResponse(validPrediction));

    const response = await submit({
      file: PNG,
      filename: "evil.html",
      contentType: "image/png",
    });

    expect(response.status).toBe(201);
    expect(response.body.complaint.imageUrl).toMatch(/\.png$/);
  });

  test("serves uploaded images with the nosniff header", async () => {
    mockFetch(okResponse(validPrediction));
    const created = await submit({ file: JPEG });

    const response = await request(app).get(created.body.complaint.imageUrl);

    expect(response.status).toBe(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  test("keeps Not Requested when no image is attached and does not call the DL service", async () => {
    mockFetch(okResponse(validPrediction));

    const response = await submit();

    expect(response.status).toBe(201);
    expect(response.body.complaint.aiPrediction.status).toBe("Not Requested");
    expect(response.body.complaint.imageUrl).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("AI failure does not block the complaint", () => {
  test.each([
    ["the DL service is unreachable", async () => {
      throw new TypeError("fetch failed");
    }],
    ["the DL service returns HTTP 500", async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })],
    ["the DL service reports success: false", okResponse({ success: false })],
    ["the confidence is not a number", okResponse({
      success: true,
      prediction: { category: "Pothole", confidence: "high" },
    })],
    ["the request times out", async () => {
      const error = new Error("The operation was aborted due to timeout");
      error.name = "TimeoutError";
      throw error;
    }],
  ])("records Failed when %s", async (_label, impl) => {
    mockFetch(impl);

    const response = await submit({ file: JPEG });

    expect(response.status).toBe(201);
    expect(response.body.complaint.aiPrediction.status).toBe("Failed");
    expect(response.body.complaint.aiPrediction.category).toBeNull();
    expect(await Complaint.countDocuments()).toBe(1);
  });
});

describe("Upload validation", () => {
  test("rejects a GIF image", async () => {
    mockFetch(okResponse(validPrediction));

    const response = await submit({
      file: Buffer.from("GIF89a"),
      filename: "road.gif",
      contentType: "image/gif",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Only JPG and PNG images are allowed");
    expect(await Complaint.countDocuments()).toBe(0);
    expect(newUploads()).toHaveLength(0);
  });

  test("rejects an image larger than 10 MB", async () => {
    mockFetch(okResponse(validPrediction));
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0xff);

    const response = await submit({ file: big });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Image must be 10 MB or smaller");
    expect(await Complaint.countDocuments()).toBe(0);
  });

  test("rejects more than one image", async () => {
    const response = await submit({ file: JPEG }).attach("image", JPEG, {
      filename: "second.jpg",
      contentType: "image/jpeg",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Image upload error");
  });

  test("deletes the stored image when the category is invalid", async () => {
    mockFetch(okResponse(validPrediction));

    const response = await submit({
      file: JPEG,
      fields: { category: "Flying Cars" },
    });

    expect(response.status).toBe(400);
    expect(newUploads()).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("deletes the stored image when a required field is missing", async () => {
    const response = await submit({ file: JPEG, fields: { location: " " } });

    expect(response.status).toBe(400);
    expect(newUploads()).toHaveLength(0);
  });

  test("deletes the stored image when the description is too long", async () => {
    mockFetch(okResponse(validPrediction));

    const response = await submit({
      file: JPEG,
      fields: { description: "d".repeat(2001) },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "Description must be 2000 characters or fewer"
    );
    expect(newUploads()).toHaveLength(0);
  });
});

describe("API error handling", () => {
  test("returns JSON 400 for malformed JSON without a stack trace", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email": "a@b.com",');

    expect(response.status).toBe(400);
    expect(response.headers["content-type"]).toMatch(/json/);
    expect(response.body.message).toBe("Malformed JSON in request body");
    expect(JSON.stringify(response.body)).not.toMatch(/at .*\.js/);
  });

  test("returns a generic 500 for an unexpected error", async () => {
    jest
      .spyOn(Complaint, "find")
      .mockImplementation(() => {
        throw new Error("database exploded");
      });

    const response = await request(app)
      .get("/api/complaints")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Unable to fetch complaints");
    expect(JSON.stringify(response.body)).not.toMatch(/exploded/);
  });
});
