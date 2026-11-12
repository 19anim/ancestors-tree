/**
 * The letter shown on a card without a photo. Vietnamese names put the given name last,
 * and that is the name people are called by.
 */
export function initialsOf(name: string): string {
  const lastWord = name.trim().split(/\s+/).at(-1);
  if (!lastWord) return '?';
  return lastWord.normalize('NFC').charAt(0).toLocaleUpperCase('vi');
}
