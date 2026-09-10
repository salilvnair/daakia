/**
 * The right-click menus every protocol request panel shares.
 *
 * REST, GraphQL, gRPC, SOAP, WebSocket, SSE and MCP all put a URL at the top,
 * a strip of sections under it and key-value tables inside those sections. The
 * verbs are the same in all of them — copy the URL, copy the table as JSON,
 * turn every row off, clear the body — so they are written once here and each
 * panel marks its parts and spreads one handler. A protocol with something of
 * its own adds it in its own file rather than growing a flag in this one.
 *
 * Nothing here is a second way to do something the panel cannot already do,
 * except the two that only a menu can offer at all: copying the request as a
 * cURL command, and copying a table as JSON.
 */
import type { ContextMenuItem } from '@salilvnair/dui';
import {
  CopyIcon, LinkIcon, TrashIcon, PlusIcon, CheckIcon, EyeOffIcon, CodeIcon,
  PasteIcon, TerminalIcon,
} from '../../../icons';
import { MENU, copyText, sep, type Surface } from './SurfaceMenu';

const SZ = 13;

/** One row of a key-value table, in the shape every protocol stores them. */
export interface KvRow { key: string; value: string; enabled?: boolean; description?: string }

/** What a panel has to hand the menu for the shared items to work. */
export interface RequestMenuCtx {
  method: string;
  url: string;
  headers: KvRow[];
  params: KvRow[];
  body: string;
  /** Reads back the table a `data-menu="kv"` mark names, and writes it. */
  rowsOf: (name: string) => KvRow[] | undefined;
  setRows: (name: string, rows: KvRow[]) => void;
  setUrl: (url: string) => void;
  setBody: (body: string) => void;
}

/**
 * The items for a marked surface, or nothing if this file has no opinion.
 *
 * Returning nothing matters: it leaves the browser's own menu in place, which
 * is the right answer over a text selection or a control nobody has thought
 * about yet. A menu with one greyed-out row is worse than no menu.
 */
export function requestMenuItems(
  surface: Surface, ctx: RequestMenuCtx,
): ContextMenuItem[] | undefined {
  switch (surface.kind) {
    case 'url': return urlItems(ctx);
    case 'kv': return kvItems(surface.data.table ?? '', surface.data.label ?? 'rows', ctx);
    case 'body': return bodyItems(ctx);
    case 'panel': return panelItems(ctx);
    default: return undefined;
  }
}

function urlItems(ctx: RequestMenuCtx): ContextMenuItem[] {
  return [
    {
      id: 'copy-url',
      label: 'Copy the URL',
      icon: <LinkIcon size={SZ} />,
      iconColor: MENU.copy,
      disabled: !ctx.url.trim(),
      onClick: () => copyText(ctx.url),
    },
    {
      id: 'copy-curl',
      label: 'Copy as a cURL command',
      description: 'Method, headers, and body — the request as somebody else can run it',
      icon: <TerminalIcon size={SZ} />,
      iconColor: MENU.copy,
      disabled: !ctx.url.trim(),
      onClick: () => copyText(toCurl(ctx)),
    },
    {
      id: 'paste-url',
      label: 'Paste over it',
      icon: <PasteIcon size={SZ} />,
      iconColor: MENU.make,
      onClick: async () => {
        const text = await navigator.clipboard?.readText();
        if (text) ctx.setUrl(text.trim());
      },
    },
    sep('s1'),
    {
      id: 'clear-url',
      label: 'Clear the URL',
      danger: true,
      icon: <TrashIcon size={SZ} />,
      iconColor: MENU.destroy,
      disabled: !ctx.url,
      onClick: () => ctx.setUrl(''),
    },
  ];
}

/**
 * A key-value table.
 *
 * `Turn every row off` rather than deleting them is the one people actually
 * want: bisecting a request by switching headers off and on is the whole
 * reason the tick column exists, and doing it by hand for eleven rows is why
 * people give up and delete them instead.
 */
