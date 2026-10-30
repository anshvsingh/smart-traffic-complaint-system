// Admin test cases TC06, TC28-TC39 (see testing/test-cases.md).

const request = require("supertest");
const { app, Complaint, useTestDatabase, createUser, tokenFor, createComplaint } = require("./helpers");

useTestDatabase();

let citizen, admin, citizenToken, adminToken;

beforeEach(async () => {
  citizen = await createUser({ name: "Citizen", email: "citizen@example.com" });
  admin = await createUser({ name: "Admin", email: "admin@example.com", role: "admin" });
  citizenToken = tokenFor(citizen);
  adminToken = tokenFor(admin);
});

const asAdmin = (req) => req.set("Authorization", `Bearer ${adminToken}`);
const patch = (id, body, t = adminToken) =>
  request(app).patch(`/api/admin/complaints/${id}`).set("Authorization", `Bearer ${t}`).send(body);

describe("Admin login and access", () => {
  it("TC28 an administrator can log in and receives role 'admin'", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "admin@example.com", password: "Password123" });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("admin");

    const list = await request(app).get("/api/admin/complaints").set("Authorization", `Bearer ${res.body.token}`);
    expect(list.status).toBe(200);
  });

  it("TC06 a citizen is denied on every admin route", async () => {
    const complaint = await createComplaint(citizen);
    const calls = [
      request(app).get("/api/admin/complaints"),
      request(app).get("/api/admin/dashboard"),
      request(app).patch(`/api/admin/complaints/${complaint._id}`).send({ status: "Resolved" }),
    ];
    for (const call of calls) {
      const res = await call.set("Authorization", `Bearer ${citizenToken}`);
      expect(res.status).toBe(403);
    }
  });

  it("TC37 admin routes reject requests without a token", async () => {
    for (const call of [request(app).get("/api/admin/complaints"), request(app).get("/api/admin/dashboard")]) {
      const res = await call;
      expect(res.status).toBe(401);
    }
  });

  it("TC38 a citizen token that CLAIMS role=admin is still denied (role comes from the database)", async () => {
    const forgedRole = tokenFor(citizen, { role: "admin" });
    const res = await request(app).get("/api/admin/complaints").set("Authorization", `Bearer ${forgedRole}`);
    expect(res.status).toBe(403);
  });
});

describe("Admin complaint management", () => {
  it("TC29 retrieves all complaints with the citizen's name and email", async () => {
    const other = await createUser({ name: "Other", email: "other@example.com" });
    await createComplaint(citizen);
    await createComplaint(other);

    const res = await asAdmin(request(app).get("/api/admin/complaints"));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.complaints[0].user).toHaveProperty("email");
    expect(res.body.complaints[0].user).not.toHaveProperty("password");
  });

  it("TC30 dashboard counts match the stored complaints", async () => {
    await createComplaint(citizen);
    await createComplaint(citizen);
    await createComplaint(citizen, { status: "Resolved" });

    const res = await asAdmin(request(app).get("/api/admin/dashboard"));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.byStatus).toEqual({ Submitted: 2, Resolved: 1 });
  });

  it("TC31 updates a complaint's status", async () => {
    const complaint = await createComplaint(citizen);
    const res = await patch(complaint._id, { status: "In Progress" });
    expect(res.status).toBe(200);
    expect(res.body.complaint.status).toBe("In Progress");
    expect((await Complaint.findById(complaint._id)).status).toBe("In Progress");
  });

  it("TC32 updates a complaint's priority", async () => {
    const complaint = await createComplaint(citizen);
    const res = await patch(complaint._id, { priority: "High" });
    expect(res.status).toBe(200);
    expect(res.body.complaint.priority).toBe("High");
    expect((await Complaint.findById(complaint._id)).priority).toBe("High");
  });

  it("TC33 rejects a status outside the allowed list and keeps the old value", async () => {
    const complaint = await createComplaint(citizen);
    const res = await patch(complaint._id, { status: "Closed" });
    expect(res.status).toBe(400);
    expect((await Complaint.findById(complaint._id)).status).toBe("Submitted");
  });

  it("TC34 rejects a priority outside the allowed list", async () => {
    const complaint = await createComplaint(citizen);
    const res = await patch(complaint._id, { priority: "Urgent" });
    expect(res.status).toBe(400);
    expect((await Complaint.findById(complaint._id)).priority).toBe("Medium");
  });

  it("TC35 rejects an update with neither status nor priority", async () => {
    const complaint = await createComplaint(citizen);
    const res = await patch(complaint._id, { description: "changed by admin" });
    expect(res.status).toBe(400);
    expect((await Complaint.findById(complaint._id)).description).toBe("Large pothole near the bus stop");
  });

  it("TC36 handles invalid and unknown complaint IDs", async () => {
    expect((await patch("not-an-id", { status: "Resolved" })).status).toBe(400);
    expect((await patch("64b7f0f0f0f0f0f0f0f0f0f0", { status: "Resolved" })).status).toBe(404);
  });

  it("TC39 a citizen cannot change status or priority", async () => {
    const complaint = await createComplaint(citizen);
    const res = await patch(complaint._id, { status: "Resolved", priority: "High" }, citizenToken);
    expect(res.status).toBe(403);
    const saved = await Complaint.findById(complaint._id);
    expect(saved.status).toBe("Submitted");
    expect(saved.priority).toBe("Medium");
  });
});
