// Story 5.2 -- UncheckedCounter renders each copy variant with the number as
// text, and stays a plain, non-interactive label.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import UncheckedCounter from './UncheckedCounter.svelte';

function lineText(container: HTMLElement): string {
  return (container.querySelector('.unchecked-line')?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('UncheckedCounter', () => {
  it('0 unchecked', () => {
    const { container } = render(UncheckedCounter, { props: { count: 0, todayOpen: false } });
    expect(lineText(container)).toBe('0 unchecked. Keep showing up.');
    expect(container.querySelector('.unchecked-count')?.classList.contains('has-unchecked')).toBe(false);
  });

  it('1 unchecked', () => {
    const { container } = render(UncheckedCounter, { props: { count: 1, todayOpen: false } });
    expect(lineText(container)).toBe('1 day unchecked. No excuses — log it.');
    expect(container.querySelector('.unchecked-count')?.classList.contains('has-unchecked')).toBe(true);
  });

  it('n unchecked', () => {
    const { container } = render(UncheckedCounter, { props: { count: 3, todayOpen: false } });
    expect(lineText(container)).toBe('3 days unchecked. Stop hiding from them — log them.');
  });

  it('adds the today-open line only when today is open, at any count', () => {
    const open0 = render(UncheckedCounter, { props: { count: 0, todayOpen: true } });
    expect(open0.getByText("Today's still open. Done or missed — own it.")).toBeTruthy();
    open0.unmount();

    const open2 = render(UncheckedCounter, { props: { count: 2, todayOpen: true } });
    expect(open2.getByText("Today's still open. Done or missed — own it.")).toBeTruthy();
    open2.unmount();

    const closed = render(UncheckedCounter, { props: { count: 2, todayOpen: false } });
    expect(closed.queryByText(/Today's still open/)).toBeNull();
  });

  it('is plain text: no button, link, or tab stop', () => {
    const { container } = render(UncheckedCounter, { props: { count: 2, todayOpen: true } });
    expect(container.querySelector('button, a, [tabindex], [role="button"]')).toBeNull();
  });
});
