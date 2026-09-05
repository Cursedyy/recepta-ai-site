module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: ['eslint:recommended'],
  parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 2020 },
  rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] },
};
