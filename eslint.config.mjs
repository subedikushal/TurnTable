import turntable from './packages/eslint-config/index.mjs';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/src/generated/**',
      'TurnTable_Coding_Handoff_Package/**',
    ],
  },
  ...turntable,
];
