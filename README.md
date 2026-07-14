# Simple Author

A distraction-free desktop app for writing books — from first draft to a
Kindle-ready EPUB. Everything works offline: spellcheck, thesaurus, fonts,
and your manuscript never leave your machine.

**[Try it in your browser](https://crc64error.github.io/simple-author/)** ·
**[Download for Mac, Windows, or Linux](https://github.com/crc64error/simple-author/releases/latest)**

## Features

- **Plain-markdown manuscripts** — sections (`#`) and chapters (`##`) build a
  live outline; your book is a portable `.md` file, never a proprietary format
- **Tabs** — several documents open at once, each with its own undo history,
  cursor position, and writing mode; open tabs are restored on relaunch
- **Writing modes** — Book, Lyrics, Poetry, and Sermon: the structure buttons,
  counts (words, lines, stanzas, estimated speaking time), and templates adapt
  to what you're writing; sermon mode highlights scripture references
- **Two views** — raw markdown, or a rendered mode that hides the markup
  except on the line you're editing
- **Author notes** — `[Notes]…[/Notes]` blocks stay visible while you write
  and are stripped from every export
- **Live word counts** — book, section, and chapter counts that follow your
  cursor
- **Bilingual spellcheck** — English + Portuguese, fully offline, with a
  personal dictionary (right-click a flagged word to fix it or add it)
- **Built-in thesaurus** — right-click any word for synonyms grouped by sense
  (WordNet-derived, 145k entries, offline)
- **Kindle / KDP ready** — one-click EPUB export, KDP front/back-matter
  templates, and a step-by-step publishing guide
- **Writing reminders** — a small pinned panel for the notes you want in view
  while drafting
- **Four themes**, paragraph/line-break marks, and a focused, chrome-free
  layout

## Install

> [!WARNING]
> Only the **macOS** build has been tested so far. The **Windows and Linux**
> builds are produced by the same CI pipeline but are **untested** — reports
> (good or bad) are very welcome in the
> [issues](https://github.com/crc64error/simple-author/issues).

Grab the installer for your platform from the
[latest release](https://github.com/crc64error/simple-author/releases/latest):

- **macOS** — `.dmg` (universal). The app is not notarized; the first time,
  right-click the app and choose *Open*.
- **Windows** — `.msi` or `-setup.exe`. SmartScreen may warn about an unknown
  publisher; choose *More info → Run anyway*.
- **Linux** — `.AppImage` (portable), `.deb`, or `.rpm`.

Or use the [web version](https://crc64error.github.io/simple-author/) — same
editor, running entirely in your browser (files open/save through the
browser's download mechanism instead of native dialogs).

## Roadmap

Goals get checked off as they ship. Ideas and votes welcome in the
[issues](https://github.com/crc64error/simple-author/issues).

### Artwork & covers (Book mode)

- [ ] Attach cover art to a manuscript (kept with the book, shown in-app)
- [ ] Embed the cover in EPUB export so Kindle and e-readers display it
- [ ] Cover preview with KDP dimension checks (≥ 1600 × 2560 px, 1.6:1 ratio)
- [ ] Back-cover art and blurb layout for print editions
- [ ] Full-wrap cover template (front + spine + back) sized from page count

### Interface translations

- [ ] Extract all interface strings into locale files
- [ ] Portuguese interface translation
- [ ] Language picker with system-language detection
- [ ] Translation guide so others can contribute languages

### Dictionaries & reference tools

- [ ] Dictionary manager: download and enable spelling dictionaries for more
      languages (Hunspell format)
- [ ] Downloadable thesauri for languages beyond English
- [ ] Import / export the personal dictionary
- [ ] Per-book word lists (character names, places, invented terms)

### Print

- [ ] Print / PDF export with page setup: trim size, margins, fonts
- [ ] Headers, footers, page numbers, and chapter page breaks
- [ ] KDP paperback-ready PDF (6×9 in and other trim sizes)
- [ ] Print directly from the app

### Secure storage

- [ ] Password-protected manuscripts, encrypted at rest (AES-256)
- [ ] Lock / unlock flow with automatic locking when idle
- [ ] Encrypted rotating backups so a bad save never loses a book
- [ ] Clear passphrase-loss warning (no recovery without it — by design)

### Poetry & lyric tools

- [x] Per-line syllable counts in Poetry mode (CMU Pronouncing Dictionary,
      with a heuristic fallback for names and invented words) *(v1.0.2)*
- [x] Rhyme finder in the right-click menu — perfect and near rhymes, offline
      *(v1.0.2)*
- [x] Suno integration in Lyrics mode: `[Style]` prompt block with a live
      1000-character budget, `[performance tag]` styling, and one-click
      copy of the style prompt or tagged lyrics ready to paste into Suno
      *(v1.0.2)*
- [ ] Rhyme scheme coloring: line endings that rhyme get matching tags
- [ ] Meter and stress-pattern display
- [ ] Chord notation in Lyrics mode (ChordPro-style `[G]` markers) with
      show/hide and transpose
- [ ] Portuguese syllable counting and rhymes

### Small improvements

- [ ] Keyboard shortcuts for switching and reordering tabs
- [ ] Drag to reorder tabs

### Shipped

- [x] **v1.0.0** — Mac / Windows / Linux builds, browser version, offline
      spellcheck (English + Portuguese), offline thesaurus, right-click
      suggestions, personal dictionary, EPUB export, KDP templates
- [x] **v1.0.1** — Writing modes: Book, Lyrics, Poetry, and Sermon (speaking
      time estimate, scripture highlighting)
- [x] **v1.0.2 (beta)** — Tabs (multiple documents open at once), per-line
      syllable counts and rhyme finder for poetry, Suno integration for
      lyrics (style prompt with character budget, performance tags,
      copy-for-Suno export)

## Building from source

Prerequisites: [Node.js](https://nodejs.org) 20+, [Rust](https://rustup.rs),
and the [Tauri platform dependencies](https://tauri.app/start/prerequisites/)
(on Linux: `libwebkit2gtk-4.1-dev` and friends).

```sh
npm install
npm run tauri:dev     # run the desktop app in development
npm run tauri:build   # build the installer for your platform
npm run dev           # or: just the web version on localhost:5173
```

## Tech

TypeScript + [CodeMirror 6](https://codemirror.net) editor in a
[Tauri 2](https://tauri.app) shell. Spellcheck via
[nspell](https://github.com/wooorm/nspell) with Hunspell dictionaries,
thesaurus from MyThes/WordNet data, EPUB assembly with
[JSZip](https://stuk.github.io/jszip/). No telemetry, no network calls.

## License

[GPL-3.0](LICENSE). Bundled fonts, dictionaries, and thesaurus data are under
their own licenses — see [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md).
