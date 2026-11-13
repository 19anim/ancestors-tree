# API error codes

> Generated from `packages/shared/src/errors.ts` by `pnpm docs:errors`. Do not edit by hand.

Every API error response has this shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request body", "details": [{ "path": "body.name", "message": "Too small" }] } }
```

| Code | HTTP status | Meaning | Client handling |
| --- | --- | --- | --- |
| `VALIDATION_ERROR` | 400 | The request data failed validation; `details` lists each problem. | Show the field errors next to the inputs. |
| `INVALID_TOKEN` | 400 | The link (password reset or invite) is wrong, has expired or was already used. | Explain that the link no longer works and offer to get a new one. |
| `UNAUTHENTICATED` | 401 | There is no valid session, or it has expired. | Redirect to the sign-in page. |
| `INVALID_CREDENTIALS` | 401 | The email or password is wrong (the response never says which). | Show the message on the sign-in form; do not redirect. |
| `FORBIDDEN` | 403 | The user is signed in but their role does not allow this action. | Show a "no permission" message; do not retry. |
| `NOT_FOUND` | 404 | The requested resource or route does not exist. | Show a not-found state. |
| `EMAIL_TAKEN` | 409 | An account with this email already exists. | Show the message next to the email field and offer sign-in or password reset. |
| `VERSION_CONFLICT` | 409 | The tree changed after the client's baseVersion; newer operations must be fetched first. | Fetch missing operations, rebase pending changes, then resend. |
| `RULE_VIOLATION` | 422 | The change breaks a genealogy business rule enforced by applyOp. | Show the reason and discard the change. |
| `RATE_LIMITED` | 429 | Too many requests in a short time window. | Wait, then retry with exponential backoff. |
| `INTERNAL_ERROR` | 500 | An unexpected server error occurred; details are only in the server logs. | Show a generic error with a retry button. |

## `RULE_VIOLATION` reasons

A `RULE_VIOLATION` response also names the rule that `applyOp` refused, so the client can explain it:

```json
{ "error": { "code": "RULE_VIOLATION", "message": "A person who still has children cannot be deleted.", "reason": "PERSON_HAS_CHILDREN" } }
```

| Reason | Meaning |
| --- | --- |
| `INVALID_ID` | An id is not a 24-character lowercase hex ObjectId. |
| `DUPLICATE_ID` | The id of a new person or union is already used. |
| `PERSON_NOT_FOUND` | The person does not exist in this family tree. |
| `UNION_NOT_FOUND` | The union (marriage) does not exist in this family tree. |
| `PERSON_HAS_CHILDREN` | A person who still has children cannot be deleted. |
| `UNION_HAS_CHILDREN` | A union that still has children cannot be deleted. |
| `PROGENITOR_PROTECTED` | The progenitor cannot be deleted; choose another progenitor first. |
| `CYCLE` | The change would make someone their own ancestor. |
| `INVALID_PARTNERS` | A union needs one or two different people (including the restored person). |
| `RESTORE_CONFLICT` | The person cannot be restored: one of their unions has changed partners. |
| `TREE_FULL` | The family tree already has the maximum of 5,000 people. |
