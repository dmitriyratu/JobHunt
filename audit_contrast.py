"""Reads the real tokens out of globals.css and checks both themes."""
import re, sys

def lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def L(h):
    h = h.lstrip('#')
    r, g, b = (int(h[i:i+2], 16) for i in (0, 2, 4))
    return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b)
def cr(a, b):
    la, lb = L(a), L(b); hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

css = open('src/app/globals.css', encoding='utf-8').read()
def block(sel):
    i = css.index(sel); j = css.index('}', i)
    return dict(re.findall(r'--([\w-]+):\s*(#[0-9a-fA-F]{6})\b', css[i:j]))

themes = {'LIGHT': block(':root {'), 'DARK': block(':root[data-theme="dark"]')}
fails = 0
for name, t in themes.items():
    print(f"\n########## {name} ##########")
    grounds = {'page': t['color-surface'], 'card': t['color-surface-raised'],
               'overlay': t['color-surface-overlay']}
    grounds |= {f'{k} fill': t[f'color-{k}-surface'] for k in
                ('danger', 'warning', 'success', 'accent')}
    print("-- text on its worst ground --")
    for step, bar in (('primary', 4.5), ('secondary', 4.5), ('tertiary', 7.0), ('muted', 4.5)):
        where, g = min(grounds.items(), key=lambda kv: cr(t[f'color-text-{step}'], kv[1]))
        v = cr(t[f'color-text-{step}'], g)
        ok = v >= bar; fails += not ok
        print(f"   {'ok ' if ok else 'FAIL'} {step:10}{v:6.2f}  (bar {bar}, worst on {where})")
    print("-- control boundary (WCAG 1.4.11, 3:1) --")
    for g in ('card', 'page', 'overlay'):
        v = cr(t['color-border'], grounds[g]); ok = v >= 3; fails += not ok
        print(f"   {'ok ' if ok else 'FAIL'} border on {g:8}{v:6.2f}")
    print("-- ink on solid verdict pills (4.5:1) --")
    for h in ('accent', 'success', 'warning', 'danger'):
        v = cr(t[f'color-on-{h}'], t[f'color-{h}']); ok = v >= 4.5; fails += not ok
        print(f"   {'ok ' if ok else 'FAIL'} {h:10}{v:6.2f}")
    print("-- accent as text (4.5:1) --")
    for g in ('page', 'card'):
        v = cr(t['color-accent'], grounds[g]); ok = v >= 4.5; fails += not ok
        print(f"   {'ok ' if ok else 'FAIL'} on {g:13}{v:6.2f}")
    print("-- verdict fill lift off the card (tint must register) --")
    for k in ('danger', 'warning', 'success', 'accent'):
        print(f"       {k:10}{cr(t[f'color-{k}-surface'], grounds['card']):6.3f}")

print(f"\n{'ALL CHECKS PASS' if not fails else str(fails) + ' FAILURES'}")
sys.exit(1 if fails else 0)
