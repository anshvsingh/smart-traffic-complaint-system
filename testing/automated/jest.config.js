// Jest config for the QA test suite in testing/automated.
// It reuses the backend's own node_modules, so nothing new is installed and
// no backend file is changed. Run from the server folder:
//
//   cd server
//   npm install                      # once
//   npm run test -- -c ../testing/automated/jest.config.js
//
// or simply:  bash testing/run-tests.sh

const path = require("path");

module.exports = {
  rootDir: __dirname,
  testEnvironment: "node",
  testMatch: ["<rootDir>/**/*.test.js"],
  // Resolve supertest, mongoose, jsonwebtoken, mongodb-memory-server from server/node_modules
  modulePaths: [path.resolve(__dirname, "../../server/node_modules")],
  testTimeout: 60000,
  verbose: true,
};
