module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};
