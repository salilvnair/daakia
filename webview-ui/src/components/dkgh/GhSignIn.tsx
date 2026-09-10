import { openExternal } from './open-external';
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
import {
  GhEmpty, GhLede, GhNote, GhActions, GhPrimary, GhButton, GhCommand,
} from './GhShell';
import type { GhEnv } from './types';

const LOGIN = 'gh auth login --hostname github.com --git-protocol ssh --scopes read:project --web';
const REFRESH = 'gh auth refresh --scopes read:project';
const ENTERPRISE = 'gh auth login --hostname git.acme.internal --scopes read:project --web';

export function GhSignIn({ env, checking, onRecheck, onLocate, onDiagnose }: {
  env: GhEnv;
  checking: boolean;
  onRecheck: () => void;
  onLocate: () => void;
  /** Screen 01D — for when gh is here and signed in but nothing answers. */
  onDiagnose: () => void;
}) {
  const version = env.version?.version ?? env.version?.raw;

  return (
    <GhEmpty icon="lock" title="Sign in to GitHub">
      <GhLede>
        <span style={{ color: 'var(--dk-green)' }}>gh {version} found.</span>{' '}
        Run the login once in any terminal — it opens your browser, handles SSO and
        hardware keys, and hands the credential to the OS keychain.
      </GhLede>

      {/* One column, not two: these are three things to read in order, not
          three alternatives to choose between. */}
      <div className="opts" style={{ gridTemplateColumns: '1fr' }}>
        <div className="opt pick">
          <div className="oh">Sign in<span className="tag">one time</span><span className="sp" /></div>
          <GhCommand text={LOGIN} prompt="$" />
          <div className="sub">
            Every prompt answered but the browser step. Drop <code>--git-protocol ssh</code> for
            HTTPS, and add <code>--skip-ssh-key</code> if you have already uploaded a key.
          </div>
        </div>
        <div className="opt">
          <div className="oh">Already signed in elsewhere?<span className="sp" /></div>
          <GhCommand text={REFRESH} prompt="$" />
          <div className="sub">
            Adds the scope to an existing credential without signing you out of anything.
          </div>
        </div>
        <div className="opt">
          <div className="oh">GitHub Enterprise Server<span className="sp" /></div>
          <GhCommand text={ENTERPRISE} prompt="$" />
          <div className="sub">
            dkgh reads the host back from <code>gh auth status</code>; you never type a URL into
            Daakia, and Daakia never stores one.
          </div>
        </div>
      </div>

      <>
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
      </>

      <GhActions>
        <GhPrimary icon="refresh" onClick={onRecheck}>
          {checking ? 'Checking…' : 'I have signed in'}
        </GhPrimary>
        <GhButton
          onClick={() => openExternal('https://cli.github.com/manual/gh_auth_login')}
        >
          gh auth login docs
        </GhButton>
        {/*
          Two ways this screen can be a lie. Either gh is not the gh you meant,
          or it is and the network is eating the answer — both look exactly like
          "not signed in" from here, and neither is fixed by signing in again.
        */}
        <GhButton onClick={onDiagnose}>Signed in already? Check the network</GhButton>
        <GhButton onClick={onLocate}>Wrong gh? Locate another</GhButton>
      </GhActions>

      <div style={{ textAlign: 'center', marginTop: 14, fontSize: 11, color: 'var(--dk-faint)' }}>
        Checking every few seconds while this screen is open.
      </div>
    </GhEmpty>
  );
}
