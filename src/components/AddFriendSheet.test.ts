import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AddFriendSheet from './AddFriendSheet';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-user-1' } }),
}));

vi.mock('../lib/profiles', () => ({
  searchProfilesByUsernamePrefix: vi.fn().mockResolvedValue([]),
  sendFriendRequest: vi.fn().mockResolvedValue({ ok: true }),
}));

describe('AddFriendSheet password manager opt-out and search input', () => {
  it('renders search input with explicit ignore attributes and type="search" to prevent autofill popups', () => {
    const html = renderToStaticMarkup(
      createElement(AddFriendSheet, {
        open: true,
        onClose: vi.fn(),
        onOpenProfile: vi.fn(),
      }),
    );

    // Assert strict password manager opt-out attributes
    expect(html).toContain('data-protonpass-ignore="true"');
    expect(html).toContain('data-1p-ignore="true"');
    expect(html).toContain('data-lpignore="true"');
    expect(html).toContain('data-bwignore="true"');
    expect(html).toContain('data-form-type="other"');

    // Assert search input identification
    expect(html).toContain('type="search"');
    expect(html).toContain('name="companion_search"');
    expect(html).toContain('id="companion_search_query"');
    expect(html).toContain('autoComplete="off"');

    // Assert non-trigger placeholder
    expect(html).toContain('placeholder="Search study partner handle (e.g. @alex)..."');

    // Assert invalid p-4.5 is absent
    expect(html).not.toContain('p-4.5');
  });
});
