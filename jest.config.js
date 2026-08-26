/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/*.test.ts"],
  // Scoring integration cases intentionally exercise bounded external-data
  // fallbacks; 5s is occasionally shorter than their documented timeout.
  testTimeout: 10000,
  collectCoverageFrom: ["src/lib/**/*.ts", "!src/lib/**/*.d.ts"],
};

module.exports = config;