function kvItems(table: string, label: string, ctx: RequestMenuCtx): ContextMenuItem[] | undefined {
  const rows = ctx.rowsOf(table);
  if (!rows) return undefined;

  const filled = rows.filter(r => r.key.trim() || r.value.trim());
  const anyOn = filled.some(r => r.enabled !== false);

  return [
    {
      id: 'add',
      label: `Add a row`,
      icon: <PlusIcon size={SZ} />,
      iconColor: MENU.make,
      onClick: () => ctx.setRows(table, [...rows, { key: '', value: '', enabled: true }]),
    },
    sep('s1'),
    {
      id: 'copy-json',
      label: `Copy ${label} as JSON`,
      icon: <CodeIcon size={SZ} />,
      iconColor: MENU.copy,
      disabled: filled.length === 0,
      onClick: () => copyText(JSON.stringify(
        Object.fromEntries(filled.filter(r => r.enabled !== false).map(r => [r.key, r.value])),
        null, 2,
      )),
    },
    {
      id: 'copy-text',
      label: `Copy ${label} as text`,
      description: 'One `key: value` per line, for a ticket or a message',
      icon: <CopyIcon size={SZ} />,
      iconColor: MENU.copy,
      disabled: filled.length === 0,
      onClick: () => copyText(filled.map(r => `${r.key}: ${r.value}`).join('\n')),
    },
    sep('s2'),
    {
      id: 'toggle-all',
      label: anyOn ? 'Turn every row off' : 'Turn every row on',
      description: anyOn
        ? 'Keeps them, so you can put them back one at a time'
        : undefined,
      icon: anyOn ? <EyeOffIcon size={SZ} /> : <CheckIcon size={SZ} />,
      iconColor: anyOn ? MENU.quiet : MENU.make,
      disabled: filled.length === 0,
      onClick: () => ctx.setRows(table, rows.map(r => ({ ...r, enabled: !anyOn }))),
    },
    {
      id: 'clear',
      label: `Delete every row`,
      danger: true,
      icon: <TrashIcon size={SZ} />,
      iconColor: MENU.destroy,
      disabled: filled.length === 0,
      onClick: () => ctx.setRows(table, []),
    },
  ];
}

function bodyItems(ctx: RequestMenuCtx): ContextMenuItem[] {
  let pretty: string | undefined;
  try {
    pretty = JSON.stringify(JSON.parse(ctx.body), null, 2);
  } catch {
    /* Not JSON, or not valid JSON yet. Either way there is nothing to format,
       and a Format that silently does nothing is worse than one that is off. */
  }

  return [
    {
      id: 'copy-body',
      label: 'Copy the body',
      icon: <CopyIcon size={SZ} />,
      iconColor: MENU.copy,
      disabled: !ctx.body.trim(),
      onClick: () => copyText(ctx.body),
    },
    {
      id: 'paste-body',
      label: 'Paste over it',
      icon: <PasteIcon size={SZ} />,
      iconColor: MENU.make,
      onClick: async () => {
        const text = await navigator.clipboard?.readText();
        if (text) ctx.setBody(text);
      },
    },
    sep('s1'),
    {
      id: 'format',
      label: 'Format the JSON',
      description: pretty ? undefined : 'The body is not valid JSON',
      icon: <CodeIcon size={SZ} />,
      iconColor: MENU.read,
      disabled: !pretty || pretty === ctx.body,
      onClick: () => pretty && ctx.setBody(pretty),
    },
    sep('s2'),
    {
      id: 'clear-body',
      label: 'Clear the body',
      danger: true,
      icon: <TrashIcon size={SZ} />,
      iconColor: MENU.destroy,
      disabled: !ctx.body,
      onClick: () => ctx.setBody(''),
    },
  ];
}

/**
 * The fallback, for a right-click on the panel's own background.
 *
 * Nothing rather than a menu of greyed-out rows: on an untitled request with no
 * URL yet there is genuinely nothing to offer, and a menu that opens only to
 * say so is worse than the browser's own.
 */
function panelItems(ctx: RequestMenuCtx): ContextMenuItem[] | undefined {
  if (!ctx.url.trim()) return undefined;
  return [
    {
      id: 'copy-curl',
      label: 'Copy as a cURL command',
      icon: <TerminalIcon size={SZ} />,
      iconColor: MENU.copy,
      disabled: !ctx.url.trim(),
      onClick: () => copyText(toCurl(ctx)),
    },
    {
      id: 'copy-url',
      label: 'Copy the URL',
      icon: <LinkIcon size={SZ} />,
      iconColor: MENU.copy,
      disabled: !ctx.url.trim(),
      onClick: () => copyText(ctx.url),
    },
  ];
}

/**
 * The request as a cURL command.
 *
 * Single-quoted, with any single quote in a value escaped the only way a POSIX
 * shell allows — close the quote, emit an escaped one, reopen — because a
 * header value containing an apostrophe is common and a command that breaks on
 * one is worse than no command at all. Rows that are switched off are left out:
 * the point is a command that does what the panel does.
 */
export function toCurl(ctx: RequestMenuCtx): string {
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

  const url = new URLSearchParams(
    ctx.params.filter(p => p.enabled !== false && p.key.trim()).map(p => [p.key, p.value]),
  ).toString();
  const full = url ? `${ctx.url}${ctx.url.includes('?') ? '&' : '?'}${url}` : ctx.url;

  const parts = [`curl -X ${ctx.method} ${q(full)}`];
  for (const h of ctx.headers) {
    if (h.enabled === false || !h.key.trim()) continue;
    parts.push(`  -H ${q(`${h.key}: ${h.value}`)}`);
  }
  if (ctx.body.trim()) parts.push(`  -d ${q(ctx.body)}`);
  return parts.join(' \\\n');
}
