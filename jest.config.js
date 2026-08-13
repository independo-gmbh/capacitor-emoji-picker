module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testMatch: ['**/test/**/*.test.ts'],
  setupFiles: ['<rootDir>/test/setup/jsdom-dialog-polyfill.ts'],
};
