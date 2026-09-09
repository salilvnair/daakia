/**
 * Screen 02 — gh is here, nobody is signed in.
 *
 * A different problem with a different fix, so it gets its own screen rather
 * than a second paragraph on the install one. It opens by stating the version
 * it found: that is the proof step one worked, and it is worth showing before
 * asking for step two.
 *
 * The scope is asked for HERE, up front, rather than discovered as an absence
 * three screens later. One extra word on a command somebody is running anyway
 * costs nothing; a roadmap that is silently empty because of a permission
 * nobody mentioned costs an afternoon.
 */
import { ButtonView, SetupOptionView } from '@salilvnair/dui';
import { KeyIcon, RefreshIcon } from '../../icons';
import { GhEmpty, GhLede, GhNote, GhActions, GhPrimary } from './GhShell';
import { ACCENT, type GhEnv } from './types';

const LOGIN = 'gh auth login --hostname github.com --git-protocol ssh --scopes read:project --web';
const REFRESH = 'gh auth refresh --scopes read:project';
const ENTERPRISE = 'gh auth login --hostname git.acme.internal --scopes read:project --web';

export function GhSignIn({ env, checking, onRecheck }: {
  env: GhEnv;
  checking: boolean;
  onRecheck: () => void;
}) {
  const version = env.version?.version ?? env.version?.raw;

  return (
    <GhEmpty icon={<KeyIcon size={38} />} title="Sign in to GitHub">
      <GhLede>
        <span style={{ color: 'var(--color-success)' }}>gh {version} found.</span>{' '}
        Run the login once in any terminal — it opens your browser, handles SSO and
        hardware keys, and hands the credential to the OS keychain.
      </GhLede>

      <div className="flex flex-col gap-2 w-full" style={{ maxWidth: 520 }}>
        <SetupOptionView
          accentColor={ACCENT}
          title="Sign in"
          tag="one time"
          recommended
          command={LOGIN}
          note={<>Every prompt answered but the browser step. Drop <code>--git-protocol ssh</code> for
            HTTPS, and add <code>--skip-ssh-key</code> if you have already uploaded a key.</>}
        />
        <SetupOptionView
          accentColor={ACCENT}
          title="Already signed in elsewhere?"
          command={REFRESH}
          note="Adds the scope to an existing credential without signing you out of anything."
        />
        <SetupOptionView
          accentColor={ACCENT}
          title="GitHub Enterprise Server"
          command={ENTERPRISE}
          note={<>dkgh reads the host back from <code>gh auth status</code>; you never type a
            URL into Daakia, and Daakia never stores one.</>}
        />
      </div>

      <div className="w-full mt-3 flex flex-col gap-2" style={{ maxWidth: 520 }}>
        <GhNote title="What read:project is for">
          Start date, ETA and Status live on GitHub Projects, not on the issue, and the default
          login cannot see them. It is <b>read-only</b> — dkgh asks for write access separately,
          the first time you drag a card between columns. Skip it and everything still works;
          the roadmap and the date columns say what is missing instead of showing blanks.
        </GhNote>
        <GhNote title="Why a terminal and not a box in this window">
          A login form inside Daakia would mean Daakia handling your password or a
          token. Handing the whole flow to <code>gh</code> means the only thing we ever learn is
          the answer to &ldquo;are you logged in?&rdquo;
        </GhNote>
      </div>

      <GhActions>
        <GhPrimary iconLeft={<RefreshIcon size={12} />} onClick={onRecheck}>
          {checking ? 'Checking…' : 'I have signed in'}
        </GhPrimary>
        <ButtonView size="md" accentColor="var(--color-text-muted)"
                    onClick={() => window.open('https://cli.github.com/manual/gh_auth_login', '_blank')}>
          gh auth login docs
        </ButtonView>
      </GhActions>

      <p className="text-[10px] mt-3" style={{ color: 'var(--color-text-muted)' }}>
        Checking every few seconds while this screen is open.
      </p>
    </GhEmpty>
  );
}
