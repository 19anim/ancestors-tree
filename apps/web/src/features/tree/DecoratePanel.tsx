import {
  CARD_PARTS,
  THEME_OPTIONS,
  THEME_PARTS,
  type CardPart,
  type ThemePart,
} from '@ancestors-tree/shared/tree';
import { X } from 'lucide-react';
import { useContext, useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, inertOthers, ThemeSwatch, themeOptionKey, useMediaQuery } from '../../shared/ui';
import { ChangeContext } from './ChangeRunner';
import {
  cardChoice,
  cardPickChangesNothing,
  cardStyleWith,
  treeChoice,
  treePick,
  treePickChangesNothing,
  withCardPick,
  withoutCard,
  withTreePick,
  type DecorMode,
  type DecorTarget,
} from './decor';
import { useThemeLayers } from './decorContext';
import { SIDE_PANEL_CLASS, WIDE_QUERY } from './sidePanel';
import { useTreeStore } from './store';
import type { PersonalDecor } from './useViewPreference';

interface DecoratePanelProps {
  target: DecorTarget;
  mode: DecorMode;
  onModeChange: (mode: DecorMode) => void;
  /** Editors and the Owner may decorate for the whole family (spec §3). */
  canEdit: boolean;
  decor: PersonalDecor;
  onClose: () => void;
}

const MODES = ['me', 'clan'] as const;

/**
 * Decorate (spec §13.4): the whole tree, or one card's frame and fastener; for me or for the
 * whole family. A side panel on wide screens, a modal bottom sheet on small ones, like the
 * profile.
 */
export function DecoratePanel({
  target,
  mode,
  onModeChange,
  canEdit,
  decor,
  onClose,
}: DecoratePanelProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const hintId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  const requestChange = useContext(ChangeContext);
  const layers = useThemeLayers();
  const personId = target.kind === 'card' ? target.personId : null;
  const person = useTreeStore((state) =>
    personId === null ? undefined : state.tree.persons[personId],
  );

  // Focus moves in when the panel opens, so a screen reader says what it decorates.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  // Below md the panel is a modal sheet, as the profile is (ProfilePanel).
  const wide = useMediaQuery(WIDE_QUERY);
  useEffect(() => {
    const element = panel.current;
    if (wide || element === null) return;
    const undo = inertOthers(element);
    const active = document.activeElement;
    if (active === null || !element.contains(active)) heading.current?.focus();
    return undo;
  }, [wide]);

  // The card's person left the tree (deleted, or their addition undone): nothing to decorate.
  const missing = personId !== null && person === undefined;
  useEffect(() => {
    if (missing) onClose();
  }, [missing, onClose]);
  if (missing) return null;

  // "Only me" waits for my choices to load; "Whole family" needs the change runner (editors).
  const ready = mode === 'clan' ? requestChange !== null : decor.preference !== null;
  const parts: readonly ThemePart[] = person === undefined ? THEME_PARTS : CARD_PARTS;
  const ownCard =
    person === undefined
      ? false
      : mode === 'clan'
        ? person.cardStyle !== undefined
        : Object.hasOwn(decor.preference?.cards ?? {}, person.id);

  // Picking what is already in effect does nothing, as with any radio button: the runner would
  // refuse it as ALREADY. In "Only me" a pick still counts while my choices are off (it turns
  // them on).
  const pick = (part: ThemePart, value: string) => {
    if (person === undefined) {
      const changes = treePick(part, value);
      if (treePickChangesNothing(layers, mode, changes)) return;
      if (mode === 'clan') requestChange?.({ change: { kind: 'treeTheme', changes } });
      else decor.change((current) => withTreePick(current, changes));
      return;
    }
    const cardPart = part as CardPart;
    if (cardPickChangesNothing(layers, mode, person.id, person.cardStyle, cardPart, value)) return;
    if (mode === 'clan') {
      const cardStyle = cardStyleWith(person.cardStyle, cardPart, value) ?? null;
      requestChange?.({ change: { kind: 'cardStyle', personId: person.id, cardStyle } });
    } else {
      decor.change((current) => withCardPick(current, person.id, cardPart, value));
    }
  };

  const followTree = () => {
    if (person === undefined) return;
    if (mode === 'clan') {
      requestChange?.({ change: { kind: 'cardStyle', personId: person.id, cardStyle: null } });
    } else {
      decor.change((current) => withoutCard(current, person.id));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // The Escape that ends an IME composition belongs to the input method.
    if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onClose();
  };

  return (
    <aside
      ref={panel}
      aria-labelledby={headingId}
      onKeyDown={onKeyDown}
      className={SIDE_PANEL_CLASS}
    >
      <div className="flex items-start justify-between gap-2">
        <h2
          id={headingId}
          ref={heading}
          tabIndex={-1}
          className="text-xl font-bold text-ink focus:outline-none"
        >
          {person === undefined
            ? t('tree.decor.title')
            : t('tree.decor.cardTitle', { name: person.fullName })}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('tree.decor.close')}
          title={t('tree.decor.close')}
          onClick={onClose}
        >
          <X aria-hidden="true" strokeWidth={1.75} className="size-5" />
        </Button>
      </div>

      <fieldset aria-describedby={canEdit ? undefined : hintId} className="flex flex-col gap-2">
        <legend className="font-medium text-ink">{t('tree.decor.applyTo')}</legend>
        <div className="flex flex-wrap gap-4">
          {MODES.map((value) => (
            <label key={value} className="flex items-center gap-2 text-ink">
              <input
                type="radio"
                name={`${headingId}-mode`}
                value={value}
                checked={mode === value}
                disabled={value === 'clan' && !canEdit}
                onChange={() => onModeChange(value)}
                className="accent-accent"
              />
              {t(`tree.decor.mode.${value}`)}
            </label>
          ))}
        </div>
        {canEdit ? null : (
          <p id={hintId} className="text-sm text-ink-muted">
            {t('tree.decor.viewerHint')}
          </p>
        )}
      </fieldset>

      {parts.map((part) => {
        const choice =
          person === undefined
            ? { value: treeChoice(layers, mode, part), source: null }
            : cardChoice(layers, mode, person.id, person.cardStyle, part as CardPart);
        const different = choice.source === 'myCard' || choice.source === 'clanCard';
        return (
          <fieldset key={part} disabled={!ready} className="flex flex-col gap-2">
            {/* The mark sits outside the legend, so the group's name stays the part's name. */}
            <legend className="font-medium text-ink">{t(`tree.decor.parts.${part}`)}</legend>
            {different ? (
              <p className="w-fit rounded-pill bg-sticker px-2 text-xs text-on-sticker">
                {t('tree.decor.card.different')}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {THEME_OPTIONS[part].map((value) => (
                <label
                  key={value}
                  className="flex cursor-pointer flex-col items-center gap-1 rounded-control border border-line p-2 text-ink has-checked:border-accent has-checked:bg-paper-grid has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent has-disabled:cursor-not-allowed has-disabled:opacity-60"
                >
                  <input
                    type="radio"
                    name={`${headingId}-${part}`}
                    value={value}
                    checked={choice.value === value}
                    onChange={() => pick(part, value)}
                    className="sr-only"
                  />
                  <ThemeSwatch part={part} value={value} />
                  <span className="text-sm">{t(themeOptionKey(part, value))}</span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}

      {person === undefined ? null : (
        <Button variant="secondary" disabled={!ready || !ownCard} onClick={followTree}>
          {t('tree.decor.card.useTree')}
        </Button>
      )}
    </aside>
  );
}
