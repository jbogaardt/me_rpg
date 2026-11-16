"""Source registry: resolves 'c:<pack>/<file>' (CC0 collection), 'w:<path under sounds/>' (Wyrmsun sounds) and 'm:<file>'
(Wyrmsun music) to audio, with the licence read from the source's own files. GPL-only and unknown entries are refused."""
import os, re
from alib import load, SR
A = '/tmp/claude-0/-home-user-me-rpg/cc2cf524-b3ce-5c45-8929-e0397ffa0fcf/scratchpad/assets'
CC0 = A + '/cc0-sounds'
WYR = A + '/wyrmsun'
CRED = {}
for line in open(WYR + '/sounds/credits.txt'):
    m = re.match(r'^/sounds/(\S+) \((.*)$', line.strip())
    if m: CRED[m.group(1)] = m.group(2)
MCRED = {}
for line in open(WYR + '/music/credits.txt'):
    m = re.match(r'^/music/oaml/(\S+) \((.*)\)$', line.strip())
    if m: MCRED[m.group(1)] = m.group(2)

PACK_AUTHOR = {
    # (author, licence note) per CC0 pack, from the pack's own readme/licence file where there is one
    'kenney': ('Kenney (kenney.nl)', 'CC0 1.0, per the pack License.txt'),
    'bb': ('Benjamin Burnes (Abstraction)', 'CC0 1.0, per the pack _README.txt'),
    'micro': ('Benjamin Burnes (Abstraction) and guest artists', 'CC0 1.0, per the pack _README.txt'),
    'warfork': ('Team Forbidden (Warfork)', 'CC0 1.0, per warfork_assets_cc0.txt'),
    'rubber': ('rubberduck (attribution to confirm)', 'CC0 1.0 (collection LICENSE; author not named in the collection)'),
    'maxi': ('Maximiliano Stradex (attribution to confirm)', 'CC0 1.0 (collection LICENSE; author not named in the collection)'),
}
def pack_kind(pack):
    if pack.startswith('kenney'): return 'kenney'
    if pack.startswith('bb') or pack.startswith('BB'): return 'bb'
    if pack.startswith('Micro'): return 'micro'
    if pack.startswith('warfork'): return 'warfork'
    if pack.startswith('Maximiliano'): return 'maxi'
    return 'rubber'

def licence_of(spec):
    kind, path = spec.split(':', 1)
    if kind == 'c':
        pack = path.split('/')[0]
        a, l = PACK_AUTHOR[pack_kind(pack)]
        return {'author': a, 'licence': 'CC0-1.0', 'note': l, 'share_alike': False}
    if kind == 'w':
        c = CRED.get(path)
        if c is None: raise ValueError('no credit line for ' + path)
        if 'GPL 2.0 and CC-BY-SA' in c:
            return {'author': 'Wyrmsun contributors (Johnvarker)', 'licence': 'CC-BY-SA-3.0', 'note': c, 'share_alike': True}
        if 'GPL' in c: raise ValueError('GPL-only source refused: ' + path)
        if 'Wildfire' in c: return {'author': 'Wildfire Games (0 A.D.)', 'licence': 'CC-BY-SA-3.0', 'note': 'http://www.wildfiregames.com/', 'share_alike': True}
        if 'CC0' in c: return {'author': c.split(')')[0].lstrip('by '), 'licence': 'CC0-1.0', 'note': c, 'share_alike': False}
        if 'public domain' in c: return {'author': 'US Fish and Wildlife Service / public domain', 'licence': 'PD', 'note': c, 'share_alike': False}
        raise ValueError('unknown licence: ' + path)
    if kind == 'm':
        c = MCRED[path]
        if 'Attribution 4.0' not in c: raise ValueError('refused music ' + path)
        return {'author': 'Marcelo Fernandez (marcelofernandezmusic.com)', 'licence': 'CC-BY-4.0', 'note': c, 'share_alike': False}
    raise ValueError(spec)

def fs_path(spec):
    kind, path = spec.split(':', 1)
    return {'c': CC0, 'w': WYR + '/sounds', 'm': WYR + '/music/oaml'}[kind] + '/' + path

class Used:
    """Collects the sources a recipe touched."""
    def __init__(self): self.items = []
    def get(self, spec, mono=True):
        licence_of(spec)  # raises on refused sources
        self.items.append(spec)
        return load(fs_path(spec), mono=mono)
