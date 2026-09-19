module.exports = {
  testEnvironment: "node",
  // tscの出力(*.js)が同じ場所に残っていても、常に.tsを優先して解決する
  moduleFileExtensions: ["ts", "js", "json"],
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
};
