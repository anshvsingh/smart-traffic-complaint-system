
const request = require("supertest");
const app = require("../app");

describe("Smart Traffic Complaint API", () => {
  describe("GET /", () => {
    it("should return the API welcome message", async () => {
      const response = await request(app).get("/");

      expect(response.statusCode).toBe(200);
      expect(response.body.message).toBe(
        "Welcome to the Smart Traffic Complaint and Monitoring System API"
      );
    });
  });

  describe("GET /api/health", () => {
    it("should return a healthy status", async () => {
      const response = await request(app).get("/api/health");

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual({
        status: "ok",
        message: "Smart Traffic Complaint API is running",
      });
    });
  });

  describe("Unknown routes", () => {
    it("should return 404 for an unknown endpoint", async () => {
      const response = await request(app).get("/api/not-a-real-route");

      expect(response.statusCode).toBe(404);
      expect(response.body).toEqual({
        status: "error",
        message: "Route not found",
      });
    });
  });

  describe("Complaint authentication", () => {
    it("should reject requests without a token", async () => {
      const response = await request(app).get("/api/complaints");

      expect(response.statusCode).toBe(401);
      expect(response.body.message).toBe("Authentication required");
    });

    it("should reject complaint creation without a token", async () => {
      const response = await request(app)
        .post("/api/complaints")
        .send({
          category: "Pothole",
          description: "Automated test complaint",
          location: "Test location",
        });

      expect(response.statusCode).toBe(401);
      expect(response.body.message).toBe("Authentication required");
    });
  });

  describe("Admin authorization", () => {
    it("should reject requests without a token", async () => {
      const response = await request(app).get("/api/admin/complaints");

      expect(response.statusCode).toBe(401);
      expect(response.body.message).toBe("Authentication required");
    });
  });
});
