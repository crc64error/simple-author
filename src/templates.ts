// Front / back matter templates following Amazon KDP's guidelines for
// Kindle ebooks. Sections use `# ` so they land in the outline, the EPUB
// spine, and the Kindle TOC. The Book Details worksheet lives inside a
// [Notes] block so it is stripped from every export.

export interface ManuscriptTemplate {
  id: string;
  label: string;
  placement: 'top' | 'cursor' | 'end';
  content: string;
}

const YEAR = new Date().getFullYear();

const TITLE_PAGE = `# Title Page

YOUR BOOK TITLE

Series Name — Book One

Author Name`;

const COPYRIGHT_PAGE = `# Copyright

Your Book Title

Copyright © ${YEAR} Author Name

All rights reserved. No part of this book may be reproduced in any form without written permission from the author, except for brief quotations used in a book review.

This is a work of fiction. Names, characters, places, and incidents are products of the author's imagination or are used fictitiously. Any resemblance to actual persons, living or dead, or actual events is purely coincidental.

First edition, ${YEAR}`;

const DEDICATION = `# Dedication

For …`;

const ACKNOWLEDGMENTS = `# Acknowledgments

Thank you to …`;

const ABOUT_THE_AUTHOR = `# About the Author

Author Name is …`;

const BOOK_DETAILS = `[Notes]
KDP BOOK DETAILS — private worksheet, never exported.
Fill these in here; you will enter them on kdp.amazon.com when you publish.

Book title:
Subtitle:
Author:
Contributors (editor, illustrator, translator…):

Description — back-cover blurb, roughly 150–200 words:


Keywords (up to 7) — phrases readers would search for:
1.
2.
3.
4.
5.
6.
7.

Categories (BISAC, e.g. FICTION / Science Fiction / Hard Science Fiction):
1.
2.
3.

Cover image: JPG or TIFF, at least 1600 × 2560 px (1.6:1 ratio) recommended.
[/Notes]`;

export const LYRICS_TEMPLATES: ManuscriptTemplate[] = [
  {
    id: 'song-structure',
    label: 'Song (verse–chorus–bridge)',
    placement: 'cursor',
    content: `# Song Title

## Verse 1



## Chorus



## Verse 2



## Bridge`,
  },
  { id: 'verse', label: 'Verse', placement: 'cursor', content: '## Verse ' },
  { id: 'chorus', label: 'Chorus', placement: 'cursor', content: '## Chorus' },
  { id: 'bridge', label: 'Bridge', placement: 'cursor', content: '## Bridge' },
  {
    id: 'suno-style',
    label: 'Suno style prompt (top)',
    placement: 'top',
    content: `[Style]
dreamy indie folk, intimate female vocals, fingerpicked acoustic guitar, brushed drums, warm and hopeful, moderate tempo
[/Style]`,
  },
  {
    id: 'suno-tag',
    label: 'Performance tag',
    placement: 'cursor',
    content: '[building vocals, female lead]',
  },
];

export const POETRY_TEMPLATES: ManuscriptTemplate[] = [
  { id: 'poem', label: 'New poem', placement: 'cursor', content: '# Poem Title' },
  {
    id: 'haiku',
    label: 'Haiku (5–7–5)',
    placement: 'cursor',
    content: `# Haiku

[Notes]
Three lines: 5, 7, then 5 syllables. A season word; a turn in the last line.
[/Notes]`,
  },
  {
    id: 'sonnet',
    label: 'Sonnet (scaffold)',
    placement: 'cursor',
    content: `# Sonnet

[Notes]
14 lines of iambic pentameter. Shakespearean: three quatrains (ABAB CDCD
EFEF) and a closing couplet (GG) that turns or resolves the argument.
[/Notes]`,
  },
];

export const SERMON_TEMPLATES: ManuscriptTemplate[] = [
  {
    id: 'sermon-outline',
    label: 'Sermon outline',
    placement: 'cursor',
    content: `# Sermon Title

[Notes]
Date:
Congregation:
Text:
Big idea — one sentence:
[/Notes]

## Opening

## Scripture Reading

## Point 1 —

[Notes]
Illustration:
[/Notes]

## Point 2 —

[Notes]
Illustration:
[/Notes]

## Point 3 —

[Notes]
Illustration:
[/Notes]

## Application

## Closing`,
  },
  {
    id: 'sermon-point',
    label: 'Point (with illustration note)',
    placement: 'cursor',
    content: `## Point —

[Notes]
Illustration:
[/Notes]`,
  },
];

export const TEMPLATES: ManuscriptTemplate[] = [
  {
    id: 'front-matter-set',
    label: 'Complete front matter (top of book)',
    placement: 'top',
    content: `${TITLE_PAGE}\n\n${COPYRIGHT_PAGE}\n\n${DEDICATION}`,
  },
  { id: 'title-page', label: 'Title page', placement: 'cursor', content: TITLE_PAGE },
  { id: 'copyright', label: 'Copyright page', placement: 'cursor', content: COPYRIGHT_PAGE },
  { id: 'dedication', label: 'Dedication', placement: 'cursor', content: DEDICATION },
  {
    id: 'acknowledgments',
    label: 'Acknowledgments (end of book)',
    placement: 'end',
    content: ACKNOWLEDGMENTS,
  },
  {
    id: 'about-the-author',
    label: 'About the Author (end of book)',
    placement: 'end',
    content: ABOUT_THE_AUTHOR,
  },
  {
    id: 'book-details',
    label: 'KDP book details worksheet (private notes)',
    placement: 'top',
    content: BOOK_DETAILS,
  },
];
