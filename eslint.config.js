const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  {
    files: ["server/**/*.ts"],
    ignores: ["dist/*", "server_dist/*", "node_modules/*"],
    rules: {
      "no-unused-vars": "warn",
    },
  },
]);
