/** @type {import('jest').Config} */
module.exports = {
  preset: 'react-native',
  testMatch: ['<rootDir>/src/__tests__/**/*.{ts,tsx}'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@testing-library)/)',
  ],
  moduleNameMapper: {
    '^expo-router$': '<rootDir>/src/__mocks__/expo-router.ts',
  },
};
