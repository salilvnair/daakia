/**
 * Connect-time payload composer for the realtime protocols that can actually carry one.
 *
 * Protocol reality (why each variant looks different):
 *  - sse       — the connection IS an HTTP request, so it takes a real body. The SSE spec
 *                itself only ever describes a GET; carrying a body at all is the
 *                fetch-based extension (what OpenAI/Anthropic streaming use), and there
 *                POST is the universal convention — PUT/PATCH are theoretically possible
 *                but have no real-world usage, so the method is fixed to POST rather than
 *                offered as a misleading choice.
 *  - websocket — the handshake is semantically a GET and cannot carry a body at all, so
 *                the payload is sent as the first frame the moment the socket opens.
 *  - socketio  — the handshake carries an `auth` object (server reads socket.handshake.auth).
 *                JSON object only, so no Content-Type choice.
 * MQTT is absent on purpose: its CONNECT packet is a fixed structure (ClientID / Will /
 * User / Pass) with nowhere to put a free-form body, and it already publishes on connect.
 */
import { useState, useEffect } from 'react';
import { ModalView, ButtonView, SelectInputView, IconButtonView, EditorView, type EditorLanguage } from '@salilvnair/dui';
import { SendIcon, WandIcon, CopyIcon } from '../../../icons';
import { KeyValueTable, type KeyValueRow } from '../../shared';

const FORM_TYPE = 'application/x-www-form-urlencoded';

/** `a=1&b=2` ⇄ key/value rows. The wire format stays a query string so the extension host
 *  needs no new field — the table is purely an editing affordance, same as REST's. */
function parseFormBody(body: string): KeyValueRow[] {
  const rows: KeyValueRow[] = [];
  for (const pair of (body || '').split('&')) {
    if (!pair) continue;
    const i = pair.indexOf('=');
    const rawKey = i === -1 ? pair : pair.slice(0, i);
    const rawVal = i === -1 ? '' : pair.slice(i + 1);
    const safe = (s: string) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } };
    rows.push({ id: crypto.randomUUID(), key: safe(rawKey), value: safe(rawVal), enabled: true });
  }
  return rows;
}

function emptyFormRow(): KeyValueRow {
  return { id: crypto.randomUUID(), key: '', value: '', enabled: true };
}

function serializeFormBody(rows: KeyValueRow[]): string {
  return rows
    .filter(r => r.enabled && r.key.trim())
    .map(r => `${encodeURIComponent(r.key)}=${encodeURIComponent(r.value)}`)
    .join('&');
}

export type ConnectPayloadProtocol = 'sse' | 'websocket' | 'socketio';

/** Body editor height. Fixed rather than flexed — the modal body has no definite height of
 *  its own, so a percentage-height editor collapses to a hairline. */
const BODY_EDITOR_HEIGHT = 320;

/** Only the content types a streaming endpoint realistically accepts. REST's full list is
 *  deliberately NOT reused here: markdown/CSS/CSV/GraphQL/YAML bodies aren't a thing for an
 *  SSE connect, and multipart/binary can't be hand-authored in a text editor anyway. Keeping
 *  it to four also means the dropdown never needs to scroll. */
const CONTENT_TYPES = [
  { value: 'application/json', label: 'application/json' },
  { value: 'application/x-www-form-urlencoded', label: 'application/x-www-form-urlencoded' },
  { value: 'text/plain', label: 'text/plain' },
  { value: 'application/xml', label: 'application/xml' },
];

/** WebSocket frames carry NO content type on the wire — RFC 6455 has only text and binary
 *  frames, with no header to declare a format. This selector is therefore editor-side only
 *  (colouring / prettify / placeholder) and is never transmitted; it deliberately mirrors the
 *  WebSocket panel's own Message JSON|RAW selector so the two read as the same control.
 *  Socket.IO does NOT get this: its handshake `auth` must be a JSON object (the handler
 *  rejects anything else), so offering RAW there would only ever produce an error. */
const FRAME_FORMATS = [
  { value: 'json', label: 'JSON' },
  { value: 'raw', label: 'RAW' },
];

const LANG_BY_TYPE: Record<string, EditorLanguage> = {
  'application/json': 'json' as EditorLanguage,
  'application/xml': 'xml' as EditorLanguage,
  'text/plain': 'plaintext' as EditorLanguage,
  'application/x-www-form-urlencoded': 'plaintext' as EditorLanguage,
};

const PLACEHOLDER_BY_TYPE: Record<string, string> = {
  'application/json': '{\n  "subscribe": "orders"\n}',
  'application/xml': '<subscribe>\n  <topic>orders</topic>\n</subscribe>',
  'text/plain': 'subscribe orders',
  'application/x-www-form-urlencoded': 'subscribe=orders&token=abc123',
};

const COPY: Record<ConnectPayloadProtocol, { subtitle: string; bodyLabel: string }> = {
  sse: {
    subtitle: 'POSTed as the request body when the stream opens, then Daakia keeps listening',
    bodyLabel: 'Request Body',
  },
  websocket: {
    subtitle: 'Sent as the first message the moment the socket opens — the handshake itself cannot carry a body',
    bodyLabel: 'First Message',
  },
  socketio: {
    subtitle: 'Sent as the handshake auth payload — your server reads it at socket.handshake.auth',
    bodyLabel: 'Auth Payload (JSON)',
  },
};

interface Props {
  protocol: ConnectPayloadProtocol;
  accentColor: string;
  contentType: string;
  body: string;
  onContentTypeChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onSendAndConnect: () => void;
  onClose: () => void;
}

