// Тесты гоняют в Node только чистые модули логики, без импортов React Native,
// см. conventions-and-status.md.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
};
