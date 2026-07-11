# Publishing Your Book — Kindle / KDP Guide

A reference for when you're ready to self-publish through Amazon Kindle Direct Publishing (KDP).

---

## Your workflow in Simple Author

1. **Write** with sections (`#`), chapters (`##`), italics (`*italic*`), and private `[Notes]…[/Notes]` blocks.
2. **Save** — keeps everything, including notes. Your working manuscript.
3. **Export** (dropdown, no notes) — choose one of:
   - **Markdown** — clean `.md` for backup or further editing
   - **Plain text** — stripped prose only
   - **EPUB for Kindle** — upload-ready ebook (notes removed)

Word counts in the status bar already exclude notes.

---

## What KDP accepts today

Amazon KDP converts your file to Kindle format automatically. You do **not** need to create MOBI or AZW3 files yourself.

| Format | Good for |
|--------|----------|
| **EPUB** | Recommended for ebooks — use Simple Author's export |
| **DOCX** | Also accepted; useful if you edit further in Word |
| **PDF** | Print editions, not ideal for reflowable ebooks |

---

## Step-by-step: first Kindle upload

### 1. Finish and export

- Use **Export → EPUB for Kindle (no notes)**
- Save the `.epub` somewhere easy to find

### 2. Preview before uploading

Download **Kindle Previewer** (free from Amazon):
https://www.amazon.com/Kindle-Previewer/b?node=21381691011

Open your EPUB and check:

- Chapter breaks look right
- Section / part titles appear where you expect
- *Italics* survived the export
- No `[Notes]` blocks or stray markup
- Table of contents matches your outline

Fix issues in Simple Author, re-export, preview again.

### 3. Create your KDP account and title

- Go to https://kdp.amazon.com
- Sign in with your Amazon account
- **Create** → **Kindle eBook**

You'll need:

- **Book title** and **subtitle** (if any)
- **Author** name (and contributors)
- **Description** — back-cover blurb; write this separately
- **Keywords** (up to 7) — how readers will find you
- **Categories** (BISAC) — Science Fiction, Literary Fiction, etc.
- **Cover image** — JPG or TIFF, at least 1600 × 2560 px recommended

Use **Insert → KDP book details worksheet** to keep all of these drafted alongside your manuscript. It lives in a `[Notes]` block, so it is never included in exports.

### 4. Upload manuscript and cover

- **Manuscript**: upload your `.epub`
- **Cover**: upload your cover art (or use KDP's cover creator — limited)
- KDP runs conversion; wait for the previewer inside KDP to finish

### 5. Review KDP's online previewer

Click through on phone, tablet, and Kindle views. Watch for:

- Orphaned lines at page breaks
- Odd spacing after section titles
- Missing or duplicate chapters in the TOC

### 6. Pricing and territories

- Choose **KDP Select** (exclusive to Amazon, Kindle Unlimited) or wide distribution
- Set price; KDP shows your royalty per sale
- Select countries / territories

### 7. Publish

- Hit **Publish**. Review can take up to 72 hours (often faster)
- Once live, order a proof copy on your own Kindle to read the whole book fresh

---

## Optional polish tools

| Tool | When to use it |
|------|----------------|
| **Kindle Previewer** | Always — before every upload |
| **Kindle Create** | Free Amazon app for finer chapter styling and front matter |
| **Calibre** | Convert formats, tweak EPUB metadata, batch fixes |
| **Word / DOCX** | If you want an editor or proofreader to work in Word first |

---

## Front and back matter

Use the **Insert…** menu in the toolbar to add the standard Kindle pages:

- **Complete front matter** — Title Page, Copyright, and Dedication, inserted at the top of the book in the right order
- **Title page / Copyright page / Dedication** — individually, at the cursor
- **Acknowledgments** and **About the Author** — appended at the end of the book
- **KDP book details worksheet** — a private `[Notes]` block for your description, keywords, categories, and cover specs (never exported)

Each page is a normal `#` section, so it appears in the outline, the EPUB, and the Kindle table of contents. Edit the placeholder text after inserting. You can also fine-tune front matter in Kindle Create after export.

---

## Common issues and fixes

| Problem | Likely fix |
|---------|------------|
| Notes appeared in export | Use **Export**, not **Save**; only Export strips `[Notes]` |
| Chapter missing from TOC | Ensure chapter lines start with `## ` at the beginning of the line |
| Section not separated | Section lines must start with `# ` (single hash) |
| Italics lost | Keep italic text as `*text*`; re-export EPUB |
| EPUB rejected by KDP | Open in Kindle Previewer first; re-save from Calibre if needed |

---

## Difficulty at a glance

| Step | Effort |
|------|--------|
| Export EPUB from Simple Author | Done — one click |
| Upload to KDP | Easy |
| Preview and fix formatting | Moderate — expect a round or two |
| Professional cover + metadata | Your creative work |
| Print / paperback edition | Separate KDP paperback setup (PDF or DOCX) |

---

## Links

- KDP dashboard: https://kdp.amazon.com
- KDP help: https://kdp.amazon.com/en_US/help/topic/G200634390
- Kindle Previewer: https://www.amazon.com/Kindle-Previewer/b?node=21381691011

---

*Last updated: July 2026 — for Simple Author*