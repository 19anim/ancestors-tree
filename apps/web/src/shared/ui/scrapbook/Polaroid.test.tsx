import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Polaroid } from './Polaroid';

const LABEL = 'Ông Thịnh, 1931–2004';

describe('Polaroid', () => {
  it('renders the full card with tape, initials, caption and accessible name', () => {
    render(<Polaroid name="Ông Thịnh" label={LABEL} tape="progenitor" tilt={1.5} />);
    const card = screen.getByRole('figure', { name: LABEL });
    expect(card).toHaveAttribute('data-lod', 'full');
    expect(card).toHaveAttribute('data-tape', 'progenitor');
    expect(within(card).getByText('Ông Thịnh')).toBeInTheDocument();
    expect(within(card).getByText('T')).toBeInTheDocument();
    expect(card.querySelector('img')).toBeNull();
  });

  it('shows the photo instead of initials when there is one', () => {
    render(<Polaroid name="Bà Hoa" label="Bà Hoa" tape="in-law" photoUrl="/hoa.jpg" />);
    const card = screen.getByRole('figure', { name: 'Bà Hoa' });
    expect(card.querySelector('img')).toHaveAttribute('src', '/hoa.jpg');
    expect(card.querySelector('img')).toHaveAttribute('alt', '');
    expect(within(card).queryByText('H')).not.toBeInTheDocument();
  });

  it('renders date marks on the full card only', () => {
    const marks = <span>Giỗ 15/10</span>;
    const { rerender } = render(
      <Polaroid name="Ông Thịnh" label={LABEL} tape="progenitor" marks={marks} />,
    );
    expect(screen.getByText('Giỗ 15/10')).toBeInTheDocument();

    rerender(
      <Polaroid name="Ông Thịnh" label={LABEL} tape="progenitor" marks={marks} lod="label" />,
    );
    expect(screen.queryByText('Giỗ 15/10')).not.toBeInTheDocument();
  });

  it('sticks date marks on the photo, not over the caption', () => {
    render(
      <Polaroid name="Ông Thịnh" label={LABEL} tape="progenitor" marks={<span>Giỗ 15/10</span>} />,
    );
    const card = screen.getByRole('figure', { name: LABEL });
    const mark = screen.getByText('Giỗ 15/10');
    expect(card.querySelector('[data-part="photo"]')).toContainElement(mark);
    expect(within(card).getByText('Ông Thịnh')).not.toContainElement(mark);
  });

  it('renders a taped name label at medium zoom', () => {
    render(<Polaroid name="Bố Tuấn" label="Bố Tuấn, 1962" tape={0} lod="label" lifeYears="1962" />);
    const card = screen.getByRole('figure', { name: 'Bố Tuấn, 1962' });
    expect(card).toHaveAttribute('data-lod', 'label');
    expect(card).toHaveAttribute('data-tape', 'branch-1');
    expect(within(card).getByText('Bố Tuấn')).toBeInTheDocument();
    expect(within(card).getByText('1962')).toBeInTheDocument();
  });

  it('renders only a strip of tape when zoomed far out, keeping the accessible name', () => {
    render(<Polaroid name="Cô Hà" label="Cô Hà, 1968" tape={1} lod="strip" />);
    const card = screen.getByRole('figure', { name: 'Cô Hà, 1968' });
    expect(card).toHaveAttribute('data-lod', 'strip');
    expect(card.textContent).toBe('');
  });

  it('passes extra props and classes through', () => {
    render(
      <Polaroid
        name="Mẹ Lan"
        label="Mẹ Lan"
        tape="in-law"
        className="absolute"
        data-testid="lan"
      />,
    );
    expect(screen.getByTestId('lan').className).toContain('absolute');
  });
});
