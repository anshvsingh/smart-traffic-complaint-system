// General API behaviour: TC40-TC41 (see testing/test-cases.md).

const request = require("supertest");
const { app, useTestDatabase } = require("./helpers");

useTestDatabase();

describe("General API behaviour", () => {
  it("TC40 [BUG-005] malformed JSON gets a controlled JSON 400 without a stack trace", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email": "a@example.com", "password": ');

    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.text).not.toMatch(/at\s+\S+\s+\(.*\.js:\d+:\d+\)/); // no stack frames
  });

  it("TC41 health check works and unknown routes return a JSON 404", async () => {
    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);
    expect(health.body.status).toBe("ok");

    const missing = await request(app).get("/api/does-not-exist");
    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe("Route not found");
  });
});
