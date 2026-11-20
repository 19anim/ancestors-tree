/** What an email address becomes in an error report (spec §13.1). */
export const REDACTED_EMAIL = '[email]';

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;

export function redactEmails(text: string): string {
  return text.replace(EMAIL, REDACTED_EMAIL);
}

/**
 * The parts of a Sentry event the scrubber reads or removes. Structural, so `shared` does not
 * depend on an SDK: both @sentry/node and @sentry/react events fit it.
 */
export interface ScrubbableEvent {
  message?: string;
  exception?: { values?: { value?: string }[] };
  request?: unknown;
  user?: { id?: string | number };
  breadcrumbs?: unknown;
  extra?: unknown;
}

/**
 * No personal data leaves the app (spec §13.1): request data (body, cookies, headers, query
 * string), breadcrumbs (URLs and console text) and extras are dropped, the user keeps only an
 * id, and email addresses in the message and the exception values are redacted.
 */
export function scrubErrorEvent<E extends ScrubbableEvent>(event: E): E {
  const source: ScrubbableEvent = event;
  const { request: _request, breadcrumbs: _breadcrumbs, extra: _extra, user, ...rest } = source;
  const scrubbed: ScrubbableEvent = { ...rest };
  if (user?.id !== undefined) scrubbed.user = { id: user.id };
  if (rest.message !== undefined) scrubbed.message = redactEmails(rest.message);
  if (rest.exception?.values !== undefined) {
    scrubbed.exception = {
      ...rest.exception,
      values: rest.exception.values.map((value) =>
        value.value === undefined ? value : { ...value, value: redactEmails(value.value) },
      ),
    };
  }
  return scrubbed as E;
}
