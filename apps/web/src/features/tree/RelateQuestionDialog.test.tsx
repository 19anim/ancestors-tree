import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { RelateQuestionDialog } from './RelateQuestionDialog';

describe('RelateQuestionDialog', () => {
  it('answers with the chosen option, or cancels', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <RelateQuestionDialog
        title="Các con ở với ai?"
        answers={[
          { label: 'Ở với Nguyễn Văn Tư', answers: { keepWith: 'a' } },
          { label: 'Ở với Lê Thị Hoa', answers: { keepWith: 'b' } },
        ]}
        onAnswer={onAnswer}
        onCancel={onCancel}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Các con ở với ai?' });
    await user.click(within(dialog).getByRole('button', { name: 'Ở với Lê Thị Hoa' }));
    expect(onAnswer).toHaveBeenCalledWith({ keepWith: 'b' });
    await user.click(within(dialog).getByRole('button', { name: 'Thôi, không đổi' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
