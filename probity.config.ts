import {
  defineConfig,
  enforceTdd,
  forbidContentPattern,
  requireCommand,
} from './src/index.js'

export default defineConfig({
  rules: [
    requireCommand({
      before: { kind: 'command', match: /git commit/ },
      command: /npm run checks/,
      after: { kind: 'write' },
      reason: 'Run `npm run checks` after the latest write before committing.',
    }),
    {
      files: ['src/**', 'test/**'],
      rules: [
        enforceTdd({
          maxEvents: 12,
          maxContentChars: 10000,
        }),
        forbidContentPattern({
          match: 'eslint-disable',
          reason: 'Fix the lint violation rather than disabling the rule',
        }),
      ],
    },
    {
      files: ['**/*.md'],
      rules: [
        forbidContentPattern({
          match: /\p{Extended_Pictographic}/u,
          reason: 'No emojis in documentation',
        }),
      ],
    },
  ],
})
