/** Tailwind's md (48rem): from here up a side panel is a column beside the board, not a sheet. */
export const WIDE_QUERY = '(min-width: 48rem)';

/**
 * The profile and Decorate panels (spec §7.6, §13.4): a bottom sheet on small screens; from md
 * up, a sticky column beside the board, in the page flow under the header, so it never covers
 * the header or the notices (WCAG 2.4.11). The sheet's extra bottom padding lets its last row
 * scroll up above the change toast, which sits over it.
 */
export const SIDE_PANEL_CLASS =
  'fixed inset-x-0 bottom-0 z-30 flex max-h-[75vh] flex-col gap-4 overflow-y-auto rounded-t-control border-t border-line bg-paper p-4 pb-24 shadow-lift md:pb-4 md:sticky md:inset-x-auto md:top-4 md:bottom-auto md:z-auto md:max-h-[calc(100dvh-2rem)] md:w-[400px] md:shrink-0 md:rounded-control md:border md:shadow-none';
