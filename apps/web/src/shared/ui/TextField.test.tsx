import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { TextField } from './TextField';

describe('TextField', () => {
  it('labels the input and links the hint', () => {
    render(<TextField label="Họ và tên" hint="Viết đầy đủ, có dấu." />);
    const input = screen.getByRole('textbox', { name: 'Họ và tên' });
    expect(input).toHaveAccessibleDescription('Viết đầy đủ, có dấu.');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('marks the input invalid and describes the error after the hint', () => {
    render(
      <TextField
        label="Ngày mất (âm lịch)"
        hint="Theo âm lịch."
        error="Tháng này chỉ có 29 ngày."
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Ngày mất (âm lịch)' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Theo âm lịch. Tháng này chỉ có 29 ngày.');
  });

  it('forwards input props and the ref', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLInputElement>();
    render(<TextField label="Tên gọi" ref={ref} defaultValue="Hà" />);
    expect(ref.current?.value).toBe('Hà');
    await user.type(screen.getByRole('textbox', { name: 'Tên gọi' }), ' Anh');
    expect(ref.current?.value).toBe('Hà Anh');
  });

  it('keeps a caller-provided id', () => {
    render(<TextField label="Quê quán" id="hometown" />);
    expect(screen.getByRole('textbox', { name: 'Quê quán' })).toHaveAttribute('id', 'hometown');
  });
});
