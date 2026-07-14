import JSZip from 'jszip';
import { stripNotes } from './notes';
import { stripStyleBlocks } from './suno';

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkup(text: string): string {
  return escapeHtml(text)
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');
}

export function toPublishMarkdown(doc: string): string {
  return stripNotes(stripStyleBlocks(doc)).trimEnd() + '\n';
}

export function toPlainText(doc: string): string {
  return stripNotes(stripStyleBlocks(doc))
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + '\n';
}

function proseToHtml(text: string): string {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  return paragraphs
    .map((p) => `<p>${inlineMarkup(p.replace(/\n/g, ' ').trim())}</p>`)
    .join('\n    ');
}

function chapterXhtml(title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" type="text/css" href="stylesheet.css"/>
</head>
<body>
  <h2>${escapeHtml(title)}</h2>
  ${proseToHtml(body)}
</body>
</html>`;
}

interface PublishItem {
  type: 'section' | 'chapter';
  title: string;
  body: string;
}

function parsePublishStructure(clean: string): PublishItem[] {
  const items: PublishItem[] = [];
  const lines = clean.split('\n');
  let current: { type: 'section' | 'chapter'; title: string; lines: string[] } | null = null;

  const flush = (): void => {
    if (!current) return;
    items.push({
      type: current.type,
      title: current.title,
      body: current.lines.join('\n').trim(),
    });
    current = null;
  };

  for (const line of lines) {
    if (/^# (?!#)/.test(line)) {
      flush();
      current = { type: 'section', title: line.replace(/^#\s+/, '').trim(), lines: [] };
    } else if (/^## (?!#)/.test(line)) {
      flush();
      current = { type: 'chapter', title: line.replace(/^##\s+/, '').trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();

  return items;
}

function sectionXhtml(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" type="text/css" href="stylesheet.css"/>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
</body>
</html>`;
}

export async function toEpub(doc: string, title = "Manuscript"): Promise<Blob> {
  const clean = stripNotes(stripStyleBlocks(doc));
  const structure = parsePublishStructure(clean);
  const zip = new JSZip();

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.folder('META-INF')!.file(
    'container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  const oebps = zip.folder('OEBPS')!;
  oebps.file(
    'stylesheet.css',
    `body { font-family: Georgia, serif; line-height: 1.6; margin: 1em; }
h1 { font-size: 1.6em; margin-top: 2em; }
h2 { font-size: 1.3em; margin-top: 1.5em; }
p { margin: 0 0 1em 0; text-indent: 1.5em; }
p:first-of-type { text-indent: 0; }
em { font-style: italic; }`,
  );

  const manifestItems: string[] = [];
  const spineItems: string[] = [];
  const navPoints: string[] = [];
  let itemIndex = 1;
  let navIndex = 1;

  const addItem = (id: string, href: string, mediaType: string, spine = true): void => {
    manifestItems.push(`<item id="${id}" href="${href}" media-type="${mediaType}"/>`);
    if (spine) spineItems.push(`<itemref idref="${id}"/>`);
  };

  addItem('css', 'stylesheet.css', 'text/css', false);

  if (structure.length === 0) {
    const href = 'body.xhtml';
    addItem('body', href, 'application/xhtml+xml');
    oebps.file(href, chapterXhtml(title, clean));
    navPoints.push(
      `<navPoint id="nav${navIndex}" playOrder="${navIndex}"><navLabel><text>${escapeHtml(title)}</text></navLabel><content src="${href}"/></navPoint>`,
    );
  } else {
    for (const item of structure) {
      const href = `item-${itemIndex}.xhtml`;
      const id = `item-${itemIndex}`;

      if (item.type === 'section') {
        addItem(id, href, 'application/xhtml+xml');
        oebps.file(href, sectionXhtml(item.title));
      } else {
        addItem(id, href, 'application/xhtml+xml');
        oebps.file(href, chapterXhtml(item.title, item.body));
      }

      navPoints.push(
        `<navPoint id="nav${navIndex}" playOrder="${navIndex}"><navLabel><text>${escapeHtml(item.title)}</text></navLabel><content src="${href}"/></navPoint>`,
      );
      navIndex++;
      itemIndex++;
    }
  }

  oebps.file(
    'toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="manuscript"/>
    <meta name="dtb:depth" content="2"/>
  </head>
  <docTitle><text>${escapeHtml(title)}</text></docTitle>
  <navMap>
    ${navPoints.join('\n    ')}
  </navMap>
</ncx>`,
  );

  addItem('ncx', 'toc.ncx', 'application/x-dtbncx+xml', false);

  oebps.file(
    'content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">manuscript</dc:identifier>
    <dc:title>${escapeHtml(title)}</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`,
  );

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
}

export async function getExportBlob(
  doc: string,
  format: 'md' | 'txt' | 'epub',
  basename = 'manuscript',
): Promise<{ blob: Blob; filename: string }> {
  switch (format) {
    case 'md':
      return {
        blob: new Blob([toPublishMarkdown(doc)], { type: 'text/markdown' }),
        filename: `${basename}-publish.md`,
      };
    case 'txt':
      return {
        blob: new Blob([toPlainText(doc)], { type: 'text/plain' }),
        filename: `${basename}-publish.txt`,
      };
    case 'epub':
      return {
        blob: await toEpub(doc),
        filename: `${basename}.epub`,
      };
  }
}

export async function exportPublish(
  doc: string,
  format: 'md' | 'txt' | 'epub',
  basename = 'manuscript',
): Promise<void> {
  const { blob, filename } = await getExportBlob(doc, format, basename);
  downloadBlob(blob, filename);
}