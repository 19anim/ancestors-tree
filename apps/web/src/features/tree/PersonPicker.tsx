import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { cn } from '../../shared/lib/cn';

export interface PickerOption {
  id: string;
  name: string;
  /** Shown after the name, for example "Ảnh chưa dán". */
  note?: string;
  /** Why this person cannot be chosen; the option stays listed, aria-disabled (spec §7.6). */
  blockedReason?: string;
}

interface PersonPickerProps {
  label: string;
  listLabel: string;
  /**
   * What the search found ("Tìm thấy 3 người.", or that no one matches); empty before a search.
   * A polite live region, so it is announced as the user types.
   */
  status: string;
  query: string;
  onQueryChange: (query: string) => void;
  options: PickerOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * A name search and a listbox of matches. The listbox is its own tab stop: arrows move, Enter
 * or Space choose (the ARIA listbox pattern); a blocked option cannot be chosen.
 */
export function PersonPicker({
  label,
  listLabel,
  status,
  query,
  onQueryChange,
  options,
  selectedId,
  onSelect,
}: PersonPickerProps) {
  const inputId = useId();
  const statusId = useId();
  const listId = useId();
  const listLabelId = useId();
  const optionPrefix = useId();
  const [active, setActive] = useState(0);
  const current = Math.min(active, Math.max(options.length - 1, 0));
  const hasList = options.length > 0;
  const activeId = hasList ? `${optionPrefix}-${current}` : null;

  // The active option stays in view as the arrows move it through a long list.
  useEffect(() => {
    if (activeId === null) return;
    const node = document.getElementById(activeId);
    // jsdom has no scrollIntoView.
    if (typeof node?.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const choose = (option: PickerOption | undefined) => {
    if (option === undefined || option.blockedReason !== undefined) return;
    onSelect(option.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'ArrowDown') setActive(Math.min(current + 1, options.length - 1));
    else if (event.key === 'ArrowUp') setActive(Math.max(current - 1, 0));
    else if (event.key === 'Home') setActive(0);
    else if (event.key === 'End') setActive(options.length - 1);
    else if (event.key === 'Enter' || event.key === ' ') choose(options[current]);
    else return;
    event.preventDefault();
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        type="search"
        autoComplete="off"
        value={query}
        aria-describedby={statusId}
        aria-controls={hasList ? listId : undefined}
        onChange={(event) => {
          setActive(0);
          onQueryChange(event.target.value);
        }}
        className="h-10 rounded-control border border-line-strong bg-surface px-3 text-base text-ink"
      />
      {/* Always in the accessibility tree, so each new count is announced. */}
      <p
        id={statusId}
        role="status"
        aria-live="polite"
        className="text-sm text-ink-muted empty:sr-only"
      >
        {status}
      </p>
      {hasList ? (
        <>
          <span id={listLabelId} className="sr-only">
            {listLabel}
          </span>
          <ul
            id={listId}
            role="listbox"
            tabIndex={0}
            aria-labelledby={listLabelId}
            aria-activedescendant={activeId ?? undefined}
            onKeyDown={onKeyDown}
            className="group max-h-60 overflow-y-auto rounded-control border border-line p-1"
          >
            {options.map((option, at) => (
              <li
                key={option.id}
                id={`${optionPrefix}-${at}`}
                role="option"
                aria-selected={option.id === selectedId}
                aria-disabled={option.blockedReason === undefined ? undefined : true}
                // A click picks without taking focus from the search: typing on narrows the list,
                // and Tab still reaches the list next.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setActive(at);
                  choose(option);
                }}
                className={cn(
                  'cursor-default rounded-control px-3 py-2 text-base',
                  // The keyboard's place in the list: the focus ring's colour (3:1 and more).
                  at === current &&
                    'group-focus-visible:bg-paper-grid group-focus-visible:outline-2 group-focus-visible:-outline-offset-2 group-focus-visible:outline-accent',
                  option.id === selectedId && 'font-bold',
                  option.blockedReason === undefined ? 'text-ink' : 'text-ink-muted',
                )}
              >
                {option.name}
                {option.note === undefined ? null : (
                  <span className="text-sm text-ink-muted"> · {option.note}</span>
                )}
                {option.blockedReason === undefined ? null : (
                  <span className="block text-sm">{option.blockedReason}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
