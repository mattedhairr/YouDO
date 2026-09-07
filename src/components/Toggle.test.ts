import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Toggle from './Toggle';

describe('shared switch', () => {
  it.each([true, false])('exposes its %s state with a stable track and thumb', (checked) => {
    const html = renderToStaticMarkup(createElement(Toggle, { checked, onChange: () => {}, label: 'Daily room' }));
    expect(html).toContain('role="switch"');
    expect(html).toContain(`aria-checked="${checked}"`);
    expect(html).toContain('aria-label="Daily room"');
    expect(html).toContain('control-switch-track');
    expect(html).toContain('control-switch-thumb');
    expect(html).not.toContain('style=');
  });
  it('blocks interaction while a setting is being saved', () => {
    const html = renderToStaticMarkup(createElement(Toggle, { checked: true, disabled: true, onChange: () => {}, label: 'Daily room' }));
    expect(html).toContain('disabled=""');
    expect(html).toContain('type="button"');
  });
});
