/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/\\.next/"],
  collectCoverageFrom: [
    "src/lib/**/*.ts",
    "src/hooks/**/*.ts",
    "!src/lib/**/*.d.ts",
  ],
};

module.exports = config;
