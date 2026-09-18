/**
 * What the template engine can do, written down.
 *
 * ── Why a separate list from the engine itself ──
 *
 * `render.ts` dispatches helpers through a chain of `if (helperName === …)`,
 * which is fine to execute and impossible to enumerate. Nothing could offer
 * the reader a list of what exists, so sixty working helpers were worth about
 * as much as none: the only way to find `{{randomDate}}` was to already know
 * it was there.
 *
 * This is that list — for the `{{` completion popup in every value field, for
 * the Scripts snippets panel, and for the wiki page. It has no imports on
 * purpose, so the webview can read the same file through an alias instead of
 * keeping its own copy of the vocabulary and slowly disagreeing with the
 * engine about it.
 *
 * `catalog.test.ts` runs every `example` here through the real engine and
 * fails if one comes back unhandled, so an entry cannot describe a helper
 * that does not exist and a renamed helper cannot quietly keep its old entry.
 *
 * The `$`-prefixed dynamic variables are NOT here. They already carry their
 * own name, description, category and example in `services/variables`, and
 * copying sixty of them into a second list would be the exact drift this file
 * exists to avoid — the host sends those to the webview at startup instead.
 */

export type HelperCategory =
  | 'random' | 'date' | 'request' | 'string' | 'number' | 'json' | 'encode' | 'logic' | 'fake';

export interface HelperDoc {
  /** As typed, without the braces. */
  name: string;
  /** The shape of a call, for the completion popup's detail line. */
  signature: string;
  summary: string;
  /** A real call, written for a reader. */
  example: string;
  /**
   * What the guard test runs, when the example alone cannot stand up.
   *
   * `{{val 'id'}}` is the right thing to show somebody and produces nothing
   * on its own, because the `{{assign}}` it reads back has not happened. The
   * example stays honest for the reader and the test runs the pair.
   */
  testWith?: string;
  category: HelperCategory;
}

export const HELPER_CATEGORY_LABELS: Record<HelperCategory, string> = {
  random: 'Random',
  date: 'Date & time',
  request: 'This request',
  string: 'Text',
  number: 'Maths',
  json: 'JSON',
  encode: 'Encoding',
  logic: 'Comparison',
  fake: 'Fake data',
};

