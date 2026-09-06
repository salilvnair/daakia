/**
 * The shell-and-files half of dk8s: a real PTY, the file browser, and the
 * settings that govern both.
 *
 * These are one page rather than three because they became one workflow — a
 * search hit opens a shell in the folder holding it, and a folder opens a
 * shell standing in itself. Documenting the terminal without the Explorer
 * would describe half of every route into it.
 */
import { WikiScrollPage } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, WikiTable, Callout, Divider, Code, CodeBlock,
  chips, TocBar, type TocItem,
} from '../shared/WikiShared';

const TOC_ITEMS: TocItem[] = [
  { id: 'tm-shell', emoji: '⌨️', label: 'The terminal' },
  { id: 'tm-transport', emoji: '🔌', label: 'How it connects' },
  { id: 'tm-keys', emoji: '🎹', label: 'Keys and behaviour' },
  { id: 'tm-themes', emoji: '🎨', label: 'Themes' },
  { id: 'tm-files', emoji: '📁', label: 'The Explorer' },
  { id: 'tm-here', emoji: '📍', label: 'Open shell here' },
  { id: 'tm-downloads', emoji: '⬇️', label: 'Downloads' },
  { id: 'tm-settings', emoji: '⚙️', label: 'Settings' },
];

export function Dk8sTerminalView() {
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          emoji="⌨️"
          title="dk8s — terminal & files"
          subtitle="A real PTY in the pod, a file browser beside it, and a shell that opens where you are looking."
          chips={chips(['exec API', 'xterm', 'no open port', 'themes', 'du -sk', 'kubectl cp'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <SectionTitle id="tm-shell" emoji="⌨️">The terminal</SectionTitle>
        <p className="dw-p">
          The Terminal tab is a real terminal in the container, drawn in the panel. It opens as
          soon as you arrive — the tab is called Terminal and there is exactly one thing it does,
          so a splash screen with a button for the only available action was a click in the way.
          While the shell probe and the socket are in flight you get a prompt-shaped skeleton
          rather than a black rectangle.
        </p>
        <WikiTable
          headers={['Chip', 'Means']}
          rows={[
            [<Code>live</Code>, 'The socket is open and the shell is running'],
            [<Code>connecting</Code>, 'Probing for a shell, then opening the session'],
            [<Code>bash</Code> as React.ReactNode, <>Which shell answered — <Code>bash</Code>, <Code>sh</Code> or <Code>ash</Code>, tried in that order</>],
            [<Code>tty</Code>, 'A real PTY: resize, Ctrl-C and full-screen tools all work'],
            [<Code>/data</Code>, 'The directory it started in, when it was opened from a file or folder'],
            [<Code>ended</Code>, 'The shell exited, or you ended it'],
          ]}
        />
        <Callout type="info" title="The shell ends when you leave the tab">
          A shell that outlives the window that opened it is a process inside someone&rsquo;s pod
          that nobody can see and nobody will close. Leaving the tab closes the session; there is a
          ceiling of eight open at once, and opening past it fails loudly rather than silently
          evicting the oldest.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="tm-transport" emoji="🔌">How it connects</SectionTitle>
        <p className="dw-p">
          Over the Kubernetes exec API, using your own kubeconfig — certificates, tokens and
          credential plugins alike. <b>No port is opened and nothing is left listening.</b>
        </p>

        <SubTitle>Why not <Code>kubectl exec</Code> in a subprocess</SubTitle>
        <p className="dw-p">
          A terminal needs a PTY on the client side, and spawning kubectl with piped stdio does not
          have one: kubectl refuses <Code>-t</Code>, so there is no prompt echo, no window-size
          negotiation, no job control, and <Code>top</Code>, <Code>vi</Code> or <Code>less</Code>
          render as garbage. It is the shortcut that produces a terminal which looks right and
          misbehaves.
        </p>

        <SubTitle>Why not <Code>kubectl proxy</Code></SubTitle>
        <p className="dw-p">
          It works, and it was the first thing tried. It also opens an <b>unauthenticated local
          port carrying your full cluster privileges</b> — anything else on the machine can use it,
          with no credential of its own, for as long as it is open. It cannot be narrowed either:
          <Code>--reject-paths</Code> is deny-only and Go&rsquo;s RE2 has no negative lookahead, so
          there is no way to say &ldquo;allow exec on this one pod and nothing else&rdquo;. For a
          tool many people run against production, that is not an acceptable thing to leave running.
        </p>

        <Callout type="warn" title="What is never logged">
          Everything typed into a shell passes through the host, which on any real incident includes
          a password, a token or a connection string. dk8s audits the <i>act</i> of opening a
          terminal — it is in the audit trail with the pod, container and image — and never its
          contents.
        </Callout>

        <p className="dw-p">
          The command is never taken from a message either: it is chosen from a fixed list of three
          shells. Namespace, pod and container are validated against RFC 1123 and passed as API
          parameters rather than assembled into a shell string, so there is no command to inject into.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="tm-keys" emoji="🎹">Keys and behaviour</SectionTitle>
        <WikiTable
          headers={['Key', 'Does']}
          rows={[
            [<Code>Esc</Code>, 'Ends the shell and stays on the pod. Pressing it again goes back to the pod list, the way Esc works everywhere else'],
            [<Code>Ctrl-[</Code>, <>Sends a real Escape <i>to the shell</i> — it is Escape on every terminal, so vi and <Code>less</Code> lose nothing</>],
            [<Code>Ctrl-C</Code>, 'Reaches the far end, because there is a real PTY'],
            ['resize', 'The window size is sent on channel 4, so full-screen tools draw at the right size and wrapped lines break in the right column'],
          ]}
        />
        <Callout type="info" title="Escape can be turned off">
          Settings → Dk8s → Terminal has a switch for it. Off, Escape goes back to the pod list and
          never touches the shell.
        </Callout>

        <SubTitle>Toning down <Code>ls</Code></SubTitle>
        <p className="dw-p">
          GNU coreutils paints world-writable and sticky directories black on green as a warning. In
          a container — where <Code>/tmp</Code>, <Code>/config</Code> and every mounted volume are
          routinely world-writable — that is most of a listing lit up like an alarm. dk8s sets three
          <Code>LS_COLORS</Code> keys when a shell opens, so those directories come back cyan and
          every other colour keeps its coreutils default.
        </p>
        <CodeBlock label="sent once, then cleared" lang="bash">{`export LS_COLORS='ow=01;36:tw=01;36:st=01;36'; clear`}</CodeBlock>
        <p className="dw-p">
          It is a switch rather than a decision, because it <i>is</i> a real warning and somebody
          auditing permissions may want it back.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="tm-themes" emoji="🎨">Themes</SectionTitle>
        <p className="dw-p">
          Six built-in palettes — Tokyo Night, Catppuccin, One Dark, Nord, Gruvbox and Solarized —
          each with a dark <i>and</i> a light variant, because the same sixteen colours do not work
          on both grounds. A palette owns the foreground and the sixteen ANSI slots and <b>not the
          background</b>: the terminal takes the panel&rsquo;s own ground, so it looks like part of
          the panel rather than a themed box dropped into it.
        </p>
        <p className="dw-p">
          The swatch strip in the terminal&rsquo;s toolbar holds six, each carrying its
          initial — colour alone is enough to choose by and not enough to name by, since two
          palettes can both be blue.
        </p>

        <SubTitle>Bringing your own</SubTitle>
        <WikiTable
          headers={['Action', 'What happens']}
          rows={[
            ['Import', 'Paste JSON, drop a file, or describe a theme and let AI fill in the template. All three land in the same box and go through the same parser'],
            ['Export all', 'Every stored theme as one JSON file, on the clipboard'],
            ['Generate with AI', 'A description — “warm low-contrast, amber accents” — becomes a filled-in palette you review before it applies'],
            ['Reorder', 'Drag. The order is the order on the strip'],
            ['Check', 'Up to six reach the strip. The rest stay stored'],
            ['Delete', 'A custom theme is gone; a built-in is hidden and comes back with Reset'],
          ]}
        />
        <Callout type="warn" title="Nothing is trusted, and nothing is repaired">
          Every colour in a theme ends up in CSS. A value like
          <Code>{'red; background-image: url(...)'}</Code> is perfectly ordinary JSON and a CSS
          injection, so every value is matched against a strict grammar — hex or
          <Code>rgb()</Code>/<Code>rgba()</Code>, no named colours, no <Code>var()</Code>, no
          functions — and a theme with one bad value is refused whole, with the field named. A file,
          a clipboard and a language model all get the same treatment.
        </Callout>
        <p className="dw-p">
          A theme that ships no light variant gets one derived — hue kept, saturation raised,
          lightness dropped, so a colour chosen to glow on near-black becomes ink on near-white —
          and is marked <Code>light auto</Code>, because a derived variant is legible rather than
          designed and you should know which you are looking at.
        </p>
        <Callout type="info" title="Themes are drawn here, not in the pod">
          The container emits ANSI codes; this side decides what colour each one is painted. Nothing
          about a theme is transmitted to the cluster. The only thing that reaches the container is
          the <Code>LS_COLORS</Code> line above, which is a shell variable in one session.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="tm-files" emoji="📁">The Explorer</SectionTitle>
        <p className="dw-p">
          A file browser over the same exec channel. Everything it does is one command the container
          may or may not have, and the Access view says which.
        </p>
        <WikiTable
          headers={['Doing', 'Runs', 'Note']}
          rows={[
            ['Listing', <Code>ls -lAn</Code>, 'Numeric owner, because “can this uid read this” cannot compare names'],
            ['Following links', <Code>ls -lLAn</Code>, 'A second pass, so a symlink shows what it actually is'],
            ['Reading', <Code>cat</Code>, 'No tar involved, so this works where a directory copy cannot'],
            ['Searching', <Code>find</Code>, 'Capped by depth and result count so a large volume cannot be walked forever'],
            ['Directory size', <Code>du -sk</Code>, 'On request only — see below'],
            ['Downloading', <Code>kubectl cp</Code>, 'tar over the exec channel; a directory needs tar in the image'],
          ]}
        />

        <SubTitle>Why a folder shows no size until you ask</SubTitle>
        <p className="dw-p">
          <Code>ls</Code> reports 4096 for a directory because that is the size of the directory
          <i>entry</i> — the block holding its list of names — not of anything inside it. The only
          thing that answers the question people are actually asking is <Code>du</Code>, and
          <Code>du -sk /</Code> in a container walks the whole filesystem. So it is a button in Get
          Info: one exec, on the directory you are looking at, when you want the number.
        </p>

        <SubTitle>Which container</SubTitle>
        <p className="dw-p">
          A pod with more than one container gets a picker at the right of the path. A sidecar&rsquo;s
          filesystem is a genuinely different place, and browsing one while believing you are in the
          other is the kind of wrong answer that looks right. Switching re-lists, because a listing
          from the previous container is confidently wrong.
        </p>

        <SubTitle>What you cannot read, and why</SubTitle>
        <p className="dw-p">
          The listing also runs <Code>id</Code>, so a row you can see and cannot open keeps its place
          with a reason instead of disappearing. The Access view names the identity —
          <Code>uid 1000, gid 1000, in groups …</Code> — because Unix picks the first permission
          class that matches and stops: a 0640 file owned by root is unreadable to uid 1000 no matter
          how permissive its group bits look.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="tm-here" emoji="📍">Open shell here</SectionTitle>
        <p className="dw-p">
          Right-click a folder, a file, or a Quick Search hit and open a shell already standing in
          that directory. For a folder that is the folder; for a file it is the folder holding it,
          because <Code>cd</Code> into a file is not a thing. From a search hit it opens that
          pod&rsquo;s terminal — doing it by hand was: note the pod, leave the search, open the pod,
          open Terminal, retype the path.
        </p>
        <Callout type="warn" title="The one field that becomes shell text">
          Namespace, pod and container go to the API as parameters, so there is nothing to inject
          into. A starting directory can only be applied by sending <Code>cd</Code> — and it does
          not come from you, it comes from a directory listing inside the container, so a hostile
          image could plant a filename. Inside single quotes a POSIX shell interprets nothing at all
          except the closing quote, so dk8s accepts an absolute path with no single quote and no
          control character and refuses the rest. A path it will not take is dropped rather than
          failing the open: landing in the container&rsquo;s default directory is a worse answer than
          the one asked for and a much better one than no terminal.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="tm-downloads" emoji="⬇️">Downloads</SectionTitle>
        <p className="dw-p">
          Every download is a row that says what happened and where it went, because a download
          nobody can find is a download done twice. A failure carries its reason in the row rather
          than in a toast that has already gone.
        </p>
        <WikiTable
          headers={['Action', 'What it does']}
          rows={[
            ['Stop', 'Kills the copy and removes the part-file — half a tarball under the name of a whole one is worse than no file, because nothing about it says so'],
            ['Try again', 'Replays the original request from what the row remembers, so a retry cannot drift from a first attempt'],
            ['Show in folder', 'Opens the containing folder'],
            ['Copy path / folder', 'For pasting into something else'],
          ]}
        />
      </div>

      <Divider />

      <div>
        <SectionTitle id="tm-settings" emoji="⚙️">Settings</SectionTitle>
        <p className="dw-p">
          <b>Settings → Dk8s → Terminal.</b> Themes at the top, then the handful of settings a
          terminal genuinely has.
        </p>
        <WikiTable
          headers={['Setting', 'Default', 'Why you might change it']}
          rows={[
            ['Font size, line height, font', '12px, 1.25, system mono', 'Looser is easier to scan; tighter fits more of a log on screen'],
            ['Cursor shape and blink', 'Block, blinking', '—'],
            ['Scrollback', '10,000 lines', 'A find across a container blows past a thousand instantly, and the top of the output is usually the part that said what went wrong'],
            ['Open the shell on arrival', 'On', 'Off puts a button in the tab, for a cluster where opening a shell should be deliberate'],
            ['Escape ends the shell', 'On', 'Off leaves Escape to go back'],
            ['Copy on select', 'Off', 'On behaves the way a terminal usually does; off matches the editor it lives in'],
            ['Tone down ls colours', 'On', 'Off restores coreutils’ green, which is what you want when auditing permissions'],
          ]}
        />
        <Callout type="info" title="Preferences live in this browser">
          Themes and terminal settings are stored in the panel&rsquo;s own storage — no file is
          written and nothing crosses to the extension. That also means an imported theme is the
          only copy unless you exported it, which is what the delete confirmation says.
        </Callout>
      </div>
    </WikiScrollPage>
  );
}
