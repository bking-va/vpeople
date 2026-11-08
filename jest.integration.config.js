const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  testEnvironment: 'node',
  // One Postgres DB is shared across the suite. Parallel workers race on
  // afterAll cleanup (especially audit_logs), which made global counts flake.
  maxWorkers: 1,
  forceExit: true,
  setupFiles: ['<rootDir>/__tests__/integration/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(next-auth|@auth)/)',
  ],
  testMatch: [
    '**/__tests__/integration/**/*.test.ts',
  ],
}

module.exports = createJestConfig(customJestConfig)
