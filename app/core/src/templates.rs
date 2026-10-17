//! Mode-specific starter templates for the "Insert..." toolbar menu.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Placement {
    Top,
    Cursor,
    End,
}

pub struct ManuscriptTemplate {
    pub id: &'static str,
    pub label: &'static str,
    pub placement: Placement,
    pub content: String,
}

/// `year` is supplied by the caller (this crate has no GUI/OS clock
/// dependency) — pass e.g. the current year from `std::time` in the app layer.
pub fn book_templates(year: i32) -> Vec<ManuscriptTemplate> {
    let title_page = "# Title Page\n\n[Notes]\nTitle:\nSubtitle:\nAuthor:\n[/Notes]\n".to_string();
    let copyright = format!(
        "# Copyright\n\nCopyright © {year} [Author Name]. All rights reserved.\n"
    );
    let dedication = "# Dedication\n\n[For...]\n".to_string();

    vec![
        ManuscriptTemplate {
            id: "front-matter-set",
            label: "Front matter (Title + Copyright + Dedication)",
            placement: Placement::Top,
            content: format!("{title_page}\n{copyright}\n{dedication}"),
        },
        ManuscriptTemplate {
            id: "title-page",
            label: "Title page",
            placement: Placement::Cursor,
            content: title_page,
        },
        ManuscriptTemplate {
            id: "copyright",
            label: "Copyright page",
            placement: Placement::Cursor,
            content: copyright,
        },
        ManuscriptTemplate {
            id: "dedication",
            label: "Dedication",
            placement: Placement::Cursor,
            content: dedication,
        },
        ManuscriptTemplate {
            id: "acknowledgments",
            label: "Acknowledgments",
            placement: Placement::End,
            content: "# Acknowledgments\n\n".to_string(),
        },
        ManuscriptTemplate {
            id: "about-the-author",
            label: "About the Author",
            placement: Placement::End,
            content: "# About the Author\n\n".to_string(),
        },
        ManuscriptTemplate {
            id: "book-details",
            label: "KDP book details worksheet",
            placement: Placement::Top,
            content: "[Notes]\n\
Title:\n\
Subtitle:\n\
Author:\n\
Contributors:\n\
Description:\n\
Keywords: 1. 2. 3. 4. 5. 6. 7.\n\
Categories (BISAC): 1. 2. 3.\n\
Cover image: JPG or TIFF, at least 1600 × 2560 px (1.6:1 ratio)\n\
[/Notes]\n"
                .to_string(),
        },
    ]
}

pub fn lyrics_templates() -> Vec<ManuscriptTemplate> {
    vec![
        ManuscriptTemplate {
            id: "song-structure",
            label: "Song structure",
            placement: Placement::Top,
            content: "# Song Title\n\n## Verse 1\n\n## Chorus\n\n## Verse 2\n\n## Bridge\n\n"
                .to_string(),
        },
        ManuscriptTemplate {
            id: "verse",
            label: "Verse",
            placement: Placement::Cursor,
            content: "## Verse \n\n".to_string(),
        },
        ManuscriptTemplate {
            id: "chorus",
            label: "Chorus",
            placement: Placement::Cursor,
            content: "## Chorus\n\n".to_string(),
        },
        ManuscriptTemplate {
            id: "bridge",
            label: "Bridge",
            placement: Placement::Cursor,
            content: "## Bridge\n\n".to_string(),
        },
        ManuscriptTemplate {
            id: "suno-style",
            label: "Suno style prompt",
            placement: Placement::Top,
            content: "[Style]\nupbeat pop, female vocal, acoustic guitar, 120bpm\n[/Style]\n"
                .to_string(),
        },
        ManuscriptTemplate {
            id: "performance-tag",
            label: "Performance tag",
            placement: Placement::Cursor,
            content: "[building vocals, female lead]\n".to_string(),
        },
    ]
}

pub fn poetry_templates() -> Vec<ManuscriptTemplate> {
    vec![
        ManuscriptTemplate {
            id: "poem-title",
            label: "Poem title",
            placement: Placement::Top,
            content: "# Poem Title\n\n".to_string(),
        },
        ManuscriptTemplate {
            id: "haiku",
            label: "Haiku scaffold",
            placement: Placement::Cursor,
            content: "[Notes]\nThree lines: 5, 7, then 5 syllables.\n[/Notes]\n\n\n\n\n"
                .to_string(),
        },
        ManuscriptTemplate {
            id: "sonnet",
            label: "Sonnet scaffold",
            placement: Placement::Cursor,
            content: "[Notes]\nShakespearean sonnet: 14 lines, ABAB CDCD EFEF GG, iambic pentameter.\n[/Notes]\n\n"
                .to_string(),
        },
    ]
}

pub fn sermon_templates() -> Vec<ManuscriptTemplate> {
    vec![
        ManuscriptTemplate {
            id: "sermon-outline",
            label: "Full sermon outline",
            placement: Placement::Top,
            content: "# Sermon Title\n\n\
[Notes]\n\
Date:\n\
Congregation:\n\
Text:\n\
Big idea:\n\
[/Notes]\n\n\
## Opening\n\n\
## Scripture Reading\n\n\
## Point 1 —\n\n\
[Notes]\nIllustration:\n[/Notes]\n\n\
## Point 2 —\n\n\
[Notes]\nIllustration:\n[/Notes]\n\n\
## Point 3 —\n\n\
[Notes]\nIllustration:\n[/Notes]\n\n\
## Application\n\n\
## Closing\n\n"
                .to_string(),
        },
        ManuscriptTemplate {
            id: "point-with-illustration",
            label: "Point (with illustration note)",
            placement: Placement::Cursor,
            content: "## Point —\n\n[Notes]\nIllustration:\n[/Notes]\n\n".to_string(),
        },
    ]
}
