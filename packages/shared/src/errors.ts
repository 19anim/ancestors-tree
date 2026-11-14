import { z } from 'zod';
import { OP_ERROR_CODE_LIST } from './tree/op-error.ts';

interface ErrorCodeInfo {
  status: number;
  description: string;
  clientAction: string;
}

/** Single source of truth for API error codes. docs/error-codes.md is generated from this table. */
export const ERROR_CODES = {
  VALIDATION_ERROR: {
    status: 400,
    description: 'The request data failed validation; `details` lists each problem.',
    clientAction: 'Show the field errors next to the inputs.',
  },
  INVALID_TOKEN: {
    status: 400,
    description: 'The link (password reset or invite) is wrong, has expired or was already used.',
    clientAction: 'Explain that the link no longer works and offer to get a new one.',
  },
  UNAUTHENTICATED: {
    status: 401,
    description: 'There is no valid session, or it has expired.',
    clientAction: 'Redirect to the sign-in page.',
  },
  INVALID_CREDENTIALS: {
    status: 401,
    description: 'The email or password is wrong (the response never says which).',
    clientAction: 'Show the message on the sign-in form; do not redirect.',
  },
  FORBIDDEN: {
    status: 403,
    description: 'The user is signed in but their role does not allow this action.',
    clientAction: 'Show a "no permission" message; do not retry.',
  },
  NOT_FOUND: {
    status: 404,
    description: 'The requested resource or route does not exist.',
    clientAction: 'Show a not-found state.',
  },
  EMAIL_TAKEN: {
    status: 409,
    description: 'An account with this email already exists.',
    clientAction: 'Show the message next to the email field and offer sign-in or password reset.',
  },
  VERSION_CONFLICT: {
    status: 409,
    description:
      "The tree changed after the client's baseVersion; newer operations must be fetched first.",
    clientAction: 'Fetch missing operations, rebase pending changes, then resend.',
  },
  RULE_VIOLATION: {
    status: 422,
    description: 'The change breaks a genealogy business rule enforced by applyOp.',
    clientAction: 'Show the reason and discard the change.',
  },
  RATE_LIMITED: {
    status: 429,
    description: 'Too many requests in a short time window.',
    clientAction: 'Wait, then retry with exponential backoff.',
  },
  INTERNAL_ERROR: {
    status: 500,
    description: 'An unexpected server error occurred; details are only in the server logs.',
    clientAction: 'Show a generic error with a retry button.',
  },
} as const satisfies Record<string, ErrorCodeInfo>;

export type ErrorCode = keyof typeof ERROR_CODES;

export const ERROR_CODE_LIST = Object.keys(ERROR_CODES) as [ErrorCode, ...ErrorCode[]];

export const ErrorDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODE_LIST),
    message: z.string(),
    details: z.array(ErrorDetailSchema).optional(),
    /** Only with RULE_VIOLATION: the rule applyOp refused (docs/error-codes.md lists them). */
    reason: z.enum(OP_ERROR_CODE_LIST).optional(),
  }),
});

export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
