import { describe, it, expect } from 'vitest';
import { sourceTagFor } from './source-tag';
import type { LogLine } from '../../store/k8s-store';

describe('sourceTagFor', () => {
  it('tags nothing when every line is live', () => {
    expect(sourceTagFor([{ source: 'live' }, { source: 'live' }])).toBeUndefined();
  });

  it('tags each line once an archive is in the mix, naming the file', () => {
    const tag = sourceTagFor([{ source: 'live' }, { source: 'archive' }])!;
    expect(tag({ source: 'archive', rel: 'zp-backend.2026-10-03.27.log' } as unknown as LogLine))
      .toMatchObject({ label: 'archive', title: 'Archived file: zp-backend.2026-10-03.27.log' });
    expect(tag({ source: 'live' } as unknown as LogLine)).toMatchObject({ label: 'live' });
  });
});
