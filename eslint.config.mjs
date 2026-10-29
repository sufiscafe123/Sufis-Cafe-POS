import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'scripts/**'] },
  {
    // Screens ported unchanged from the original React app
    files: ['src/screens/**', 'src/customer/**', 'src/components/**', 'src/context/**'],
    rules: {
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@next/next/no-img-element': 'off',
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    files: ['tests/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
];

export default config;
