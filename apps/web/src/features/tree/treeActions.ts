import { createContext } from 'react';

/**
 * Opens the actions of a person (add child, add spouse, delete, set progenitor). Null for
 * viewers: cards then show no actions button.
 */
export const TreeActionsContext = createContext<((personId: string) => void) | null>(null);
