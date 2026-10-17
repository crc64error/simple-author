//! Markdown / plain-text / EPUB export. Every format starts from the same
//! cleaned text: strip `[Style]` blocks, *then* strip `[Notes]` blocks — that
//! order matters and must not be reversed.

use crate::notes::strip_notes;
use crate::suno::strip_style_blocks;
use std::io::{Cursor, Write};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

fn clean(doc: &str) -> String {
    strip_notes(&strip_style_blocks(doc))
}

pub fn to_publish_markdown(doc: &str) -> String {
    let mut s = clean(doc);
    truncate_trailing_whitespace(&mut s);
    s.push('\n');
    s
}

pub fn to_plain_text(doc: &str) -> String {
    let cleaned = clean(doc);

    let mut out = String::with_capacity(cleaned.len());
    for (i, line) in cleaned.split('\n').enumerate() {
        if i > 0 {
            out.push('\n');
        }
        out.push_str(strip_heading_prefix(line));
    }

    let no_emphasis = crate::regex_cache::emphasis().replace_all(&out, |caps: &regex::Captures| {
        caps.get(1)
            .or_else(|| caps.get(2))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default()
    });

    let mut collapsed = crate::regex_cache::newline_run()
        .replace_all(&no_emphasis, "\n\n")
        .to_string();
    truncate_trailing_whitespace(&mut collapsed);
    collapsed.push('\n');
    collapsed
}

fn truncate_trailing_whitespace(s: &mut String) {
    let trimmed_len = s.trim_end().len();
    s.truncate(trimmed_len);
}

/// `/^#{1,3}\s+/` at line start -> dropped, keeping the heading text.
fn strip_heading_prefix(line: &str) -> &str {
    let hash_len = line.chars().take_while(|&c| c == '#').count();
    if !(1..=3).contains(&hash_len) {
        return line;
    }
    let rest = &line[hash_len..];
    let ws_len = rest.len() - rest.trim_start().len();
    if ws_len == 0 {
        line
    } else {
        &rest[ws_len..]
    }
}

// ---------------------------------------------------------------------------
// EPUB
// ---------------------------------------------------------------------------

enum ItemKind {
    Section,
    Chapter,
}

struct StructureItem {
    kind: ItemKind,
    title: String,
    body: String,
}

fn parse_publish_structure(doc: &str, fallback_title: &str) -> Vec<StructureItem> {
    let mut items: Vec<StructureItem> = Vec::new();
    let mut body_lines: Vec<&str> = Vec::new();

    let flush_body = |items: &mut Vec<StructureItem>, body_lines: &mut Vec<&str>| {
        if let Some(last) = items.last_mut() {
            last.body = body_lines.join("\n").trim().to_string();
        }
        body_lines.clear();
    };

    for line in doc.split('\n') {
        if let Some(title) = strip_section_heading(line) {
            flush_body(&mut items, &mut body_lines);
            items.push(StructureItem { kind: ItemKind::Section, title: title.to_string(), body: String::new() });
        } else if let Some(title) = strip_chapter_heading(line) {
            flush_body(&mut items, &mut body_lines);
            items.push(StructureItem { kind: ItemKind::Chapter, title: title.to_string(), body: String::new() });
        } else {
            body_lines.push(line);
        }
    }
    flush_body(&mut items, &mut body_lines);

    if items.is_empty() {
        items.push(StructureItem {
            kind: ItemKind::Chapter,
            title: fallback_title.to_string(),
            body: doc.trim().to_string(),
        });
    }
    items
}

fn strip_section_heading(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("# ")?;
    (!rest.starts_with('#')).then(|| rest.trim_end())
}

