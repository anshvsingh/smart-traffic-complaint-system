const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), {
    serverSelectionTimeoutMS: 5000,
  });
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

test("Jest can connect to the in-memory MongoDB", () => {
  expect(mongoose.connection.readyState).toBe(1);
});
