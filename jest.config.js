/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/*.test.ts"],
  // Ignore transient git worktrees created by tooling: their copies of the
  // repo otherwise collide in Jest's haste module map ("duplicate manual mock"
  // / duplicate test) and get collected as a second copy of every test.
  testPathIgnorePatterns: ["/node_modules/", "/.claude/worktrees/"],
  modulePathIgnorePatterns: ["/.claude/worktrees/"],
  collectCoverageFrom: ["src/lib/**/*.ts", "!src/lib/**/*.d.ts"],
};

module.exports = config;
