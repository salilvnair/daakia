#!/usr/bin/env node
/**
 * Where Daakia lands in Marketplace search, and who is above it.
 *
 * The VS Code Marketplace ranks on relevance first and popularity second — by a
 * wider margin than anyone expects. A 110-install extension called "Telegraph
 * REST API Client" sits above a 531,000-install one for "rest api client", and
 * a 166-install extension outranks the 7.4-million-install official Kubernetes
 * extension for "kubernetes dashboard". So the useful question is never "how
 * popular are we", it is "does the phrase appear in a field that is weighted",
 * and the only way to answer it is to ask.
 *
 * Reads the public gallery API — the same endpoint the Marketplace website
 * calls. No credential, nothing written, nothing about the reader is sent.
 *
 *   npm run rank                          the default set of terms
 *   npm run rank -- "k9s" "rest client"   whichever terms you care about
 *   npm run rank -- --full "postman"      the top ten rather than the top three
 *
 * Run it before a metadata change and after the Marketplace reindexes, which
 * takes an hour or two. A term that does not move was not a term you were
 * competing for.
 */

const URL = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';
const ME = 'salilvnair.daakia';

/** The terms this extension is actually trying to be found for. */
const DEFAULT_TERMS = [
  // What it is
  'rest client', 'rest api client', 'api client', 'http client', 'api testing',
  // The protocols, each its own search
  'graphql client', 'grpc client', 'websocket client', 'soap client', 'mqtt client',
  // dk8s
  'kubernetes', 'kubernetes dashboard', 'k8s', 'k9s', 'pod logs',
  // dkgh
  'github issues', 'github dashboard', 'issue tracker',
  // How people arrive from somewhere else
  'postman', 'postman alternative', 'thunder client', 'insomnia', 'bruno',
  'hoppscotch', 'curl', 'openapi', 'swagger', 'mock server',
];

const args = process.argv.slice(2);
const full = args.includes('--full');
const terms = args.filter(a => !a.startsWith('--'));
const TERMS = terms.length ? terms : DEFAULT_TERMS;
const SHOW = full ? 10 : 3;

const stat = (e, name) => (e.statistics || []).find(s => s.statisticName === name)?.value ?? 0;
const num = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

async function search(text) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json;api-version=7.2-preview.1',
      'Content-Type': 'application/json',
      'User-Agent': 'daakia-marketplace-rank',
    },
    body: JSON.stringify({
      filters: [{
        criteria: [
          { filterType: 8, value: 'Microsoft.VisualStudio.Code' },
          { filterType: 10, value: text },
          /*
            What the Marketplace website itself excludes, and the reason this
            script's numbers are worth trusting.

            Without it the query returns extensions the public search does not:
            unpublished, unvalidated, and those failing their installation
            target. For "k9s" that meant reporting Daakia at #3 behind a
            nine-install extension that no reader can actually see — a rank
            that was wrong in the pessimistic direction, which is the worse
            way to be wrong when you are deciding whether a change worked.

            4096 is Unpublished; 12 is the excludeWithFlags criterion.
          */
          { filterType: 12, value: '4096' },
        ],
        pageNumber: 1,
        /* Fifty, not ten: "not in the top ten" and "nowhere at all" are
           different problems, and only one of them is fixable with words. */
        pageSize: 50,
        sortBy: 0,   // relevance — what a person actually sees
        sortOrder: 0,
      }],
      flags: 0x1 | 0x100,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json.results?.[0]?.extensions ?? []).map((e, i) => ({
    rank: i + 1,
    id: `${e.publisher.publisherName}.${e.extensionName}`,
    name: e.displayName,
    installs: stat(e, 'install'),
    rating: stat(e, 'averagerating'),
    ratings: stat(e, 'ratingcount'),
  }));
}

(async () => {
  const summary = [];

  for (const term of TERMS) {
    let rows;
    try {
      rows = await search(term);
    } catch (err) {
      console.log(`\n"${term}" — ${err.message}`);
      continue;
    }

    const mine = rows.find(r => r.id === ME);
    const where = mine ? `#${mine.rank}` : `not in top ${rows.length}`;
    summary.push({ term, rank: mine ? mine.rank : null, of: rows.length });

    console.log(`\n"${term}"  —  ${where}`);
    for (const r of rows.slice(0, SHOW)) {
      const me = r.id === ME ? ' <-- us' : '';
      console.log(
        `  ${String(r.rank).padStart(2)}. ${num(r.installs).padStart(6)}  ` +
        `${r.rating ? r.rating.toFixed(1) + '*' : '   -'}  ${r.name.slice(0, 44)}${me}`,
      );
    }
    /* Show our row even when it is below the cut — the number is the point. */
    if (mine && mine.rank > SHOW) {
      console.log(`   ...`);
      console.log(`  ${String(mine.rank).padStart(2)}. ${num(mine.installs).padStart(6)}  ` +
                  `${'   -'}  ${mine.name.slice(0, 44)} <-- us`);
    }
  }

  const placed = summary.filter(s => s.rank);
  console.log(`\n${'-'.repeat(58)}`);
  console.log(`ranked for ${placed.length} of ${summary.length} terms`);
  const top10 = placed.filter(s => s.rank <= 10);
  if (top10.length) {
    console.log(`top ten  : ${top10.map(s => `${s.term} #${s.rank}`).join(', ')}`);
  }
  const absent = summary.filter(s => !s.rank).map(s => s.term);
  if (absent.length) console.log(`absent   : ${absent.join(', ')}`);
})();
