module.exports = {
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  extends: ['eslint:recommended', 'prettier'],
  ignorePatterns: [
    'node_modules/',
    'persistent-builds-js/',
    'temp-builds/',
    'build-contract-optimized.js',
    'deploy-contract.js',
  ],
  overrides: [
    {
      files: ['tests/**/*.js'],
      env: { node: true, jest: true },
    },
  ],
};
