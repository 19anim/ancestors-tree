import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderErrorCodesMarkdown } from '../src/errors-doc.ts';

const target = fileURLToPath(new URL('../../../docs/error-codes.md', import.meta.url));
const expected = renderErrorCodesMarkdown();

if (process.argv.includes('--check')) {
  const current = await readFile(target, 'utf8').catch(() => '');
  if (current !== expected) {
    console.error('docs/error-codes.md is out of date. Run: pnpm docs:errors');
    process.exit(1);
  }
  console.log('docs/error-codes.md is up to date.');
} else {
  await writeFile(target, expected, 'utf8');
  console.log('Wrote docs/error-codes.md');
}
