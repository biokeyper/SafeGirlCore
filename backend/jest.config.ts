import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  coveragePathIgnorePatterns: ["/node_modules/", "/dist/"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/?(*.)+(spec|test).ts"],
  collectCoverageFrom: [
    "services/**/*.ts",
    "controllers/**/*.ts",
    "middleware/**/*.ts",
    "!**/*.test.ts",
    "!**/node_modules/**"
  ],
  moduleFileExtensions: ["ts", "js", "json"],
  verbose: true,
  testTimeout: 30000
};

export default config;
