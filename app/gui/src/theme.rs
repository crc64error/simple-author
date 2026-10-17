//! The 4 named color themes, ported from `themes.ts`. Only colors differ
//! between themes — editor font/size/line-height/column-width are theme-
//! independent (owned by `app.rs`).
//!
//! Note: the original CSS exposed more tokens than the rewrite's functional
//! spec enumerated exact hex values for (body text color on dark themes,
//! `--notes-bg`, `--spell-error`, `--invisibles`, `--selection`). Those are
//! reasonable approximations here, called out individually below — expect to
//! tune them against the real app once both run side by side.

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
    pub spell_error: Color32,
    // Reserved for the ¶/↵ invisibles overlay (a later phase) — not read yet.
    #[allow(dead_code)]
    pub invisibles: Color32,
    pub selection: Color32,
    pub style_bg: Color32,
}

pub const THEMES: [Theme; 4] = [
    Theme {
        id: ThemeId::Forest,
        label: "Forest",
        bg: Color32::from_rgb(0x1a, 0x23, 0x19),
        fg: Color32::from_rgb(0xe3, 0xe8, 0xe0), // approximated: not in the original spec
        accent: Color32::from_rgb(0x7c, 0xb8, 0x7a),
        chapter: Color32::from_rgb(0xa8, 0xd5, 0xa2),
        section: Color32::from_rgb(0x8e, 0xc9, 0xe8),
        emphasis: Color32::from_rgb(0xd4, 0xa5, 0xe8),
        notes: Color32::from_rgb(0xc9, 0xa8, 0x6c),
        notes_bg: Color32::from_rgba_premultiplied(0xc9, 0xa8, 0x6c, 24), // approximated translucent tint
        spell_error: Color32::from_rgb(0xe0, 0x6c, 0x6c), // approximated
        invisibles: Color32::from_rgba_premultiplied(0xe3, 0xe8, 0xe0, 110), // approximated, ~0.5 alpha
        selection: Color32::from_rgba_premultiplied(0x7c, 0xb8, 0x7a, 70), // approximated
        style_bg: Color32::from_rgba_premultiplied(0x8e, 0xc9, 0xe8, 20), // approximated
    },
    Theme {
        id: ThemeId::Midnight,
        label: "Midnight",
        bg: Color32::from_rgb(0x12, 0x14, 0x1a),
        fg: Color32::from_rgb(0xe3, 0xe6, 0xef), // approximated
        accent: Color32::from_rgb(0x6b, 0x9f, 0xff),
        chapter: Color32::from_rgb(0x9e, 0xc5, 0xff),
        section: Color32::from_rgb(0x7d, 0xd3, 0xc0),
        emphasis: Color32::from_rgb(0xc9, 0xa0, 0xdc),
        notes: Color32::from_rgb(0xc9, 0xa8, 0x6c), // approximated (not given per-theme)
        notes_bg: Color32::from_rgba_premultiplied(0xc9, 0xa8, 0x6c, 24),
        spell_error: Color32::from_rgb(0xe0, 0x6c, 0x6c),
        invisibles: Color32::from_rgba_premultiplied(0xe3, 0xe6, 0xef, 110),
        selection: Color32::from_rgba_premultiplied(0x6b, 0x9f, 0xff, 70),
        style_bg: Color32::from_rgba_premultiplied(0x7d, 0xd3, 0xc0, 20),
    },
    Theme {
        id: ThemeId::Parchment,
        label: "Parchment",
        bg: Color32::from_rgb(0xf5, 0xf0, 0xe6),
        fg: Color32::from_rgb(0x2c, 0x24, 0x16),
        accent: Color32::from_rgb(0x8b, 0x69, 0x14),
        chapter: Color32::from_rgb(0x5c, 0x4a, 0x1f),
        section: Color32::from_rgb(0x3d, 0x5c, 0x4a),
        emphasis: Color32::from_rgb(0x6b, 0x3d, 0x6b),
        notes: Color32::from_rgb(0x8b, 0x69, 0x14), // approximated
        notes_bg: Color32::from_rgba_premultiplied(0x8b, 0x69, 0x14, 20),
        spell_error: Color32::from_rgb(0xb5, 0x3a, 0x3a), // approximated, darker for light bg
        invisibles: Color32::from_rgba_premultiplied(0x2c, 0x24, 0x16, 110),
        selection: Color32::from_rgba_premultiplied(0x8b, 0x69, 0x14, 50),
        style_bg: Color32::from_rgba_premultiplied(0x3d, 0x5c, 0x4a, 16),
    },
    Theme {
        id: ThemeId::Slate,
        label: "Slate",
        bg: Color32::from_rgb(0x2b, 0x30, 0x38),
        fg: Color32::from_rgb(0xe4, 0xe6, 0xe9), // approximated
        accent: Color32::from_rgb(0x7e, 0xb8, 0xda),
        chapter: Color32::from_rgb(0xa8, 0xcc, 0xe8),
        section: Color32::from_rgb(0x8e, 0xd4, 0xb8),
        emphasis: Color32::from_rgb(0xd4, 0xa8, 0xe0),
        notes: Color32::from_rgb(0xc9, 0xa8, 0x6c), // approximated
        notes_bg: Color32::from_rgba_premultiplied(0xc9, 0xa8, 0x6c, 24),
        spell_error: Color32::from_rgb(0xe0, 0x6c, 0x6c),
        invisibles: Color32::from_rgba_premultiplied(0xe4, 0xe6, 0xe9, 110),
        selection: Color32::from_rgba_premultiplied(0x7e, 0xb8, 0xda, 70),
        style_bg: Color32::from_rgba_premultiplied(0x8e, 0xd4, 0xb8, 20),
    },
];

pub fn get(id: ThemeId) -> &'static Theme {
    THEMES.iter().find(|t| t.id == id).unwrap_or(&THEMES[0])
}
