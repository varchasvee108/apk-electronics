/** Jest runs the pure-TypeScript simulation core (no React Native). */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/sim-core', '<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: '<rootDir>/sim-core/tsconfig.json' }] },
  moduleNameMapper: { '^@sim/(.*)$': '<rootDir>/sim-core/src/$1', '^@/(.*)$': '<rootDir>/src/$1' },
};
