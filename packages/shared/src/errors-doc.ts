import { ERROR_CODE_LIST, ERROR_CODES } from './errors.ts';
import { OP_ERROR_CODE_LIST, OP_ERROR_CODES } from './tree/op-error.ts';

const escapeCell = (text: string): string => text.replaceAll('|', '\\|');

export function renderErrorCodesMarkdown(): string {
  const rows = ERROR_CODE_LIST.map((code) => {
    const info = ERROR_CODES[code];
    return `| \`${code}\` | ${info.status} | ${escapeCell(info.description)} | ${escapeCell(info.clientAction)} |`;
  });

  const reasonRows = OP_ERROR_CODE_LIST.map(
    (reason) => `| \`${reason}\` | ${escapeCell(OP_ERROR_CODES[reason])} |`,
  );

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
    '## `RULE_VIOLATION` reasons',
    '',
    'A `RULE_VIOLATION` response also names the rule that `applyOp` refused, so the client can explain it:',
    '',
    '```json',
    '{ "error": { "code": "RULE_VIOLATION", "message": "A person who still has children cannot be deleted.", "reason": "PERSON_HAS_CHILDREN" } }',
    '```',
    '',
    '| Reason | Meaning |',
    '| --- | --- |',
    ...reasonRows,
    '',
  ].join('\n');
}