fn strip_chapter_heading(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("## ")?;
    (!rest.starts_with('#')).then(|| rest.trim_end())
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn inline_markup(s: &str) -> String {
    let escaped = escape_html(s);
    crate::regex_cache::emphasis()
        .replace_all(&escaped, |caps: &regex::Captures| {
            let inner = caps.get(1).or_else(|| caps.get(2)).map(|m| m.as_str()).unwrap_or("");
            format!("<em>{inner}</em>")
        })
        .to_string()
}

fn paragraphs_html(body: &str) -> String {
    body.split("\n\n")
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(|p| format!("<p>{}</p>", inline_markup(&p.split('\n').collect::<Vec<_>>().join(" "))))
        .collect::<Vec<_>>()
        .join("\n")
}

fn section_xhtml(title: &str) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
<!DOCTYPE html>\n\
<html xmlns=\"http://www.w3.org/1999/xhtml\"><head><title>{t}</title>\
<link rel=\"stylesheet\" type=\"text/css\" href=\"stylesheet.css\"/></head>\n\
<body><h1>{t}</h1></body></html>",
        t = escape_html(title)
    )
}

fn chapter_xhtml(title: &str, body: &str) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
<!DOCTYPE html>\n\
<html xmlns=\"http://www.w3.org/1999/xhtml\"><head><title>{t}</title>\
<link rel=\"stylesheet\" type=\"text/css\" href=\"stylesheet.css\"/></head>\n\
<body><h2>{t}</h2>\n{p}</body></html>",
        t = escape_html(title),
        p = paragraphs_html(body)
    )
}

const STYLESHEET_CSS: &str = "body { font-family: Georgia, serif; }\n\
h1 { font-size: 1.8em; text-align: center; }\n\
h2 { font-size: 1.4em; }\n\
p { margin: 0; text-indent: 1.5em; }\n\
p:first-of-type { text-indent: 0; }\n\
em { font-style: italic; }\n";

pub fn to_epub(doc: &str, title: &str) -> std::io::Result<Vec<u8>> {
    let cleaned = clean(doc);
    let items = parse_publish_structure(&cleaned, title);

    let file_names: Vec<String> = if items.len() == 1 && matches!(items[0].kind, ItemKind::Chapter) && !cleaned.contains("# ") && !cleaned.contains("## ") {
        vec!["body.xhtml".to_string()]
    } else {
        (1..=items.len()).map(|i| format!("item-{i}.xhtml")).collect()
    };

    let buf = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(buf);

    // `mimetype` must be the first entry, stored uncompressed (OCF/EPUB spec requirement).
    zip.start_file("mimetype", SimpleFileOptions::default().compression_method(CompressionMethod::Stored))?;
    zip.write_all(b"application/epub+zip")?;

    let deflate = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    zip.start_file("META-INF/container.xml", deflate)?;
    zip.write_all(CONTAINER_XML.as_bytes())?;

    zip.start_file("OEBPS/stylesheet.css", deflate)?;
    zip.write_all(STYLESHEET_CSS.as_bytes())?;

    for (item, name) in items.iter().zip(&file_names) {
        let xhtml = match item.kind {
            ItemKind::Section => section_xhtml(&item.title),
            ItemKind::Chapter => chapter_xhtml(&item.title, &item.body),
        };
        zip.start_file(format!("OEBPS/{name}"), deflate)?;
        zip.write_all(xhtml.as_bytes())?;
    }

    zip.start_file("OEBPS/toc.ncx", deflate)?;
    zip.write_all(build_ncx(&items, &file_names, title).as_bytes())?;

    zip.start_file("OEBPS/content.opf", deflate)?;
    zip.write_all(build_opf(&file_names, title).as_bytes())?;

    let cursor = zip.finish().map_err(std::io::Error::other)?;
    Ok(cursor.into_inner())
}

const CONTAINER_XML: &str = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
<container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\">\n\
  <rootfiles><rootfile full-path=\"OEBPS/content.opf\" media-type=\"application/oebps-package+xml\"/></rootfiles>\n\
</container>";

fn build_ncx(items: &[StructureItem], file_names: &[String], title: &str) -> String {
    let nav_points: String = items
        .iter()
        .zip(file_names)
        .enumerate()
        .map(|(i, (item, name))| {
            format!(
                "<navPoint id=\"navpoint-{n}\" playOrder=\"{n}\"><navLabel><text>{t}</text></navLabel><content src=\"{name}\"/></navPoint>",
                n = i + 1,
                t = escape_html(&item.title)
            )
        })
        .collect();
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
<ncx xmlns=\"http://www.daisy.org/z3986/2005/ncx/\" version=\"2005-1\">\n\
<head/><docTitle><text>{t}</text></docTitle>\n\
<navMap>{nav_points}</navMap></ncx>",
        t = escape_html(title)
    )
}

