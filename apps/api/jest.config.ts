import type { Config } from "jest";

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  moduleNameMapper: {
    "^@klinika/api-contracts$": "<rootDir>/../../packages/api-contracts/src",
    "^@klinika/domain$": "<rootDir>/../../packages/domain/src"
  },
  testEnvironment: "node"
};

export default config;
