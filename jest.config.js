module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/backend/tests/**/*.test.js'],
  collectCoverageFrom: [
    'backend/controllers/authController.js',
    'backend/controllers/vendorController.js',
    'backend/controllers/quotationController.js'
  ],
  coverageReporters: ['text', 'text-summary', 'lcov'],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80
    }
  },
  verbose: true,
  clearMocks: true
};
