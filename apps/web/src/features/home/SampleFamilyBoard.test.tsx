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

  it('stamps death anniversaries and stickers birthdays', () => {
    renderWithProviders(<SampleFamilyBoard />);
    expect(screen.getByText('Giỗ 15/10')).toHaveAttribute('data-kind', 'death-anniversary');
    expect(screen.getByText('SN 21/11')).toHaveAttribute('data-kind', 'birthday');
  });
});
