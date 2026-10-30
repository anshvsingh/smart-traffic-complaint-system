// Authentication test cases TC01-TC03, TC05, TC07-TC16 (see testing/test-cases.md).
// Tests tagged [BUG-xxx] are EXPECTED TO FAIL on the current main branch: they
// describe the correct behaviour and document a defect in testing/bug-reports/.

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { app, User, JWT_SECRET, useTestDatabase, createUser, tokenFor } = require("./helpers");

useTestDatabase();

const register = (body) => request(app).post("/api/auth/register").send(body);
const login = (body) => request(app).post("/api/auth/login").send(body);

describe("Registration", () => {
  it("TC01 registers a new citizen", async () => {
    const res = await register({ name: "Avyukt", email: "avyukt@example.com", password: "Password123" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.message).toBe("Registration successful");
    expect(res.body.user).toMatchObject({ name: "Avyukt", email: "avyukt@example.com", role: "citizen" });
    expect(res.body.user.password).toBeUndefined();
  });

  it("TC02 rejects an already registered email (case-insensitive)", async () => {
    await register({ name: "First", email: "dup@example.com", password: "Password123" });
    const res = await register({ name: "Second", email: "DUP@Example.com", password: "Password456" });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("An account with this email already exists");
    expect(await User.countDocuments({ email: "dup@example.com" })).toBe(1);
  });

  it("TC09 rejects registration with missing or invalid fields", async () => {
    const cases = [
      {},
      { email: "a@example.com", password: "Password123" },            // no name
      { name: "A", password: "Password123" },                         // no email
      { name: "A", email: "a@example.com" },                          // no password
      { name: "   ", email: "a@example.com", password: "Password123" }, // blank name
      { name: "A", email: "a@example.com", password: "short" },       // < 8 chars
    ];
    for (const body of cases) {
      const res = await register(body);
      expect(res.status).toBe(400);
    }
    expect(await User.countDocuments()).toBe(0);
  });

  it("TC13 ignores a role supplied by the client (no self-promotion to admin)", async () => {
    const res = await register({ name: "Sneaky", email: "sneaky@example.com", password: "Password123", role: "admin" });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("citizen");
    const saved = await User.findOne({ email: "sneaky@example.com" });
    expect(saved.role).toBe("citizen");
  });

  it("TC14 stores the password as a bcrypt hash and never returns it", async () => {
    await register({ name: "Hash", email: "hash@example.com", password: "Password123" });
    const saved = await User.findOne({ email: "hash@example.com" }).select("+password");

    expect(saved.password).not.toBe("Password123");
    expect(saved.password).toMatch(/^\$2[aby]\$/);

    const res = await login({ email: "hash@example.com", password: "Password123" });
    expect(JSON.stringify(res.body)).not.toContain(saved.password);
  });

  it("TC15 [BUG-004] rejects an email address with an invalid format", async () => {
    const res = await register({ name: "Bad Email", email: "not-an-email", password: "Password123" });
    expect(res.status).toBe(400);
  });

  it("TC16 [BUG-003] rejects an over-long name with a controlled 400 (not a 500)", async () => {
    const res = await register({ name: "x".repeat(101), email: "long@example.com", password: "Password123" });
    expect(res.status).toBe(400);
  });
});

describe("Login", () => {
  beforeEach(async () => {
    await createUser({ name: "Login User", email: "login@example.com", password: "Password123" });
  });

  it("TC03 logs in with valid credentials and the token opens a protected route", async () => {
    const res = await login({ email: "LOGIN@example.com", password: "Password123" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Login successful");
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user).toMatchObject({ email: "login@example.com", role: "citizen" });

    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.sub).toBe(res.body.user.id);

    const protectedRes = await request(app)
      .get("/api/complaints")
      .set("Authorization", `Bearer ${res.body.token}`);
    expect(protectedRes.status).toBe(200);
  });

  it("TC07 rejects an incorrect password", async () => {
    const res = await login({ email: "login@example.com", password: "WrongPassword" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
    expect(res.body.token).toBeUndefined();
  });

  it("TC08 gives the same answer for an unknown email (no account enumeration)", async () => {
    const res = await login({ email: "nobody@example.com", password: "Password123" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });

  it("TC08b rejects missing login fields and query-operator objects", async () => {
    const cases = [
      {},
      { email: "login@example.com" },
      { password: "Password123" },
      { email: { $gt: "" }, password: "Password123" },
      { email: "login@example.com", password: { $gt: "" } },
    ];
    for (const body of cases) {
      const res = await login(body);
      expect(res.status).toBe(400);
    }
  });
});

describe("Protected routes", () => {
  it("TC05 denies access without a token", async () => {
    const res = await request(app).get("/api/complaints");
    expect(res.status).toBe(401);
    expect(res.body.complaints).toBeUndefined();
  });

  it("TC10 denies access with a malformed token", async () => {
    for (const header of ["Bearer not-a-jwt", "Bearer ", "Token abc", "abc"]) {
      const res = await request(app).get("/api/complaints").set("Authorization", header);
      expect(res.status).toBe(401);
    }
  });

  it("TC11 denies access with a token signed by a different secret", async () => {
    const user = await createUser();
    const forged = tokenFor(user, { secret: "attacker-secret" });
    const res = await request(app).get("/api/complaints").set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it("TC12 denies access with an expired token", async () => {
    const user = await createUser();
    const expired = jwt.sign(
      { role: "citizen", sub: user._id.toString(), exp: Math.floor(Date.now() / 1000) - 60 },
      JWT_SECRET
    );
    const res = await request(app).get("/api/complaints").set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it("TC12b denies access when the token's user no longer exists", async () => {
    const user = await createUser();
    const token = tokenFor(user);
    await User.deleteOne({ _id: user._id });
    const res = await request(app).get("/api/complaints").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
