//! Pure document/editing logic for Simple Author, with no GUI dependencies.
//! Ported 1:1 from the original TypeScript app's behavior (see the project's
//! rewrite plan for the full functional spec this crate is held to).

mod block_scan;
pub mod document;
pub mod export;
pub mod modes;
pub mod notes;
pub mod phonetics;
mod regex_cache;
pub mod scripture;
pub mod spellcheck;
pub mod suno;
pub mod templates;
pub mod thesaurus;
