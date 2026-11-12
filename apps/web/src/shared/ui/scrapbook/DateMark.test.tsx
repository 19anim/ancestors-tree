import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DateMark } from './DateMark';

describe('DateMark', () => {
  it('renders a death anniversary as a stamp', () => {
    render(<DateMark kind="death-anniversary">Giỗ 15/10</DateMark>);
    const mark = screen.getByText('Giỗ 15/10');
    expect(mark).toHaveAttribute('data-kind', 'death-anniversary');
    expect(mark.className).toContain('text-photo-stamp');
  });

  it('renders a birthday as a round sticker', () => {
    render(<DateMark kind="birthday">SN 21/11</DateMark>);
    const mark = screen.getByText('SN 21/11');
    expect(mark).toHaveAttribute('data-kind', 'birthday');
    expect(mark.className).toContain('bg-sticker');
  });

  it('keeps the date readable: stamp and sticker text is 11 px', () => {
    render(
      <>
        <DateMark kind="death-anniversary">Giỗ 15/10</DateMark>
        <DateMark kind="birthday">SN 21/11</DateMark>
      </>,
    );
    expect(screen.getByText('Giỗ 15/10').className).toContain('text-[11px]');
    expect(screen.getByText('SN 21/11').className).toContain('text-[11px]');
  });
});
