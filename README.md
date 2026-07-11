# Simple Author

A distraction-free desktop app for writing books — from first draft to a
Kindle-ready EPUB. Everything works offline: spellcheck, thesaurus, fonts,
and your manuscript never leave your machine.

**[Try it in your browser](https://crc64error.github.io/simple-author/)** ·
**[Download for Mac, Windows, or Linux](https://github.com/crc64error/simple-author/releases/latest)**

## Features

- **Plain-markdown manuscripts** — sections (`#`) and chapters (`##`) build a
  live outline; your book is a portable `.md` file, never a proprietary format
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