export const TEMPLATE_HELPERS: HelperDoc[] = [
  // ── Random ──────────────────────────────────────────────────────────────
  {
    name: 'randomInt',
    signature: 'randomInt min max',
    summary: 'A whole number in the range, both ends included.',
    example: '{{randomInt 1 100}}',
    category: 'random',
  },
  {
    name: 'randomDecimal',
    signature: 'randomDecimal min max',
    summary: 'A number in the range, to two decimal places.',
    example: '{{randomDecimal 0 99.99}}',
    category: 'random',
  },
  {
    name: 'randomValue',
    signature: "randomValue type='UUID'",
    summary: 'UUID, ALPHABETIC, ALPHANUMERIC, NUMERIC, HEX or EMAIL.',
    example: "{{randomValue type='HEX'}}",
    category: 'random',
  },
  {
    name: 'pickRandom',
    signature: 'pickRandom a b c',
    summary: 'One of the values you list.',
    example: "{{pickRandom 'gold' 'silver' 'bronze'}}",
    category: 'random',
  },

  // ── Date & time ─────────────────────────────────────────────────────────
  {
    name: 'now',
    signature: "now format='ISO' offset='0'",
    summary: 'The current time. Offset is in seconds, and may be negative.',
    example: "{{now format='yyyy-MM-dd HH:mm:ss'}}",
    category: 'date',
  },
  {
    name: 'randomDate',
    signature: "randomDate from to format='ISO'",
    summary: "A moment inside a window. Ends are 'now', an offset like '-30d', or a date.",
    example: "{{randomDate '-30d' 'now'}}",
    category: 'date',
  },
  {
    name: 'formatDate',
    signature: "formatDate date 'yyyy-MM-dd'",
    summary: 'Reformat a date you already have. ISO, UTC, EPOCH, MS or a pattern.',
    example: "{{formatDate '2026-01-31T09:00:00Z' 'yyyy-MM-dd'}}",
    category: 'date',
  },

  // ── This request ────────────────────────────────────────────────────────
  {
    name: 'request.url',
    signature: 'request.url',
    summary: 'The URL this request is about to be sent to.',
    example: '{{request.url}}',
    category: 'request',
  },
  {
    name: 'request.method',
    signature: 'request.method',
    summary: 'GET, POST, and so on.',
    example: '{{request.method}}',
    category: 'request',
  },
  {
    name: 'request.path',
    signature: 'request.path',
    summary: 'The path alone, without host or query.',
    example: '{{request.path}}',
    category: 'request',
  },
  {
    name: 'request.headers',
    signature: 'request.headers.Name',
    summary: "One of this request's own headers.",
    example: '{{request.headers.Content-Type}}',
    category: 'request',
  },
  {
    name: 'request.query',
    signature: 'request.query.name',
    summary: 'A query parameter of this request.',
    example: '{{request.query.page}}',
    category: 'request',
  },
  {
    name: 'request.body',
    signature: 'request.body.field',
    summary: 'The body, or a field of it when it is JSON.',
    example: '{{request.body}}',
    category: 'request',
  },
  {
    name: 'jsonPath',
    signature: "jsonPath request.body '$.field'",
    summary: 'Pull a value out of JSON — the body of this request, or any JSON string.',
    example: "{{jsonPath request.body '$.id'}}",
    category: 'request',
  },

  // ── Reuse one value twice ───────────────────────────────────────────────
  {
    name: 'assign',
    signature: "assign 'name' value",
    summary: 'Remember a value for the rest of this field. Produces nothing itself.',
    example: "{{assign 'id' (randomValue type='UUID')}}",
    testWith: "{{assign 'id' 'x'}}{{val 'id'}}",
    category: 'logic',
  },
  {
    name: 'val',
    signature: "val 'name'",
    summary: 'Read back what assign remembered — how you use one random value twice.',
    example: "{{val 'id'}}",
    testWith: "{{assign 'id' 'x'}}{{val 'id'}}",
    category: 'logic',
  },

  // ── Text ────────────────────────────────────────────────────────────────
  { name: 'upper', signature: 'upper value', summary: 'Uppercase.', example: "{{upper 'abc'}}", category: 'string' },
  { name: 'lower', signature: 'lower value', summary: 'Lowercase.', example: "{{lower 'ABC'}}", category: 'string' },
  { name: 'trim', signature: 'trim value', summary: 'Drop surrounding whitespace.', example: "{{trim ' a '}}", category: 'string' },
  { name: 'capitalize', signature: 'capitalize value', summary: 'First letter up, rest down.', example: "{{capitalize 'abc'}}", category: 'string' },
  {
    name: 'replace',
    signature: 'replace value find with',
    summary: 'Replace every occurrence.',
    example: "{{replace 'a-b' '-' '_'}}",
    category: 'string',
  },
  {
    name: 'substring',
    signature: 'substring value start end',
    summary: 'A slice of the text.',
    example: "{{substring 'abcdef' 0 3}}",
    category: 'string',
  },
  {
    name: 'split',
    signature: 'split value separator index',
    summary: 'Split, and optionally take one piece.',
    example: "{{split 'a,b,c' ',' 1}}",
    category: 'string',
  },

  // ── Maths ───────────────────────────────────────────────────────────────
  { name: 'add', signature: 'add x y', summary: 'x + y', example: '{{add 2 3}}', category: 'number' },
  { name: 'subtract', signature: 'subtract x y', summary: 'x − y', example: '{{subtract 5 3}}', category: 'number' },
  { name: 'multiply', signature: 'multiply x y', summary: 'x × y', example: '{{multiply 4 3}}', category: 'number' },
  { name: 'divide', signature: 'divide x y', summary: 'x ÷ y', example: '{{divide 9 3}}', category: 'number' },
  { name: 'mod', signature: 'mod x y', summary: 'Remainder.', example: '{{mod 7 3}}', category: 'number' },

  // ── JSON ────────────────────────────────────────────────────────────────
  { name: 'toJson', signature: 'toJson value', summary: 'Serialise, indented.', example: "{{toJson 'a'}}", category: 'json' },
  {
    name: 'formatJson',
    signature: 'formatJson jsonString',
    summary: "Pretty-print JSON — most usefully this request's own body.",
    example: '{{formatJson request.body}}',
    category: 'json',
  },
  {
    name: 'arrayJoin',
    signature: "arrayJoin jsonArray ', '",
    summary: 'Join a JSON array into one string.',
    example: `{{arrayJoin '[1,2,3]' '-'}}`,
    category: 'json',
  },

  // ── Encoding ────────────────────────────────────────────────────────────
  {
    name: 'base64',
    signature: "base64 value decode='false'",
    summary: 'Base64 encode, or decode with decode=\'true\'.',
    example: "{{base64 'hello'}}",
    category: 'encode',
  },
  {
    name: 'urlEncode',
    signature: "urlEncode value decode='false'",
    summary: 'Percent-encode, or decode.',
    example: "{{urlEncode 'a b'}}",
    category: 'encode',
  },
  { name: 'md5', signature: 'md5 value', summary: 'MD5 hex digest.', example: "{{md5 'hello'}}", category: 'encode' },
  { name: 'sha256', signature: 'sha256 value', summary: 'SHA-256 hex digest.', example: "{{sha256 'hello'}}", category: 'encode' },

  // ── Comparison ──────────────────────────────────────────────────────────
  { name: 'eq', signature: 'eq a b', summary: 'true when equal.', example: "{{eq 'a' 'a'}}", category: 'logic' },
  { name: 'ne', signature: 'ne a b', summary: 'true when different.', example: "{{ne 'a' 'b'}}", category: 'logic' },
  { name: 'gt', signature: 'gt a b', summary: 'true when a is greater.', example: '{{gt 2 1}}', category: 'logic' },
  { name: 'lt', signature: 'lt a b', summary: 'true when a is smaller.', example: '{{lt 1 2}}', category: 'logic' },
  {
    name: 'contains',
    signature: 'contains haystack needle',
    summary: 'true when the text contains it.',
    example: "{{contains 'abc' 'b'}}",
    category: 'logic',
  },
  {
    name: 'matches',
    signature: 'matches value regex',
    summary: 'true when the regular expression matches.',
    example: "{{matches 'a1' '[a-z]\\\\d'}}",
    category: 'logic',
  },

  // ── Fake data ───────────────────────────────────────────────────────────
  {
    name: 'faker.name.fullName',
    signature: 'faker.name.fullName',
    summary: 'A person. Also name.firstName, name.lastName.',
    example: '{{faker.name.fullName}}',
    category: 'fake',
  },
  {
    name: 'faker.internet.email',
    signature: 'faker.internet.email',
    summary: 'An email address. Also internet.url.',
    example: '{{faker.internet.email}}',
    category: 'fake',
  },
  {
    name: 'faker.address.city',
    signature: 'faker.address.city',
    summary: 'A city. Also address.country, address.zipCode.',
    example: '{{faker.address.city}}',
    category: 'fake',
  },
  {
    name: 'faker.company.name',
    signature: 'faker.company.name',
    summary: 'A company.',
    example: '{{faker.company.name}}',
    category: 'fake',
  },
  {
    name: 'faker.lorem.sentence',
    signature: 'faker.lorem.sentence',
    summary: 'Filler text. Also lorem.word, lorem.paragraph.',
    example: '{{faker.lorem.sentence}}',
    category: 'fake',
  },
];