fn build_opf(file_names: &[String], title: &str) -> String {
    let manifest_items: String = file_names
        .iter()
        .enumerate()
        .map(|(i, name)| format!("<item id=\"item-{}\" href=\"{name}\" media-type=\"application/xhtml+xml\"/>", i + 1))
        .collect();
    let spine_items: String = (1..=file_names.len())
        .map(|i| format!("<itemref idref=\"item-{i}\"/>"))
        .collect();

    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
<package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"book-id\">\n\
<metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\n\
<dc:identifier id=\"book-id\">manuscript</dc:identifier>\n\
<dc:title>{t}</dc:title><dc:language>en</dc:language>\n\
</metadata>\n\
<manifest>\
<item id=\"css\" href=\"stylesheet.css\" media-type=\"text/css\"/>\
<item id=\"ncx\" href=\"toc.ncx\" media-type=\"application/x-dtbncx+xml\"/>\
{manifest_items}\
</manifest>\n\
<spine toc=\"ncx\">{spine_items}</spine>\n\
</package>",
        t = escape_html(title)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_order_is_style_then_notes() {
        // Both `strip_style_blocks`/`strip_notes` only trim *trailing*
        // whitespace (never leading) — stripping a leading block legitimately
        // leaves the blank lines that followed it, exactly as in the TS original.
        let doc = "[Style]\nprompt\n[/Style]\n\n[Notes]\nscratch\n[/Notes]\n\nBody.\n";
        assert_eq!(clean(doc), "\n\nBody.");
    }

    #[test]
    fn plain_text_strips_markers_keeps_text_and_collapses_blanks() {
        let doc = "# Title\n\nA *great* day.\n\n\n\nNext.\n";
        let out = to_plain_text(doc);
        assert_eq!(out, "Title\n\nA great day.\n\nNext.\n");
    }

    #[test]
    fn markdown_export_passes_through_structure_verbatim() {
        let doc = "# Title\n\n*italic* and _also italic_.\n";
        let out = to_publish_markdown(doc);
        assert_eq!(out, "# Title\n\n*italic* and _also italic_.\n");
    }

    #[test]
    fn epub_mimetype_entry_is_first_and_stored() {
        let bytes = to_epub("# A Title\nSome prose.\n", "Manuscript").unwrap();
        let reader = Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(reader).unwrap();
        let first = archive.by_index(0).unwrap();
        assert_eq!(first.name(), "mimetype");
        assert_eq!(first.compression(), CompressionMethod::Stored);
    }

    #[test]
    fn epub_falls_back_to_single_chapter_without_headings() {
        let bytes = to_epub("Just prose, no headings at all.", "My Book").unwrap();
        let reader = Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(reader).unwrap();
        let mut body = String::new();
        archive
            .by_name("OEBPS/body.xhtml")
            .unwrap()
            .read_to_string(&mut body)
            .unwrap();
        assert!(body.contains("My Book"));
        assert!(body.contains("Just prose"));
    }

    #[test]
    fn epub_section_pages_have_no_body_text() {
        let doc = "# Part One\nThis line is discarded, not shown.\n## Chapter 1\nReal prose here.\n";
        let bytes = to_epub(doc, "Book").unwrap();
        let reader = Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(reader).unwrap();

        let mut section = String::new();
        archive.by_name("OEBPS/item-1.xhtml").unwrap().read_to_string(&mut section).unwrap();
        assert!(section.contains("<h1>Part One</h1>"));
        assert!(!section.contains("discarded"));

        let mut chapter = String::new();
        archive.by_name("OEBPS/item-2.xhtml").unwrap().read_to_string(&mut chapter).unwrap();
        assert!(chapter.contains("Real prose here"));
    }

    use std::io::Read;
}
