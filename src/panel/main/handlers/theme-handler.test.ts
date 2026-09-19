import { describe, it, expect, vi, beforeEach } from 'vitest';

const rows: Record<string, { id: string; label: string; payload: string }[]> = {
  app: [],
  terminal: [],
};

vi.mock('../../../storage/db', () => ({
  getThemes: (kind: string) => rows[kind],
  upsertTheme: (kind: string, t: { id: string; label: string; payload: string }) => {
    rows[kind] = [...rows[kind].filter(r => r.id !== t.id), t];
  },
  deleteTheme: (kind: string, id: string) => {
    rows[kind] = rows[kind].filter(r => r.id !== id);
  },
}));

const { handleGetThemes, handleSaveTheme, handleDeleteTheme } = await import('./theme-handler');

function collect() {
  const sent: Record<string, unknown>[] = [];
  return { post: (m: unknown) => sent.push(m as Record<string, unknown>), sent };
}

describe('themes, kept where sync can reach them', () => {
  beforeEach(() => { rows.app = []; rows.terminal = []; });

  it('saves one and hands the whole list back', () => {
    /*
      Answering with the list rather than an acknowledgement means the webview
      never has to guess what the database now holds — including when two
      panels are open and the other one has been busy.
    */
    const { post, sent } = collect();
    handleSaveTheme({ kind: 'app', theme: { id: 'mine', label: 'Mine', dark: { accent: '#fff' } } }, post);
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe('themes:data');
    expect(sent[0].app).toEqual([{ id: 'mine', label: 'Mine', dark: { accent: '#fff' } }]);
  });

  it('keeps the two kinds in their own tables', () => {
    const { post, sent } = collect();
    handleSaveTheme({ kind: 'app', theme: { id: 'a', label: 'A' } }, post);
    handleSaveTheme({ kind: 'terminal', theme: { id: 't', label: 'T' } }, post);
    const last = sent.at(-1)!;
    expect((last.app as unknown[]).map((t) => (t as { id: string }).id)).toEqual(['a']);
    expect((last.terminal as unknown[]).map((t) => (t as { id: string }).id)).toEqual(['t']);
  });

  it('replaces a theme saved under an id it already has', () => {
    const { post, sent } = collect();
    handleSaveTheme({ kind: 'app', theme: { id: 'a', label: 'First' } }, post);
    handleSaveTheme({ kind: 'app', theme: { id: 'a', label: 'Second' } }, post);
    expect(sent.at(-1)!.app).toEqual([{ id: 'a', label: 'Second' }]);
  });

  it('deletes one and hands the list back', () => {
    const { post, sent } = collect();
    handleSaveTheme({ kind: 'app', theme: { id: 'a', label: 'A' } }, post);
    handleDeleteTheme({ kind: 'app', id: 'a' }, post);
    expect(sent.at(-1)!.app).toEqual([]);
  });

  it('skips a row whose payload will not parse, rather than the list', () => {
    // One corrupt theme should cost you that theme, not every other one.
    rows.app = [
      { id: 'good', label: 'Good', payload: JSON.stringify({ id: 'good', label: 'Good' }) },
      { id: 'bad', label: 'Bad', payload: '{not json' },
    ];
    const { post, sent } = collect();
    handleGetThemes(post);
    expect((sent[0].app as unknown[]).map(t => (t as { id: string }).id)).toEqual(['good']);
  });

  it('ignores a message that names neither table', () => {
    const { post, sent } = collect();
    handleSaveTheme({ kind: 'sql', theme: { id: 'x', label: 'X' } }, post);
    handleDeleteTheme({ kind: 'sql', id: 'x' }, post);
    expect(sent).toHaveLength(0);
  });

  it('ignores a theme with no id or no name', () => {
    const { post, sent } = collect();
    handleSaveTheme({ kind: 'app', theme: { label: 'No id' } }, post);
    handleSaveTheme({ kind: 'app', theme: { id: 'no-label' } }, post);
    expect(sent).toHaveLength(0);
    expect(rows.app).toEqual([]);
  });

  it('trusts the row for id and name over whatever the payload claims', () => {
    // The columns are what a query orders and joins on; a payload that
    // disagreed with them would make the list and the table two lists.
    rows.app = [{
      id: 'row-id', label: 'Row label',
      payload: JSON.stringify({ id: 'payload-id', label: 'Payload label', accent: '#fff' }),
    }];
    const { post, sent } = collect();
    handleGetThemes(post);
    expect(sent[0].app).toEqual([{ id: 'row-id', label: 'Row label', accent: '#fff' }]);
  });
});
