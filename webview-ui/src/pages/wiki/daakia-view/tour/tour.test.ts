/**
 * The tour points at screens that exist.
 *
 * A stop names a capture by id. Recapturing a section rewrites those files,
 * and dropping or renaming a screen would leave a stop showing an empty frame
 * — which nobody notices until a reader hits that step. This turns it into a
 * failing test at the moment the capture goes away.
 */
import { describe, it, expect } from 'vitest';
import { TOUR_STOPS, tourChapters } from './tour-stops';
import { REST_CAPTURES } from '../rest/captures';
import { PLATFORM_CAPTURES } from '../platform/captures';
import { MOCK_SERVER_CAPTURES } from '../mock-server/captures';
import { DK8S_CAPTURES } from '../dk8s/captures';
import { GQL_CAPTURES } from '../gql/captures';
import { GRPC_CAPTURES } from '../grpc/captures';
import { SOAP_CAPTURES } from '../soap/captures';
import { WEBSOCKET_CAPTURES } from '../websocket/captures';

const BY_SECTION = {
  rest: REST_CAPTURES,
  platform: PLATFORM_CAPTURES,
  'mock-server': MOCK_SERVER_CAPTURES,
  dk8s: DK8S_CAPTURES,
  graphql: GQL_CAPTURES,
  grpc: GRPC_CAPTURES,
  soap: SOAP_CAPTURES,
  realtime: WEBSOCKET_CAPTURES,
} as const;

describe('every stop has its picture', () => {
  it.each(TOUR_STOPS.map(s => [s.id, s.section, s.capture]))(
    '%s finds %s/%s',
    (_id, section, capture) => {
      const entry = BY_SECTION[section as keyof typeof BY_SECTION].find(c => c.id === capture);
      expect(entry, `${capture} is missing from ${section} captures`).toBeTruthy();
      expect(entry!.html.length).toBeGreaterThan(1000);
    },
  );
});

describe('the stops themselves', () => {
  it('gives every stop a unique id', () => {
    const ids = TOUR_STOPS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('writes a title, a blurb and at least two markers for each', () => {
    for (const s of TOUR_STOPS) {
      expect(s.title, s.id).toBeTruthy();
      expect(s.blurb.length, s.id).toBeGreaterThan(40);
      expect(s.hotspots.length, s.id).toBeGreaterThanOrEqual(2);
    }
  });

  /* A marker outside the frame is invisible, and one at exactly 0 or 100 sits
     half off the edge — both read as a missing marker. Only checked where the
     marker carries coordinates; an anchored one is positioned from the capture
     at render time and cannot be checked from here. */
  it('keeps every hard-coded marker inside the picture', () => {
    for (const s of TOUR_STOPS) {
      for (const h of s.hotspots) {
        if (h.x == null || h.y == null) continue;
        expect(h.x, `${s.id} · ${h.title}`).toBeGreaterThan(1);
        expect(h.x, `${s.id} · ${h.title}`).toBeLessThan(99);
        expect(h.y, `${s.id} · ${h.title}`).toBeGreaterThan(1);
        expect(h.y, `${s.id} · ${h.title}`).toBeLessThan(99);
      }
    }
  });

  /* A marker with neither an anchor nor coordinates has nowhere to go and is
     dropped at render — which looks exactly like a marker somebody forgot. */
  it('gives every marker something to aim at', () => {
    for (const s of TOUR_STOPS) {
      for (const h of s.hotspots) {
        const aimed = Boolean(h.anchor) || (h.x != null && h.y != null);
        expect(aimed, `${s.id} · ${h.title} has no anchor and no coordinates`).toBe(true);
      }
    }
  });

  it('says something on every marker', () => {
    for (const s of TOUR_STOPS) {
      for (const h of s.hotspots) {
        expect(h.title, s.id).toBeTruthy();
        expect(h.body.length, `${s.id} · ${h.title}`).toBeGreaterThan(30);
      }
    }
  });

  /* Two markers on top of each other is one marker you can click and one you
     cannot. The dot is 26px on a 1280×720 frame — about 2% by 3.6%. */
  it('does not stack two hard-coded markers on the same spot', () => {
    for (const s of TOUR_STOPS) {
      for (let i = 0; i < s.hotspots.length; i++) {
        for (let j = i + 1; j < s.hotspots.length; j++) {
          const a = s.hotspots[i], b = s.hotspots[j];
          if (a.x == null || a.y == null || b.x == null || b.y == null) continue;
          const overlaps = Math.abs(a.x - b.x) < 2.5 && Math.abs(a.y - b.y) < 4;
          expect(overlaps, `${s.id}: "${a.title}" and "${b.title}" overlap`).toBe(false);
        }
      }
    }
  });

  /* Two markers on one anchor is one marker you can click and one you cannot,
     the same failure as two on one coordinate. */
  it('does not aim two markers at the same anchor', () => {
    for (const s of TOUR_STOPS) {
      const anchors = s.hotspots
        .filter(h => h.anchor)
        .map(h => `${h.anchor}#${h.nth ?? 0}`);
      expect(new Set(anchors).size, s.id).toBe(anchors.length);
    }
  });
});

describe('chapters', () => {
  it('groups the stops without losing any', () => {
    const grouped = tourChapters().flatMap(c => c.stops);
    expect(grouped).toHaveLength(TOUR_STOPS.length);
    expect(grouped.map(s => s.id)).toEqual(TOUR_STOPS.map(s => s.id));
  });

  /* The chapter rail draws one group per chapter, so a chapter that appears,
     stops and appears again would draw twice and read as two chapters. */
  it('keeps each chapter contiguous', () => {
    const names = tourChapters().map(c => c.chapter);
    expect(new Set(names).size).toBe(names.length);
  });
});
