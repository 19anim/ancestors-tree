import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { ThemePreference } from './theme';
import { useTheme } from './ThemeProvider';

const OPTIONS = [
  { value: 'light', Icon: Sun, labelKey: 'theme.light' },
  { value: 'dark', Icon: Moon, labelKey: 'theme.dark' },
  { value: 'system', Icon: Monitor, labelKey: 'theme.system' },
] as const satisfies ReadonlyArray<{ value: ThemePreference; Icon: LucideIcon; labelKey: string }>;

/** Three native radios (free keyboard support) styled as a compact segmented control. */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  const name = useId();

  return (
    <fieldset className="flex items-center gap-0.5 rounded-pill border border-line p-0.5">
      <legend className="sr-only">{t('theme.legend')}</legend>
      {OPTIONS.map(({ value, Icon, labelKey }) => (
        <label
          key={value}
          title={t(labelKey)}
          className="grid size-8 cursor-pointer place-items-center rounded-full text-ink-muted transition-colors duration-(--duration-fast) hover:text-ink has-[:checked]:bg-ink has-[:checked]:text-paper has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
        >
          <input
            type="radio"
            name={name}
            value={value}
            checked={preference === value}
            onChange={() => setPreference(value)}
            className="sr-only"
          />
          <Icon aria-hidden="true" size={16} strokeWidth={1.75} />
          <span className="sr-only">{t(labelKey)}</span>
        </label>
      ))}
    </fieldset>
  );
}
