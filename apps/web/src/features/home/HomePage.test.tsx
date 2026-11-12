import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('shows the headline, the sample tree with its legend and a link to the gallery', () => {
    renderWithProviders(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Gia phả nhà mình, dán từng tấm ảnh.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Cùng con cháu dựng cây gia phả, không quên ngày giỗ.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Cây gia phả mẫu' })).toBeInTheDocument();
    expect(screen.getByText(/Sợi chỉ có ghim đỏ nối cha mẹ với con/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem bộ thiết kế' })).toHaveAttribute(
      'href',
      '/design',
    );
  });

  it('lets keyboard users focus the scrollable board', () => {
    renderWithProviders(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    const scroller = screen.getByRole('region', { name: 'Khung cuộn ngang của cây gia phả mẫu' });
    expect(scroller).toHaveAttribute('tabindex', '0');
    expect(scroller).toContainElement(screen.getByRole('group', { name: 'Cây gia phả mẫu' }));
  });
});
