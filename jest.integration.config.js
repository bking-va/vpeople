const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  testEnvironment: 'node',
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
