import { THEME_OPTIONS, THEME_PARTS } from '@ancestors-tree/shared/tree';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { ThemeSwatch, themeOptionKey } from './ThemeSwatch';

describe('ThemeSwatch', () => {
  it('draws each part with the attribute its CSS reads, hidden from screen readers', () => {
    const { container } = render(
      <>
        <ThemeSwatch part="surface" value="corkboard" />
        <ThemeSwatch part="frame" value="vintage" />
        <ThemeSwatch part="fastener" value="magnet" />
        <ThemeSwatch part="thread" value="yarn" />
        <ThemeSwatch part="stitch" value="yarn" />
      </>,
    );
    expect(container.querySelector('[data-surface="corkboard"]')).toHaveClass('board-grid');
    expect(container.querySelector('[data-frame="vintage"] .polaroid-paper')).not.toBeNull();
    expect(container.querySelector('[data-fastener="magnet"] .fastener')).not.toBeNull();
    expect(container.querySelector('[data-thread="yarn"] .thread-line')).not.toBeNull();
    expect(container.querySelector('[data-stitch="yarn"] .stitch-line')).not.toBeNull();
    for (const swatch of container.children) expect(swatch).toHaveAttribute('aria-hidden', 'true');
  });

  it('has a name for every option in both languages', () => {
    for (const part of THEME_PARTS) {
      for (const value of THEME_OPTIONS[part]) {
        const key = themeOptionKey(part, value);
        expect(i18n.exists(key, { lng: 'vi' }), `vi ${key}`).toBe(true);
        expect(i18n.exists(key, { lng: 'en' }), `en ${key}`).toBe(true);
      }
    }
  });
});
