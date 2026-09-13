/**
 * Somebody else's markdown, rendered where remote images cannot load.
 *
 * **The webview's content policy is `img-src ${cspSource} data:`.** A markdown
 * image pointing at `user-images.githubusercontent.com` — which is every
 * screenshot on every issue — is blocked, silently, with a broken-image box
 * where the evidence was. It renders perfectly in the browser dev build, which
 * is why nobody noticed.
 *
 * That is also the whole reason `GhEvidence` exists: bytes come through the
 * host and arrive as a `data:` URI. So the images come out of the prose and go
 * into a gallery underneath it, which is where screen 14 wanted them anyway —
 * see 14C.
 *
 * A remote image is never simply dropped. An issue whose only content is a
 * screenshot would otherwise render as nothing at all.
 */
import { useMemo } from 'react';
import { MarkdownView } from '@salilvnair/dui';
import { GhEvidence } from './GhEvidence';
import { Ico } from './GhIcons';

/** Markdown images, HTML ones, and a bare image URL on its own line. */
const MD_IMAGE = /!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;
const HTML_IMAGE = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
/*
  A bare image URL, by extension OR by being one of GitHub's own asset links.

  Anything uploaded through the issue composer since 2023 lands on
  `user-attachments/assets/<uuid>` with no extension at all, so an extension
  test alone missed every screenshot pasted into GitHub in the last two years.
*/
const BARE_IMAGE = new RegExp(
  String.raw`^\s*(https?:\/\/(?:\S+\.(?:png|jpe?g|gif|webp)|github\.com\/user-attachments\/assets\/\S+))\s*$`,
  'gim',
);

/**
 * A file somebody attached that is not an image.
 *
 * GitHub renders these as an ordinary markdown link, so a crash log, a HAR or
 * a heap dump — exactly the things a bug report is worth having — arrived as a
 * sentence-coloured link in the middle of prose and read as a reference rather
 * than a file. They are lifted out and drawn as what they are.
 *
 * Matched by where the URL points rather than by extension: GitHub's own
 * attachment paths are the reliable signal, and a `.log` hosted anywhere is
 * still a file worth showing.
 */
const MD_ATTACHMENT = new RegExp(
  String.raw`\[([^\]]+)\]\((https?:\/\/(?:github\.com\/(?:user-attachments\/files|[\w.-]+\/[\w.-]+\/files)\/\S+|\S+\.(?:log|txt|json|csv|har|zip|gz|tgz|pdf|hprof|jfr|yaml|yml|xml|patch|diff)))\)`,
  'gi',
);

export interface Attachment { label: string; url: string }

export function attachmentsIn(markdown: string): Attachment[] {
  const out: Attachment[] = [];
  const seen = new Set<string>();
  for (const m of markdown.matchAll(MD_ATTACHMENT)) {
    if (!m[2] || seen.has(m[2])) continue;
    seen.add(m[2]);
    out.push({ label: m[1].trim() || fileNameOf(m[2]), url: m[2] });
  }
  return out;
}

/** The last path segment, which is what GitHub names the file. */
function fileNameOf(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)) || url;
  } catch {
    return url;
  }
}

export function imagesIn(markdown: string): string[] {
  const out: string[] = [];
  for (const re of [MD_IMAGE, HTML_IMAGE, BARE_IMAGE]) {
    for (const m of markdown.matchAll(re)) if (m[1]) out.push(m[1]);
  }
  return [...new Set(out)];
}

