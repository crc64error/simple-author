//! Smoke tests against the actual bundled dictionary/thesaurus data files
//! (not synthetic fixtures) — catches format-assumption drift early, before
//! the GUI layer ever loads them for real.

use std::path::PathBuf;

fn asset(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/dicts").join(name)
}

#[test]
fn cmudict_loads_and_produces_sane_syllable_counts() {
    let text = std::fs::read_to_string(asset("cmudict.dict")).expect("cmudict.dict present");
    let phonetics = simple_writer_core::phonetics::Phonetics::load(&text);

    assert!(phonetics.is_known("cat"));
    assert!(phonetics.is_known("butterfly"));
    assert_eq!(phonetics.syllable_count("cat"), 1);
    assert_eq!(phonetics.syllable_count("butterfly"), 3);

    // Out-of-dictionary word still gets a sane (non-zero) heuristic count.
    assert!(phonetics.syllable_count("zzqxnotaword") >= 1);

    let rhymes = phonetics.lookup_rhymes("cat", |_| true, 14).expect("cat has rhymes");
    assert!(!rhymes.perfect.is_empty());
}

#[test]
fn thesaurus_loads_and_finds_synonyms() {
    let raw = std::fs::read_to_string(asset("th_en_US_v2.dat")).expect("th_en_US_v2.dat present");
    let thesaurus = simple_writer_core::thesaurus::Thesaurus::load(raw);

    let result = thesaurus.lookup("happy").expect("happy has synonyms");
    assert_eq!(result.headword.to_ascii_lowercase(), "happy");
    assert!(result.groups.iter().any(|g| !g.words.is_empty()));

    // Inflection-stemmer fallback: "running" isn't a headword itself.
    assert!(thesaurus.lookup("running").is_some());
}

#[test]
fn spellcheck_loads_real_en_and_pt_dictionaries() {
    use simple_writer_core::spellcheck::Spellchecker;

    let aff = std::fs::read_to_string(asset("en.aff")).expect("en.aff present");
    let dic = std::fs::read_to_string(asset("en.dic")).expect("en.dic present");
    let pt_dic = std::fs::read_to_string(asset("pt.dic")).expect("pt.dic present");

    let english = Spellchecker::load_english(&aff, &dic).expect("en dictionary builds");
    let sc = Spellchecker::new(Some(english), &pt_dic);

    assert!(sc.is_valid_word("hello"));
    assert!(sc.is_valid_word("spelling"));
    assert!(!sc.is_valid_word("zzqxnotaword"));

    let suggestions = sc.suggestions("speling", 6);
    assert!(!suggestions.is_empty(), "expected at least one suggestion for a typo");
}
