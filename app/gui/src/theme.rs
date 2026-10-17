//! The 4 named color themes, ported from `themes.ts`. Only colors differ
//! between themes — editor font/size/line-height/column-width are theme-
//! independent (owned by `app.rs`).
//!
//! Note: the original CSS exposed more tokens than the rewrite's functional
//! spec enumerated exact hex values for (body text color on dark themes,
//! `--notes-bg`, `--notes-text`, `--spell-error`, `--invisibles`,
//! `--selection`). Those are reasonable approximations here, called out
//! individually below — expect to tune them against the real app once both
//! run side by side.

use egui::Color32;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ThemeId {
    Forest,
    Midnight,
    Parchment,
    Slate,
}

pub struct Theme {
    pub id: ThemeId,
    pub label: &'static str,
    pub bg: Color32,
    pub fg: Color32,
    pub accent: Color32,
    pub chapter: Color32,
    pub section: Color32,
    pub emphasis: Color32,
    pub notes: Color32,
    pub notes_bg: Color32,
    /// Note *body* text color — distinct from `notes` (the tag-line color)
    /// per the original CSS's separate `--notes-text` token. Approximated as
    /// a softened `fg` since the exact hex wasn't in the gathered spec.
    pub notes_text: Color32,
    pub spell_error: Color32,
    // Reserved for the ¶/↵ invisibles overlay (a later phase) — not read yet.
    #[allow(dead_code)]
    pub invisibles: Color32,
    pub selection: Color32,
    pub style_bg: Color32,
}

/// A translucent tint of `rgb` at `alpha/255` opacity, composited over
/// whatever's underneath. Uses `from_rgba_unmultiplied` deliberately — these
/// are "straight" RGB values (the actual tint color), not pre-multiplied
/// ones, and mixing the two up renders a much stronger wash than intended
/// (which is exactly what made the first pass look solid yellow instead of
/// a subtle background tint).
fn tint(rgb: (u8, u8, u8), alpha: u8) -> Color32 {
    Color32::from_rgba_unmultiplied(rgb.0, rgb.1, rgb.2, alpha)
}

fn build(
    id: ThemeId,
    label: &'static str,
    bg: (u8, u8, u8),
    fg: (u8, u8, u8),
    accent: (u8, u8, u8),
    chapter: (u8, u8, u8),
    section: (u8, u8, u8),
    emphasis: (u8, u8, u8),
    notes: (u8, u8, u8),
    spell_error: (u8, u8, u8),
) -> Theme {
    let fg = Color32::from_rgb(fg.0, fg.1, fg.2);
    Theme {
        id,
        label,
        bg: Color32::from_rgb(bg.0, bg.1, bg.2),
        fg,
        accent: Color32::from_rgb(accent.0, accent.1, accent.2),
        chapter: Color32::from_rgb(chapter.0, chapter.1, chapter.2),
        section: Color32::from_rgb(section.0, section.1, section.2),
        emphasis: Color32::from_rgb(emphasis.0, emphasis.1, emphasis.2),
        notes: Color32::from_rgb(notes.0, notes.1, notes.2),
        notes_bg: tint(notes, 38),
        notes_text: fg.gamma_multiply(0.75),
        spell_error: Color32::from_rgb(spell_error.0, spell_error.1, spell_error.2),
        invisibles: tint((fg.r(), fg.g(), fg.b()), 130),
        selection: tint(accent, 90),
        style_bg: tint(section, 32),
    }
}

pub fn themes() -> [Theme; 4] {
    [
        build(
            ThemeId::Forest,
            "Forest",
            (0x1a, 0x23, 0x19),
            (0xe3, 0xe8, 0xe0), // fg approximated: not in the original spec
            (0x7c, 0xb8, 0x7a),
            (0xa8, 0xd5, 0xa2),
            (0x8e, 0xc9, 0xe8),
            (0xd4, 0xa5, 0xe8),
            (0xc9, 0xa8, 0x6c),
            (0xe0, 0x6c, 0x6c), // spell_error approximated
        ),
        build(
            ThemeId::Midnight,
            "Midnight",
            (0x12, 0x14, 0x1a),
            (0xe3, 0xe6, 0xef), // approximated
            (0x6b, 0x9f, 0xff),
            (0x9e, 0xc5, 0xff),
            (0x7d, 0xd3, 0xc0),
            (0xc9, 0xa0, 0xdc),
            (0xc9, 0xa8, 0x6c), // approximated (not given per-theme)
            (0xe0, 0x6c, 0x6c),
        ),
        build(
            ThemeId::Parchment,
            "Parchment",
            (0xf5, 0xf0, 0xe6),
            (0x2c, 0x24, 0x16),
            (0x8b, 0x69, 0x14),
            (0x5c, 0x4a, 0x1f),
            (0x3d, 0x5c, 0x4a),
            (0x6b, 0x3d, 0x6b),
            (0x8b, 0x69, 0x14), // approximated
            (0xb5, 0x3a, 0x3a), // darker for light bg
        ),
        build(
            ThemeId::Slate,
            "Slate",
            (0x2b, 0x30, 0x38),
            (0xe4, 0xe6, 0xe9), // approximated
            (0x7e, 0xb8, 0xda),
            (0xa8, 0xcc, 0xe8),
            (0x8e, 0xd4, 0xb8),
            (0xd4, 0xa8, 0xe0),
            (0xc9, 0xa8, 0x6c), // approximated
            (0xe0, 0x6c, 0x6c),
        ),
    ]
}

pub fn get(id: ThemeId) -> Theme {
    themes()
        .into_iter()
        .find(|t| t.id == id)
        .unwrap_or_else(|| themes().into_iter().next().unwrap())
}
