import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'dev-dist/**', 'coverage/**', '.local-services/**', '.local-models/**'] },
  {
    files: ['src/**/*.{ts,tsx}', 'scripts/**/*.{ts,mjs}', 'public/**/*.js', '*.ts'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } } },
    rules: {
      'constructor-super': 'error', 'for-direction': 'error', 'no-dupe-else-if': 'error',
      'no-loss-of-precision': 'error', 'no-sparse-arrays': 'error', 'no-unreachable': 'error',
      'no-unsafe-finally': 'error', 'valid-typeof': 'error', 'no-debugger': 'error',
    },
  },
  {
    files: ['src/pilot/**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: { '@typescript-eslint/no-explicit-any': 'error', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
);