export function ConnectPayloadModal({
  protocol,
  accentColor,
  contentType,
  body,
  onContentTypeChange,
  onBodyChange,
  onSendAndConnect,
  onClose,
}: Props) {
  const isHttp = protocol === 'sse';
  const isWs = protocol === 'websocket';
  const isForm = isHttp && contentType === FORM_TYPE;
  const copy = COPY[protocol];

  // Rows live in local state, NOT derived from `body` on every render. serializeFormBody
  // drops rows with an empty key (they can't be represented in `a=1&b=2`), so a derived
  // list made "+ add row" a no-op: the new blank row serialised to nothing and was
  // immediately re-parsed out of existence. Local state lets a blank row exist while you
  // type into it; only completed pairs reach the wire string.
  const [formRows, setFormRows] = useState<KeyValueRow[]>([]);

  // Seed on entering form mode (not on every body change, which would clobber typing).
  useEffect(() => {
    if (!isForm) return;
    const parsed = parseFormBody(body);
    setFormRows(parsed.length ? parsed : [emptyFormRow()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isForm]);

  const handleFormRowsChange = (rows: KeyValueRow[]) => {
    setFormRows(rows);
    onBodyChange(serializeFormBody(rows));
  };

  const language = isHttp
    ? (LANG_BY_TYPE[contentType] ?? ('plaintext' as EditorLanguage))
    : ((isWs && contentType === 'raw' ? 'plaintext' : 'json') as EditorLanguage);
  const placeholder = isHttp
    ? PLACEHOLDER_BY_TYPE[contentType] ?? 'Request body'
    : (isWs && contentType === 'raw') ? 'subscribe orders' : '{\n  "token": "value"\n}';

  const canPrettify = !isForm && (language === 'json' || language === 'xml');

  /** Reformat the payload in place — JSON via parse/stringify (same as REST's body
   *  Prettify), XML via a light indent pass. Invalid input is left untouched. */
  const handlePrettify = () => {
    if (language === 'json') {
      try { onBodyChange(JSON.stringify(JSON.parse(body), null, 2)); } catch { /* leave invalid JSON alone */ }
      return;
    }
    if (language === 'xml') {
      const flat = body.replace(/>\s+</g, '><').trim();
      let depth = 0;
      const out = flat.replace(/></g, '>\n<').split('\n').map(line => {
        if (/^<\//.test(line)) depth = Math.max(0, depth - 1);
        const indented = '  '.repeat(depth) + line;
        if (/^<[^/!?][^>]*[^/]>$/.test(line)) depth += 1;
        return indented;
      }).join('\n');
      onBodyChange(out);
    }
  };

  return (
    <ModalView
      open={true}
      onClose={onClose}
      title="Send & Connect"
      subtitle={copy.subtitle}
      headerIcon={<SendIcon size={16} />}
      headerColor={accentColor}
      size="lg"
      footerRight={
        <ButtonView
          label="Send & Connect"
          iconLeft={<SendIcon size={13} />}
          variant="primary"
          size="md"
          accentColor={accentColor}
          onClick={onSendAndConnect}
        />
      }
    >
      <div className="flex flex-col gap-3 px-1">
        <div className="flex items-center gap-3 flex-wrap">
          {isHttp ? (
            <>
            {/* No Method control at all: POST is the only method a real SSE endpoint accepts
                a body on, so showing it would be decoration. The subtitle states it instead. */}
              <span className="text-[12px] text-[var(--color-text-muted)]">Content Type</span>
              <SelectInputView
                options={CONTENT_TYPES}
                value={contentType}
                onChange={onContentTypeChange}
                accentColor={accentColor}
                size="md"
              />
            </>
          ) : isWs ? (
            <>
              <span className="text-[12px] text-[var(--color-text-muted)]" title="Editor-side only — WebSocket frames carry no content type on the wire">Format</span>
              <SelectInputView
                options={FRAME_FORMATS}
                value={contentType === 'text' ? 'text' : 'json'}
                onChange={onContentTypeChange}
                accentColor={accentColor}
                size="md"
              />
            </>
          ) : null}

          {/* Same affordance as REST's body toolbar. Only offered where the payload has a
              structure worth reformatting. */}
          {canPrettify && (
            <div className="ml-auto flex items-center gap-1">
              <IconButtonView icon={<WandIcon size={14} />} size="md" tooltip="Prettify" onClick={handlePrettify} />
              <IconButtonView icon={<CopyIcon size={14} />} size="md" tooltip="Copy" onClick={() => navigator.clipboard?.writeText(body)} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] text-[var(--color-text-muted)]">{copy.bodyLabel}</span>
          {isForm ? (
            /* Form bodies are flat key/value pairs, so edit them as a table exactly like
               REST's x-www-form-urlencoded mode rather than making people hand-write
               percent-encoded `a=1&b=2`. Serialised back to a query string on change. */
            <div style={{ height: BODY_EDITOR_HEIGHT }} className="overflow-y-auto">
              <KeyValueTable
                rows={formRows}
                onChange={handleFormRowsChange}
                placeholder={{ key: 'Parameter', value: 'Value' }}
                accentColor={accentColor}
              />
            </div>
          ) : (
            <div style={{ height: BODY_EDITOR_HEIGHT }}>
              <EditorView
                value={body}
                onChange={onBodyChange}
                language={language}
                placeholder={placeholder}
                height="100%"
                bordered
              />
            </div>
          )}
        </div>
      </div>
    </ModalView>
  );
}
