/**
 * Why `applyOp` refused a change. The API sends the code as `reason` in a RULE_VIOLATION body,
 * docs/error-codes.md lists these descriptions, and the web translates every code.
 */
export const OP_ERROR_CODES = {
  INVALID_ID: 'An id is not a 24-character lowercase hex ObjectId.',
  DUPLICATE_ID: 'The id of a new person or union is already used.',
  PERSON_NOT_FOUND: 'The person does not exist in this family tree.',
  UNION_NOT_FOUND: 'The union (marriage) does not exist in this family tree.',
  PERSON_HAS_CHILDREN: 'A person who still has children cannot be deleted.',
  UNION_HAS_CHILDREN: 'A union that still has children cannot be deleted.',
  PROGENITOR_PROTECTED: 'The progenitor cannot be deleted; choose another progenitor first.',
  CYCLE: 'The change would make someone their own ancestor.',
  INVALID_PARTNERS: 'A union needs one or two different people (including the restored person).',
  RESTORE_CONFLICT: 'The person cannot be restored: one of their unions has changed partners.',
  TREE_FULL: 'The family tree already has the maximum of 5,000 people.',
} as const satisfies Record<string, string>;

export type OpErrorCode = keyof typeof OP_ERROR_CODES;

export const OP_ERROR_CODE_LIST = Object.keys(OP_ERROR_CODES) as [OpErrorCode, ...OpErrorCode[]];

export class OpError extends Error {
  readonly code: OpErrorCode;

  constructor(code: OpErrorCode, message: string = OP_ERROR_CODES[code]) {
    super(message);
    this.name = 'OpError';
    this.code = code;
  }
}
