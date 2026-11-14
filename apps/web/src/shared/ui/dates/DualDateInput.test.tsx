import { lunarCalendar } from '@ancestors-tree/shared/lunar';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../test/render';
import { DualDateInput } from './DualDateInput';
import { EMPTY_DATE_DRAFT, type DateDraft } from './dateDraft';

function Harness({ initial = EMPTY_DATE_DRAFT }: { initial?: DateDraft }) {
  const [value, setValue] = useState(initial);
  return <DualDateInput legend="Ngày mất" value={value} onChange={setValue} />;
}

describe('DualDateInput', () => {
  it('shows the other calendar and the Can Chi year as the user types', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    const group = screen.getByRole('group', { name: 'Ngày mất' });
    expect(screen.getByRole('radio', { name: 'Âm lịch' })).toBeChecked();
    await user.type(screen.getByLabelText('Ngày'), '1');
    await user.type(screen.getByLabelText('Tháng'), '1');
    await user.type(screen.getByLabelText('Năm'), '2026');
    expect(group).toHaveTextContent('= 17/2/2026 dương lịch');
    expect(group).toHaveTextContent('năm Bính Ngọ');
  });

  it('hides day and month for a year only', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole('radio', { name: 'Chỉ biết năm' }));
    expect(screen.queryByLabelText('Ngày')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Năm')).toBeInTheDocument();
  });

  it('offers the leap month only when the year has that leap month', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    const leap = screen.getByRole('checkbox', { name: 'Tháng nhuận' });
    expect(leap).toHaveAttribute('aria-disabled', 'true');
    await user.click(leap);
    expect(leap).not.toBeChecked();
  });

  it('lets the leap month be ticked in its year, and clears it when the month changes', async () => {
    const user = userEvent.setup();
    let year = 2020;
    while (lunarCalendar.leapMonthOf(year) === null) year += 1;
    const month = lunarCalendar.leapMonthOf(year) ?? 0;
    renderWithProviders(<Harness />);
    await user.type(screen.getByLabelText('Năm'), String(year));
    const leap = screen.getByRole('checkbox', { name: 'Tháng nhuận' });
    expect(leap).toHaveAccessibleDescription(`Năm ${year} nhuận tháng ${month}.`);
    await user.type(screen.getByLabelText('Tháng'), String(month));
    expect(leap).not.toHaveAttribute('aria-disabled');
    await user.click(leap);
    expect(leap).toBeChecked();
    await user.clear(screen.getByLabelText('Tháng'));
    await user.type(screen.getByLabelText('Tháng'), String(month === 12 ? 1 : month + 1));
    expect(leap).not.toBeChecked();
    expect(leap).toHaveAttribute('aria-disabled', 'true');
    // Back on the leap month, the tick is gone: the draft cleared it rather than hiding it.
    await user.clear(screen.getByLabelText('Tháng'));
    await user.type(screen.getByLabelText('Tháng'), String(month));
    expect(leap).not.toBeChecked();
  });

  it('says when the year has no leap month', async () => {
    const user = userEvent.setup();
    let year = 2020;
    while (lunarCalendar.leapMonthOf(year) !== null) year += 1;
    renderWithProviders(<Harness />);
    await user.type(screen.getByLabelText('Năm'), String(year));
    expect(screen.getByRole('checkbox', { name: 'Tháng nhuận' })).toHaveAccessibleDescription(
      `Năm ${year} không có tháng nhuận.`,
    );
  });

  it('clears the date', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Harness initial={{ mode: 'solar', day: '1', month: '2', year: '1990', isLeap: false }} />,
    );
    await user.click(screen.getByRole('button', { name: 'Xoá ngày' }));
    expect(screen.getByLabelText('Năm')).toHaveValue('');
  });

  it('shows the error it is given at the fields', () => {
    renderWithProviders(
      <DualDateInput
        legend="Ngày sinh"
        value={EMPTY_DATE_DRAFT}
        onChange={() => undefined}
        error="Chỉ nhập số."
      />,
    );
    expect(screen.getByLabelText('Ngày')).toHaveAccessibleDescription('Chỉ nhập số.');
  });
});
