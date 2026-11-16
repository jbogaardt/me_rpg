# How Towercraft's sounds were built

The scripts that made `towercraft/public/audio/` from freely licensed recordings, kept so the choices can be re-run
and changed. They are not part of the build or the tests.

- Sources: a clone of Wyrmsun (https://github.com/Andrettin/Wyrmsun) and of the CC0 collection
  (https://github.com/lavenderdotpet/CC0-Public-Domain-Sounds). The paths to both clones are set at the top of
  `srcs.py` and `make_credits.py`: change them to where you cloned them. `srcs.py` refuses GPL-only entries.
- `build_sfx.py`, `build_music.py`, `build_amb.py`, `build_voice.py`: source file to trims, layers, pitch, EQ,
  loudness target and Ogg (needs `ffmpeg`, Python 3 with `numpy` and `soundfile`).
- `manifest_*.json`: what each shipped file was made from; `make_credits.py` turns them into
  `towercraft/public/audio/CREDITS.md`.
