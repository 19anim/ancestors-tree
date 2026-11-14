import { lazy } from 'react';

export { resetTreeStore, useUnsentChangeCount } from './store';
export { TreeSkeleton } from './TreeSkeleton';
export { UnsentChangesGuard } from './UnsentChangesGuard';

// The app shell imports this index on every page, so the tree page (and React Flow with it)
// is exported lazily: only people who open a family tree download it.
export const TreePage = lazy(() =>
  import('./TreePage').then((module) => ({ default: module.TreePage })),
);
