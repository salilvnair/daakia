import { describe, it, expect } from 'vitest';
import { urlIssues } from './AiPreflightPopover';

const codes = (url: string) => urlIssues(url).map(i => i.code);

describe('pre-flight URL checks read variables as variables', () => {
  it('lets a URL that starts with a variable bring its own scheme', () => {
    expect(codes('{{baseUrl}}/users')).toEqual([]);
  });

  it('does not call {{id}} a stray brace', () => {
    expect(codes('https://api.example.com/users/{{userId}}/orders/{{orderId}}')).toEqual([]);
  });

  it('still flags a brace that is not a variable', () => {
    expect(codes('https://api.example.com/users/{id}')).toContain('url-curly-brace');
  });

  it('looks for a double slash in the path only', () => {
    expect(codes('https://a.com/cb?next=https://b.com')).toEqual([]);
    expect(codes('https://a.com/api//users')).toContain('double-slash');
  });

  it('still says a plain host has no protocol', () => {
    expect(codes('api.example.com/users')).toContain('missing-protocol');
  });
});
