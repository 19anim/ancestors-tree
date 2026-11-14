import { matchPath } from 'react-router';

/** Pages that load a family tree into the store; `/clans/:id` redirects to the tree. */
const TREE_PAGES = ['/clans/:id', '/clans/:id/tree', '/clans/:id/history'];

/** The family tree a path loads, or null. */
export function treeOpenedBy(pathname: string): string | null {
  for (const pattern of TREE_PAGES) {
    const id = matchPath(pattern, pathname)?.params.id;
    if (id !== undefined) return id;
  }
  return null;
}
