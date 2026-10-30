// Complaint test cases TC04, TC17-TC27 (see testing/test-cases.md).
// Tests tagged [BUG-xxx] are EXPECTED TO FAIL on the current main branch.

const request = require("supertest");
const { app, Complaint, useTestDatabase, createUser, tokenFor, createComplaint, VALID_COMPLAINT } = require("./helpers");

useTestDatabase();

let citizen, other, token, otherToken;

beforeEach(async () => {
  citizen = await createUser({ name: "Citizen A", email: "a@example.com" });
  other = await createUser({ name: "Citizen B", email: "b@example.com" });
  token = tokenFor(citizen);
  otherToken = tokenFor(other);
});

const submit = (body, t = token) =>
  request(app).post("/api/complaints").set("Authorization", `Bearer ${t}`).send(body);

describe("Submit complaint", () => {
  it("TC04 creates a complaint with valid information", async () => {
    const res = await submit(VALID_COMPLAINT);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Complaint submitted successfully");
    expect(res.body.complaint).toMatchObject({ ...VALID_COMPLAINT, user: citizen._id.toString() });
    expect(res.body.complaint._id).toBeDefined();
    expect(res.body.complaint.createdAt).toBeDefined();
    expect(await Complaint.countDocuments()).toBe(1);
  });

  it("TC21 a new complaint gets the default status 'Submitted'", async () => {
    const res = await submit(VALID_COMPLAINT);
    expect(res.body.complaint.status).toBe("Submitted");
  });

  it("TC22 a new complaint gets the default priority 'Medium'", async () => {
    const res = await submit(VALID_COMPLAINT);
    expect(res.body.complaint.priority).toBe("Medium");
  });

  it("TC19 rejects a complaint with missing fields and saves nothing", async () => {
    const { category, description, location } = VALID_COMPLAINT;
    const cases = [
      {},
      { description, location },
      { category, location },
      { category, description },
      { category: "  ", description, location },
    ];
    for (const body of cases) {
      const res = await submit(body);
      expect(res.status).toBe(400);
    }
    expect(await Complaint.countDocuments()).toBe(0);
  });

  it("TC20 [BUG-001] rejects a category that is not in the allowed list", async () => {
    const res = await submit({ ...VALID_COMPLAINT, category: "Not A Valid Category" });
    expect(res.status).toBe(400);
    expect(await Complaint.countDocuments()).toBe(0);
  });

  it("TC20b accepts every category offered by the citizen dashboard", async () => {
    // Values copied from client/src/Dashboard.jsx <select name="category">
    const categories = ["Pothole", "Traffic Signal", "Illegal Parking", "Road Blockage", "Traffic Congestion",
      "Street Lighting", "Accident", "Pedestrian Safety", "Road Sign", "Public Transport", "Other"];
    for (const category of categories) {
      const res = await submit({ ...VALID_COMPLAINT, category });
      expect(res.status).toBe(201);
    }
  });

  it("TC25 [BUG-002] rejects an over-long description with a controlled 400 (not a 500)", async () => {
    const res = await submit({ ...VALID_COMPLAINT, description: "x".repeat(2001) });
    expect(res.status).toBe(400);
  });

  it("TC26 ignores status, priority and owner supplied by the citizen", async () => {
    const res = await submit({ ...VALID_COMPLAINT, status: "Resolved", priority: "High", user: other._id.toString() });
    expect(res.status).toBe(201);
    expect(res.body.complaint.status).toBe("Submitted");
    expect(res.body.complaint.priority).toBe("Medium");
    expect(res.body.complaint.user).toBe(citizen._id.toString());
  });

  it("TC27 treats query-operator objects as invalid input", async () => {
    const res = await submit({ ...VALID_COMPLAINT, category: { $gt: "" } });
    expect(res.status).toBe(400);
  });
});

describe("Retrieve complaints", () => {
  it("TC17 lists only the logged-in citizen's complaints, newest first", async () => {
    await createComplaint(citizen, { description: "older" });
    await new Promise((r) => setTimeout(r, 15));
    await createComplaint(citizen, { description: "newer" });
    await createComplaint(other, { description: "someone else's" });

    const res = await request(app).get("/api/complaints").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.complaints.map((c) => c.description)).toEqual(["newer", "older"]);
  });

  it("TC18 retrieves an individual complaint the citizen owns", async () => {
    const complaint = await createComplaint(citizen);
    const res = await request(app).get(`/api/complaints/${complaint._id}`).set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.complaint._id).toBe(complaint._id.toString());
  });

  it("TC23 a citizen cannot read another citizen's complaint", async () => {
    const complaint = await createComplaint(other, { description: "private" });
    const res = await request(app).get(`/api/complaints/${complaint._id}`).set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("private");

    const ownerRes = await request(app)
      .get(`/api/complaints/${complaint._id}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(ownerRes.status).toBe(200);
  });

  it("TC24 rejects an invalid complaint ID format", async () => {
    const res = await request(app).get("/api/complaints/not-an-id").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("TC24b returns 404 for a well-formed ID that does not exist", async () => {
    const res = await request(app)
      .get("/api/complaints/64b7f0f0f0f0f0f0f0f0f0f0")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
