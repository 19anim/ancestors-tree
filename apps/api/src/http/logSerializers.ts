const REDACTED = '[redacted]';
const INVITE_PATH = /^(\/api\/invites\/)[^/]+(\/accept)?\/?$/i;
const NO_QUERY_PATH = /^\/api\/auth\/(google\/|reset-password\/?$)/i;

/**
 * Keeps secrets out of the request log: invite tokens in the path, and the OAuth code, state and
 * returnTo in the query of the Google endpoints. Other query strings are left alone.
 */
export function maskUrl(url: string): string {
  const queryAt = url.indexOf('?');
  const path = queryAt === -1 ? url : url.slice(0, queryAt);
  const query = queryAt === -1 ? '' : url.slice(queryAt);
  const invite = INVITE_PATH.exec(path);
  if (invite) return `${invite[1]}[token]${invite[2] ?? ''}${query}`;
  if (NO_QUERY_PATH.test(path)) return path;
  return url;
}

/** pino-http hands the serializers an already serialized request: change it, do not redo it. */
interface LoggedRequest {
  url: string;
  headers: Record<string, unknown>;
  query?: unknown;
}

export function serializeRequest<T extends LoggedRequest>(req: T): T {
  const hidesQuery = maskUrl(req.url) !== req.url;
  req.url = maskUrl(req.url);
  // The query is logged separately from the URL.
  if (hidesQuery && req.query !== undefined) req.query = {};
  // The Referer can be /join/<token>. Copied: the headers object is the live request's.
  if (req.headers.referer !== undefined) req.headers = { ...req.headers, referer: REDACTED };
  return req;
}

interface LoggedResponse {
  headers?: Record<string, unknown>;
}

export function serializeResponse<T extends LoggedResponse>(res: T): T {
  // Location can carry a returnTo with an invite token.
  if (res.headers?.location !== undefined) res.headers = { ...res.headers, location: REDACTED };
  return res;
}
