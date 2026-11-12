import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { SAMPLE_CHILDREN, SAMPLE_MARRIAGES, SAMPLE_PEOPLE } from './sampleFamily';
import { SampleFamilyBoard } from './SampleFamilyBoard';

describe('SampleFamilyBoard', () => {
  it('shows every sample person as a labelled photo on the board', () => {
    renderWithProviders(<SampleFamilyBoard />);
    const board = screen.getByRole('group', { name: 'Cây gia phả mẫu' });
    for (const person of SAMPLE_PEOPLE) {
      expect(
        within(board).getByRole('figure', { name: `${person.name}, ${person.years}` }),
      ).toBeInTheDocument();
    }
  });

  it('draws one stitch per marriage and one thread per child', () => {
    const { container } = renderWithProviders(<SampleFamilyBoard />);
    expect(container.querySelectorAll('[data-relation="marriage"]')).toHaveLength(
      SAMPLE_MARRIAGES.length,
    );
    expect(container.querySelectorAll('[data-relation="parent-child"]')).toHaveLength(
      SAMPLE_CHILDREN.length,
    );
  });

  it('writes death anniversaries under the name and stickers birthdays with a cake', () => {
    renderWithProviders(<SampleFamilyBoard />);
    const anniversary = screen.getByText('Giỗ 15/10 ÂL');
    expect(anniversary.closest('[data-kind]')).toHaveAttribute('data-kind', 'death-anniversary');
    expect(anniversary.closest('[data-part="date-line"]')).not.toBeNull();
    expect(screen.getByText('Ngày giỗ 15/10 âm lịch')).toHaveClass('sr-only');

    expect(screen.getByText('21/11').closest('[data-kind]')).toHaveAttribute(
      'data-kind',
      'birthday',
    );
    expect(screen.getByText('Sinh nhật 21/11')).toHaveClass('sr-only');
    expect(screen.queryByText(/^SN /)).not.toBeInTheDocument();
  });
});
