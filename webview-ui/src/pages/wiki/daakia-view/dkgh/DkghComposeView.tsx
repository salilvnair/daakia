/**
 * Filing an issue from dkgh.
 *
 * The composer is the half of dkgh that writes, so this page is about what
 * ends up on GitHub: which template is in force, which box becomes which
 * heading, what the AI step is allowed to fill in, and where a screenshot
 * lands. Everything a reader would otherwise find out by filing something
 * wrong.
 */
import { WikiScrollPage } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, WikiTable, Callout, Divider, Code, CodeBlock,
  Steps, chips, TocBar, WikiCard, type TocItem,
} from '../shared/WikiShared';

const TOC_ITEMS: TocItem[] = [
  { id: 'gc-box', icon: 'pencil', label: 'One box' },
  { id: 'gc-template', icon: 'document', label: 'The template' },
  { id: 'gc-body', icon: 'code', label: 'What gets written' },
  { id: 'gc-ai', icon: 'ai', label: 'Generate with AI' },
  { id: 'gc-review', icon: 'check', label: 'The review' },
  { id: 'gc-shots', icon: 'attachment', label: 'Screenshots' },
  { id: 'gc-file', icon: 'send', label: 'Filing it' },
];

export function DkghComposeView() {
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          icon="pencil"
          title="dkgh — filing an issue"
          subtitle="One box to start, the repository's own form behind it, and an AI step that proposes rather than decides."
          chips={chips(['issue forms', 'generate with AI', 'field review', 'screenshots', 'gh issue create'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <SectionTitle id="gc-box" icon="pencil">It opens with one box</SectionTitle>
        <p className="dw-p">
          Not eleven fields with one of them focused — one box, because that is
          the shape of what you have in your head when you arrive. A title, a
          description, and everything else beside it rather than in front of it.
        </p>
        <Callout type="tip" title="A draft survives">
          What you write is kept against this repository, in this browser.
          Nothing is sent to GitHub until you press Create, so closing the tab
          mid-sentence loses nothing and leaves nothing behind on GitHub either.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="gc-template" icon="document">Which template applies</SectionTitle>
        <p className="dw-p">
          A repository's <Code>.github/ISSUE_TEMPLATE/*.yml</Code> forms are read
          and ranked against what you have written — by words, deliberately, not
          by a model: this is a proposal you confirm, and something that comes
          out differently on a reload is not something to build a default on.
        </p>
        <p className="dw-p">
          The one in force is the one you picked, or the one being proposed. Its
          fields are what the sidebar shows, what "required" means, and what the
          AI step is asked about — and, since 3.0.3, what the body is actually
          built from.
        </p>
        <Callout type="warn" title="Fixed in 3.0.3">
          The composer used to run its whole screen on the proposed template
          while the body was assembled from a template nothing ever set. Every
          answer you typed into a template field was shown on screen, counted as
          required, filled in by the AI step — and then dropped. The issue went
          to GitHub as the description and nothing else.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="gc-body" icon="code">What gets written</SectionTitle>
        <p className="dw-p">
          The body is assembled the way GitHub's own form renderer would:
          <Code>### Label</Code>, the answer underneath, in the order the form
          declared them. A field nobody filled is written as
          <Code>_No response_</Code>, which is what GitHub writes.
        </p>
        <CodeBlock label="The body dkgh posts" lang="markdown">{`### Summary

Checkout hangs after clicking Pay.

### Issue Type

_No response_

### Steps to Reproduce

1. Add anything to the basket
2. Press Pay

![screenshot](https://…/evidence/spinner.png)`}</CodeBlock>
        <p className="dw-p">
          That matters beyond tidiness: the board can group by Module tomorrow
          only because the composer wrote <Code>### Module</Code> today. An issue
          filed from dkgh and one filed from the browser parse identically.
        </p>
        <p className="dw-p">
          With no template at all — which is most repositories — the description
          is the body, unchanged. That is not a degraded case.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="gc-ai" icon="ai">Generate with AI</SectionTitle>
        <p className="dw-p">
          One button. It reads the repository's own fields, works out which of
          them your description already answers, and asks about the rest.
          Nothing about a Module is known to dkgh — the fields are passed in, so
          a repository that adds one gets asked about it without dkgh changing.
        </p>

        <WikiCard title="What it will not do" icon="shield">
          <Steps steps={[
            <><strong>Invent a value.</strong> A field your description does not answer comes back unanswered with a sentence about what is missing, and that becomes a question with the template's own options as buttons. A confident wrong Module costs somebody a mis-filed issue and costs the next reader their trust in every other value on the board.</>,
            <><strong>Hide what it was told.</strong> "What the model was actually told" is on the screen, behind a disclosure — the prompt itself, not a paraphrase. Both blocks are editable in Settings → Prompt Library.</>,
            <><strong>Run without a provider.</strong> No model configured is a first-class state that names the screen which fixes it, not an error toast.</>,
          ]} />
        </WikiCard>

        <Callout type="info" title="It stops offering what it has just done">
          After a proposal the button goes quiet until the title or the
          description changes — there is nothing new to read, and a button that
          re-offers the same work is a button people press twice by accident.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="gc-review" icon="check">The review — every field, and whose value it is</SectionTitle>
        <p className="dw-p">
          What comes back is reviewed over the <strong>template's</strong> fields,
          not over the model's answer: every field the form declares gets a row,
          in the order it declared them, whatever the model did or did not do
          with it.
        </p>
        <WikiTable
          headers={['The row says', 'Meaning']}
          rows={[
            ['from AI', 'The model proposed it and you took it, unchanged'],
            ['edited', 'You changed it — the original is kept, and "Put its answer back" is one press'],
            ['yours', 'You wrote it; the model never proposed it'],
            ['proposed', 'Waiting. One tick takes it'],
            ['not answered', 'It refused to guess, and the row carries its reason'],
          ]}
        />
        <p className="dw-p">
          The pencil on any row opens the value in place — the template's own
          options as buttons for a dropdown, a box for free text — because the
          value you want is usually the model's with one word changed, and
          finding that field again in the sidebar is a different screen with a
          different layout. <strong>Take all</strong> takes every proposal still
          going spare and never overwrites something you wrote.
        </p>
      </div>

      <Divider />

      <div>
        <SectionTitle id="gc-shots" icon="attachment">A screenshot goes in the field you paste it into</SectionTitle>
        <p className="dw-p">
          <Code>Ctrl+V</Code> straight from the Snipping Tool into Evidence, Steps
          to Reproduce, or any other written field — drop and click work too. The
          image is written under <em>that</em> heading, below what you typed,
          rather than in a pile at the bottom of the issue. Images pasted into
          the description still go in a trailing <Code>### Evidence</Code> block,
          which is now for those alone.
        </p>

        <SubTitle>Nothing is uploaded until you say so</SubTitle>
        <p className="dw-p">
          A pasted screenshot is a data URL in the draft, and every thumbnail
          says <Code>local</Code> until it is not. That is the right default: a
          screenshot of somebody's production console is exactly the thing not
          to upload by reflex.
        </p>
        <Steps steps={[
          <>Uploading commits the images to <Code>.dkgh/evidence/</Code> on a <Code>dkgh-evidence</Code> branch — never the default one — and puts the blob URL in the body.</>,
          <>GitHub's own paste-to-upload is a private endpoint its web UI calls with a session cookie: not in the REST API, not in <Code>gh</Code>, not ours to call. This is the route that is actually ours to take.</>,
          <>Anything past a few megabytes makes an issue slow for everyone who opens it, so recompressing is offered as one button that says what it did — never applied quietly.</>,
          <>A refusal — a protected branch, no write access — is named, and the image stays in the draft rather than vanishing.</>,
        ]} />
      </div>

      <Divider />

      <div>
        <SectionTitle id="gc-file" icon="send">Filing it</SectionTitle>
        <p className="dw-p">
          The review screen before Create shows the exact Markdown that will be
          posted — editable, and editing it re-runs nothing — beside the fields
          that will be set and the commands that will run.
        </p>
        <Steps steps={[
          <>Step one files the issue with its title and body. It goes first on purpose: if a later step fails the issue still exists, and the result says which fields did not land, with a button to retry just those.</>,
          <>Duplicate detection runs over the issues already loaded before anything is sent.</>,
          <>Labels the template declares are added to the ones you picked, not instead of them.</>,
        ]} />
        <Callout type="ok" title="Filing four related bugs">
          "File another" keeps the classification and clears the words —
          re-answering the same dropdowns after every test run is why people
          batch bugs up and then never write them.
        </Callout>
      </div>
    </WikiScrollPage>
  );
}
