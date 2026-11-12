# API error codes

> Generated from `packages/shared/src/errors.ts` by `pnpm docs:errors`. Do not edit by hand.

Every API error response has this shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request body", "details": [{ "path": "body.name", "message": "Too small" }] } }
```

| Code | HTTP status | Meaning | Client handling |
| --- | --- | --- | --- |
| `VALIDATION_ERROR` | 400 | The request data failed validation; `details` lists each problem. | Show the field errors next to the inputs. |
| `UNAUTHENTICATED` | 401 | There is no valid session, or it has expired. | Redirect to the sign-in page. |
| `FORBIDDEN` | 403 | The user is signed in but their role does not allow this action. | Show a "no permission" message; do not retry. |
| `NOT_FOUND` | 404 | The requested resource or route does not exist. | Show a not-found state. |
| `VERSION_CONFLICT` | 409 | The tree changed after the client's baseVersion; newer operations must be fetched first. | Fetch missing operations, rebase pending changes, then resend. |
| `RULE_VIOLATION` | 422 | The change breaks a genealogy business rule enforced by applyOp. | Show the reason and discard the change. |
| `RATE_LIMITED` | 429 | Too many requests in a short time window. | Wait, then retry with exponential backoff. |
| `INTERNAL_ERROR` | 500 | An unexpected server error occurred; details are only in the server logs. | Show a generic error with a retry button. |
