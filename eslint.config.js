export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_|^next$|^req$|^res$' }],
      'no-console': 'warn',
    },
  },
  {
    ignores: ['node_modules/', 'uploads/', 'coverage/'],
  },
];
