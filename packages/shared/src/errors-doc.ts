import { ERROR_CODE_LIST, ERROR_CODES } from './errors.ts';

const escapeCell = (text: string): string => text.replaceAll('|', '\\|');

export function renderErrorCodesMarkdown(): string {
  const rows = ERROR_CODE_LIST.map((code) => {
    const info = ERROR_CODES[code];
    return `| \`${code}\` | ${info.status} | ${escapeCell(info.description)} | ${escapeCell(info.clientAction)} |`;
  });

  return [
    '# API error codes',
    '',
    '> Generated from `packages/shared/src/errors.ts` by `pnpm docs:errors`. Do not edit by hand.',
    '',
    'Every API error response has this shape:',
    '',
    '```json',
    '{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request body", "details": [{ "path": "body.name", "message": "Too small" }] } }',
    '```',
    '',
    '| Code | HTTP status | Meaning | Client handling |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}
