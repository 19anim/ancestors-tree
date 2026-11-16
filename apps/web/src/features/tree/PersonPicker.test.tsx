import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { PersonPicker, type PickerOption } from './PersonPicker';

const OPTIONS: PickerOption[] = [
  { id: 'a', name: 'Nguyễn Văn Tư', blockedReason: 'Quan hệ này đã có rồi.' },
  { id: 'b', name: 'Trần Văn Bình', note: 'Ảnh chưa dán' },
];

function Harness() {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <PersonPicker
      label="Tìm theo tên"
      listLabel="Người tìm được"
      empty="Không có ai trùng tên này."
      query={query}
      onQueryChange={setQuery}
      options={query === '' ? [] : OPTIONS}
      selectedId={selectedId}
      onSelect={setSelectedId}
    />
  );
}

describe('PersonPicker', () => {
  it('lists matches, keeps blocked ones with their reason, and selects with the keyboard', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.type(screen.getByRole('searchbox', { name: 'Tìm theo tên' }), 'n');
    const list = screen.getByRole('listbox', { name: 'Người tìm được' });
    const blocked = screen.getByRole('option', { name: /Nguyễn Văn Tư/ });
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    expect(blocked).toHaveTextContent('Quan hệ này đã có rồi.');
    await user.click(blocked);
    expect(blocked).toHaveAttribute('aria-selected', 'false');

    await user.tab();
    expect(list).toHaveFocus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByRole('option', { name: /Trần Văn Bình/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('says when no one matches', async () => {
    const user = userEvent.setup();
    function Empty() {
      const [query, setQuery] = useState('');
      return (
        <PersonPicker
          label="Tìm theo tên"
          listLabel="Người tìm được"
          empty="Không có ai trùng tên này."
          query={query}
          onQueryChange={setQuery}
          options={[]}
          selectedId={null}
          onSelect={() => undefined}
        />
      );
    }
    renderWithProviders(<Empty />);
    await user.type(screen.getByRole('searchbox', { name: 'Tìm theo tên' }), 'zz');
    expect(screen.getByText('Không có ai trùng tên này.')).toBeInTheDocument();
  });
});
