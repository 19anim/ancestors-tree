import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the app name and the Vietnamese tagline', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'AncestorsTree' })).toBeInTheDocument();
    expect(
      screen.getByText('Cùng con cháu dựng cây gia phả, không quên ngày giỗ.'),
    ).toBeInTheDocument();
  });
});
