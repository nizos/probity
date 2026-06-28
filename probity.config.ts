import {
  defineConfig,
  enforceTdd,
  forbidCommandPattern,
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
    forbidCommandPattern({
      match: /(?:^|[;&|])\s*find\s/,
      reason:
        'Use the Glob tool (by name) or Grep tool (by content), not find.',
    }),
    forbidCommandPattern({
      match: /(?:^|[;&|])\s*sed\s/,
      reason:
        'Use the Read tool (ranges via offset/limit) or Grep (-A/-B/-C), not sed.',
    }),
    forbidCommandPattern({
      match:
        /(?:^|[;&|])\s*echo\b[^;&|]*?(?<![-=])>>?\s*(?!&\d)(?!\/dev\/null)\S/,
      reason: 'Use the Write/Edit tool to write files, not echo redirection.',
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
