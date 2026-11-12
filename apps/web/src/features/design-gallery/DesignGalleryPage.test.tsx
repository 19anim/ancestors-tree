import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { DesignGalleryPage } from './DesignGalleryPage';

describe('DesignGalleryPage', () => {
  it('shows every section of the design system', () => {
    renderWithProviders(<DesignGalleryPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Bộ thiết kế' })).toBeInTheDocument();
    for (const name of [
      'Màu',
      'Chữ',
      'Nút và ô nhập',
      'Hộp thoại',
      'Ảnh polaroid theo mức thu phóng',
      'Tem ngày',
      'Chỉ và đường khâu',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });

  it('lets keyboard users focus the scrollable thread board', () => {
    renderWithProviders(<DesignGalleryPage />);
    const scroller = screen.getByRole('region', { name: 'Khung cuộn ngang của cây gia phả mẫu' });
    expect(scroller).toHaveAttribute('tabindex', '0');
    expect(scroller).toContainElement(screen.getByRole('group', { name: 'Cây gia phả mẫu' }));
  });

  it('lists the color and tape tokens', () => {
    renderWithProviders(<DesignGalleryPage />);
    for (const token of ['--paper', '--ink', '--stamp', '--tape-progenitor', '--tape-6']) {
      expect(screen.getByText(token)).toBeInTheDocument();
    }
  });

  it('shows the polaroid at each level of detail', () => {
    renderWithProviders(<DesignGalleryPage />);
    const levels = screen
      .getAllByRole('figure', { name: 'Ông Thịnh, 1931–2004' })
      .map((figure) => figure.getAttribute('data-lod'));
    expect(levels).toEqual(expect.arrayContaining(['full', 'label', 'strip']));
  });

  it('shows a field with an error and opens the sample dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DesignGalleryPage />);
    expect(screen.getByRole('textbox', { name: 'Ngày mất (âm lịch)' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Mở hộp thoại mẫu' }));
    expect(screen.getByRole('dialog', { name: 'Xoá Cô Hà khỏi cây?' })).toBeInTheDocument();
  });
});
