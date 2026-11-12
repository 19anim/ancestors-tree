import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DateMark } from './DateMark';

describe('DateMark', () => {
  it('writes a death anniversary as a quiet line, not a stamp', () => {
    render(
      <DateMark kind="death-anniversary" label="Ngày giỗ 15/10 âm lịch">
        Giỗ 15/10 ÂL
      </DateMark>,
    );
    const mark = screen.getByText('Giỗ 15/10 ÂL').closest('[data-kind]');
    expect(mark).toHaveAttribute('data-kind', 'death-anniversary');
    expect(mark?.className).toContain('text-photo-muted');
    expect(mark?.className).not.toMatch(/rotate|stamp|uppercase/);
  });

  it('sticks a birthday as a round sticker with a cake and the date', () => {
    render(
      <DateMark kind="birthday" label="Sinh nhật 21/11">
        21/11
      </DateMark>,
    );
    const mark = screen.getByText('21/11').closest('[data-kind]');
    expect(mark).toHaveAttribute('data-kind', 'birthday');
    expect(mark?.className).toContain('bg-sticker');
    expect(mark?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('gives screen readers the full text and hides the short one', () => {
    render(
      <>
        <DateMark kind="death-anniversary" label="Ngày giỗ 15/10 âm lịch">
          Giỗ 15/10 ÂL
        </DateMark>
        <DateMark kind="birthday" label="Sinh nhật 21/11">
          21/11
        </DateMark>
      </>,
    );
    for (const [label, short] of [
      ['Ngày giỗ 15/10 âm lịch', 'Giỗ 15/10 ÂL'],
      ['Sinh nhật 21/11', '21/11'],
    ] as const) {
      expect(screen.getByText(label)).toHaveClass('sr-only');
      expect(screen.getByText(short)).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('keeps the date readable at 11 px', () => {
    render(
      <>
        <DateMark kind="death-anniversary" label="Ngày giỗ 15/10 âm lịch">
          Giỗ 15/10 ÂL
        </DateMark>
        <DateMark kind="birthday" label="Sinh nhật 21/11">
          21/11
        </DateMark>
      </>,
    );
    for (const short of ['Giỗ 15/10 ÂL', '21/11']) {
      expect(screen.getByText(short).closest('[data-kind]')?.className).toContain('text-[11px]');
    }
  });
});