export function withoutImages(markdown: string): string {
  return markdown
    .replace(MD_ATTACHMENT, '')
    .replace(MD_IMAGE, '')
    .replace(HTML_IMAGE, '')
    .replace(BARE_IMAGE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * `#113`, `owner/repo#113`, and a bare GitHub issue URL, as links.
 *
 * GitHub turns these into links on its own site, so a body written there —
 * "duplicate of #113" — arrives here as plain text and reads as a dead end.
 * The reader has the number and no way to use it without leaving for a
 * browser and searching.
 *
 * Deliberately narrow about what counts:
 *
 *   Inside a code span or fence, nothing is touched. `#1` in a shell snippet
 *   is a comment, and a colour in CSS is `#113` exactly.
 *
 *   Only after a boundary. `sha#113` and `v2.4#113` are not issue references,
 *   and neither is the fragment of a URL that already links somewhere.
 *
 *   Already-linked text is left alone — a markdown link whose text happens to
 *   be `#113` must not gain a second link inside it.
 */
const ISSUE_URL_SRC = String.raw`https?:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)`;
const ISSUE_REF_SRC = String.raw`((?:[\w.-]+\/[\w.-]+)?)#(\d+)`;

/*
  One pass, not two.

  Rewriting URLs and then references meant the second pass ran over text the
  first had already turned into `[#7](url)` — and matched the `#7` inside it,
  producing a link nested in a link that renders as neither. A single
  alternation consumes each match once, and the URL alternative is first so a
  full URL is never read as the bare reference at its end.
*/
const LINKABLE = new RegExp(
  String.raw`(^|[\s([{,;:>])\\?(?:` + ISSUE_URL_SRC + '|' + ISSUE_REF_SRC + ')\\b',
  'g',
);

/**
 * Everything markdown must not be rewritten inside.
 *
 * Fenced blocks and inline code, because `#1` in a shell snippet is a comment
 * and `#113` in CSS is a colour. Existing links, because a second link inside
 * one renders as neither. Raw HTML, because an attribute is not prose.
 */
const PROTECTED = /(```[\s\S]*?```|`[^`\n]*`|\[[^\]]*\]\([^)]*\)|<[^>]+>)/g;

/**
 * `#113`, `owner/repo#113` and a full GitHub issue URL, as links.
 *
 * GitHub linkifies these on its own site, so a body written there — "duplicate
 * of #113" — arrives as plain text and reads as a dead end: the reader has the
 * number and no way to use it without leaving for a browser.
 *
 * Without a repository a bare `#113` stays text, because a link that goes
 * nowhere is worse than no link.
 */
export function linkIssueRefs(markdown: string, repo?: string): string {
  return markdown.split(PROTECTED).map((chunk, i) => {
    /* Odd indices are the protected captures themselves. */
    if (i % 2 === 1) return chunk;
    return chunk.replace(LINKABLE, (m, pre, urlSlug, urlNum, refSlug, refNum) => {
      const slug = urlSlug || refSlug || repo;
      const num = urlNum ?? refNum;
      if (!slug || !num) return m;
      /* A reference to this repository reads as `#7`; anywhere else has to
         carry its slug or it is ambiguous. */
      const label = slug === repo ? `#${num}` : `${slug}#${num}`;
      return `${pre}[${label}](https://github.com/${slug}/issues/${num})`;
    });
  }).join('');
}
export function GhProse({ content, gallery = true, height = 84, repo, onOpenIssue, full = false }: {
  content: string;
  /**
   * Draw evidence at its own size rather than as a fixed-height strip.
   *
   * True in an issue body and a comment, where the screenshot IS the report.
   * False on a card, where a consistent row of thumbnails is the point.
   */
  full?: boolean;
  /** Which repository a bare `#113` belongs to. Without it, `#113` stays text. */
  repo?: string;
  /**
   * Open a reference to this repository inside dkgh instead of a browser.
   *
   * A duplicate-of link is the one case where leaving the app is exactly wrong:
   * the issue being pointed at is already on the board behind this panel, and
   * the reader wants to glance at it and come back, not lose their place to a
   * browser tab.
   *
   * References to other repositories still open externally — dkgh is looking at
   * one repository, and there is nothing here to show for a different one.
   */
  onOpenIssue?: (number: number) => void;
  /** False where the caller draws its own gallery — screen 14's body does. */
  gallery?: boolean;
  height?: number;
}) {
  const images = useMemo(() => (gallery ? imagesIn(content) : []), [content, gallery]);
  /* Lifted out of the prose wherever the gallery is drawn, for the same reason
     the images are: a file is a thing, not a sentence. */
  const files = useMemo(() => (gallery ? attachmentsIn(content) : []), [content, gallery]);
  const prose = useMemo(
    () => linkIssueRefs(gallery ? withoutImages(content) : content, repo),
    [content, gallery, repo],
  );

  return (
    <>
      {prose.trim()
        ? (
          <div
            className="dkgh-md"
            /*
              Caught on the way up rather than rewritten into every anchor:
              MarkdownView owns its own rendering, and a click handler on the
              container needs no cooperation from it.
            */
            onClick={e => {
              if (!onOpenIssue || !repo) return;
              const a = (e.target as HTMLElement).closest('a');
              const href = a?.getAttribute('href');
              if (!href) return;
              const m = href.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)$/);
              /* Only this repository, and only a left click with no modifier —
                 ctrl-click and middle-click still mean "open it over there". */
              if (!m || m[1] !== repo) return;
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              onOpenIssue(Number(m[2]));
            }}
          >
            <MarkdownView content={prose} />
          </div>
        )
        : images.length === 0
          ? <span style={{ color: 'var(--dk-faint)' }}>Nothing written.</span>
          : null}

      {files.length > 0 && (
        <div className="chips" style={{ marginTop: prose.trim() ? 8 : 0 }}>
          {files.map(f => (
            <a
              key={f.url}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="fct"
              style={{ textDecoration: 'none', cursor: 'pointer' }}
              title={f.url}
            >
              <Ico name="clip" />
              <span>{f.label}</span>
            </a>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <div className="gallery" style={{ marginTop: prose.trim() ? 8 : 0 }}>
          {images.map(url => (
            <GhEvidence key={url} url={url} height={height} full={full} />
          ))}
        </div>
      )}
    </>
  );
}
