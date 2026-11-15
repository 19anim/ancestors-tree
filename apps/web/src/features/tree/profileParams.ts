import { createContext, useCallback, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router';

/** The search parameter that holds the open profile (spec §7.6). */
export const PERSON_PARAM = 'person';

/** Opens a person's profile from a card; set by the tree page, so cards need no router hooks. */
export const OpenPersonContext = createContext<((id: string) => void) | null>(null);

/** A person's card button, on the board or in the tray: where focus returns. */
export function personCardButton(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-person-open="${id}"]`);
}

export function personParam(search: string): string | null {
  return new URLSearchParams(search).get(PERSON_PARAM);
}

function openedHere(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'profileOpenedHere' in state;
}

function withPerson(location: Location, id: string | null) {
  const params = new URLSearchParams(location.search);
  if (id === null) params.delete(PERSON_PARAM);
  else params.set(PERSON_PARAM, id);
  const query = params.toString();
  return {
    pathname: location.pathname,
    search: query === '' ? '' : `?${query}`,
    hash: location.hash,
  };
}

/**
 * The open profile. Opening pushes a history entry (so Back closes the panel), switching person
 * replaces it, and closing goes back when this tab opened it, else drops the parameter.
 */
export function useProfileParam() {
  const location = useLocation();
  const navigate = useNavigate();
  // The latest location, so the callbacks stay stable for the cards that receive them.
  const latest = useRef(location);
  useLayoutEffect(() => {
    latest.current = location;
  }, [location]);

  const openPerson = useCallback(
    (id: string) => {
      const current = latest.current;
      const open = personParam(current.search);
      if (open === id) return;
      if (open === null) {
        void navigate(withPerson(current, id), { state: { profileOpenedHere: true } });
      } else {
        void navigate(withPerson(current, id), { replace: true, state: current.state });
      }
    },
    [navigate],
  );

  const closeProfile = useCallback(() => {
    const current = latest.current;
    if (personParam(current.search) === null) return;
    if (openedHere(current.state)) void navigate(-1);
    else void navigate(withPerson(current, null), { replace: true });
  }, [navigate]);

  return { personId: personParam(location.search), openPerson, closeProfile };
}
