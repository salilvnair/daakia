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

/** Markdown images, HTML ones, and a bare image URL on its own line. */
const MD_IMAGE = /!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;
const HTML_IMAGE = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
const BARE_IMAGE = /^\s*(https?:\/\/\S+\.(?:png|jpe?g|gif|webp))\s*$/gim;

export function imagesIn(markdown: string): string[] {
  const out: string[] = [];
  for (const re of [MD_IMAGE, HTML_IMAGE, BARE_IMAGE]) {
    for (const m of markdown.matchAll(re)) if (m[1]) out.push(m[1]);
  }
  return [...new Set(out)];
}

export function withoutImages(markdown: string): string {
  return markdown
    .replace(MD_IMAGE, '')
    .replace(HTML_IMAGE, '')
    .replace(BARE_IMAGE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function GhProse({ content, gallery = true, height = 84 }: {
  content: string;
  /** False where the caller draws its own gallery — screen 14's body does. */
  gallery?: boolean;
  height?: number;
}) {
  const images = useMemo(() => (gallery ? imagesIn(content) : []), [content, gallery]);
  const prose = useMemo(
    () => (gallery ? withoutImages(content) : content),
    [content, gallery],
  );

  return (
    <>
      {prose.trim()
        ? <div className="dkgh-md"><MarkdownView content={prose} /></div>
        : images.length === 0
          ? <span style={{ color: 'var(--dk-faint)' }}>Nothing written.</span>
          : null}

      {images.length > 0 && (
        <div className="gallery" style={{ marginTop: prose.trim() ? 8 : 0 }}>
          {images.map(url => (
            <GhEvidence key={url} url={url} height={height} />
          ))}
        </div>
      )}
    </>
  );
}
