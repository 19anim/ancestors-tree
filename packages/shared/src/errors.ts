import { z } from 'zod';

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
  UNAUTHENTICATED: {
    status: 401,
    description: 'There is no valid session, or it has expired.',
    clientAction: 'Redirect to the sign-in page.',
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
  }),
});

export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
