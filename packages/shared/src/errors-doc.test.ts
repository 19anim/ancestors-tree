import { describe, expect, it } from 'vitest';
import { renderErrorCodesMarkdown } from './errors-doc.ts';
import { ERROR_CODE_LIST, ERROR_CODES } from './errors.ts';

describe('renderErrorCodesMarkdown', () => {
  const markdown = renderErrorCodesMarkdown();

  it('starts with a title and a do-not-edit notice', () => {
    expect(markdown.startsWith('# API error codes\n')).toBe(true);
    expect(markdown).toContain('Do not edit by hand');
  });

  it('has one table row per error code with its HTTP status', () => {
    for (const code of ERROR_CODE_LIST) {
      expect(markdown).toContain(`| \`${code}\` | ${ERROR_CODES[code].status} |`);
    }
  });

  it('is deterministic and ends with a newline', () => {
    expect(renderErrorCodesMarkdown()).toBe(markdown);
    expect(markdown.endsWith('\n')).toBe(true);
  });
});
