"""
Build `dkgh.css` from the mock.

Three parts, in this order, and the order is the point:

1. The header — the root, the tokens, the resets.
2. The mock's own rules, scoped under `.dkgh`, values scaled.
3. The overrides.

The overrides go LAST. They were above the mock's rules once, and a rule with
the same specificity that comes first loses — so `.compose .right { width:
auto }` was silently beaten by the mock's `width: 238px` and the metadata column
would not stretch with its split. Anything meant to win has to be able to.

On the scale: the mock is drawn at a fixed figure width where 12px reads fine;
the real tab is a full panel and the same numbers read small. Every px length is
multiplied by one factor, so every proportion the mock chose is kept exactly and
the whole thing is simply bigger. Hairlines stay hairlines — a 1px border scaled
to 1.2px is a blurry 1px border.
"""
import io
import re
import sys

SRC, HEADER, ADDITIONS, OUT = sys.argv[1:5]

SCALE = 1.2

# Rules the host app already supplies. The mock draws them to show context.
DROP_PREFIXES = ('.app', '.rail', '.tabbar')

BLOCK = re.compile(r'([^{}]+)\{([^{}]*)\}', re.S)
COMMENT = re.compile(r'/\*.*?\*/', re.S)
PX = re.compile(r'(?<![\w.-])(\d+(?:\.\d+)?)px')


def scale(text: str) -> str:
    """Every px length, times the factor. Hairlines left alone."""
    def one(m: re.Match) -> str:
        value = float(m.group(1))
        # A hairline scaled is a blurry hairline; `999px` is not a length at all,
        # it is the way CSS spells "a pill", and 1198px spells the same thing worse.
        if value <= 1 or value >= 999:
            return m.group(0)
        out = round(value * SCALE, 1)
        return f'{int(out) if out == int(out) else out}px'
    return PX.sub(one, text)


def scope_one(selector: str) -> str | None:
    sel = selector.strip()
    if not sel:
        return None
    parts = []
    for one in sel.split(','):
        one = one.strip()
        if not one:
            continue
        # `.body` IS the dkgh root.
        if one == '.body':
            parts.append('.dkgh')
            continue
        if one.startswith('.body '):
            parts.append('.dkgh ' + one[len('.body '):])
            continue
        if any(one == p or one.startswith(p + ' ') or one.startswith(p + '.')
               or one.startswith(p + ':') for p in DROP_PREFIXES):
            continue
        parts.append('.dkgh ' + one)
    return ', '.join(parts) if parts else None


css = io.open(SRC, encoding='utf-8').read()
css = css[css.index('/* The app frame */'):]

# The one at-rule in this region wraps `.two`, the documentation page's own
# side-by-side figure layout rather than anything the product draws.
css = re.sub(r'@media[^{]*\{[^{}]*\{[^{}]*\}[^{}]*\}', '', css, flags=re.S)

out = []
pos = 0
for m in BLOCK.finditer(css):
    for c in COMMENT.findall(css[pos:m.start()]):
        out.append(c)
    pos = m.end()
    # A comment glued to the front of a selector is a comment, not a selector.
    for c in COMMENT.findall(m.group(1)):
        out.append(c)
    scoped = scope_one(COMMENT.sub('', m.group(1)))
    if scoped:
        out.append(f'{scoped} {{{scale(m.group(2))}}}')

header = io.open(HEADER, encoding='utf-8').read()
additions = io.open(ADDITIONS, encoding='utf-8').read()

io.open(OUT, 'w', encoding='utf-8').write(
    scale(header)
    + "\n/* ── The mock's rules, scoped and scaled, otherwise untouched ── */\n\n"
    + '\n'.join(out)
    + '\n\n\n'
    + scale(additions)
)
print('rules:', sum(1 for line in out if line.rstrip().endswith('}')), 'scale:', SCALE)
