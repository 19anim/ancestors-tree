import type { PersonalTheme, ThemeLayers } from '@ancestors-tree/shared/tree';
import { createContext, useContext, useMemo } from 'react';
import { useTreeStore } from './store';

/**
 * My own decoration of this clan (spec §13.4 "Only for me"); null until it is loaded. TreePage
 * provides it; its `enabled` decides whether it is drawn.
 */
export const PersonalThemeContext = createContext<PersonalTheme | null>(null);

/** The layers the board resolves styles from: a new object only when one of them changes. */
export function useThemeLayers(): ThemeLayers {
  const clan = useTreeStore((state) => state.tree.theme);
  const mine = useContext(PersonalThemeContext);
  return useMemo(() => ({ clan, mine }), [clan, mine]);
}
