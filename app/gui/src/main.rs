// Phase 1 scaffold: confirms eframe/egui actually builds and runs on this
// machine before any decoration/editing work lands on top of it. The real
// app (tabs, menu, editor, themes) is built out in later phases — see the
// rewrite plan for the full roadmap.

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default().with_inner_size([1280.0, 860.0]),
        ..Default::default()
    };

    eframe::run_native(
        "Simple Author",
        options,
        Box::new(|_cc| Ok(Box::new(ScaffoldApp::default()))),
    )
}

#[derive(Default)]
struct ScaffoldApp {
    draft: String,
}

impl eframe::App for ScaffoldApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.heading("Simple Author — Rust scaffold");
            ui.label("Phase 1 placeholder: confirms eframe/egui runs. Real editor lands in phase 3.");
            ui.separator();

            let word_count = simple_writer_core::document::count_words_no_notes(&self.draft);
            ui.label(format!("Word count (core crate, live): {word_count}"));
            ui.add_sized(
                [ui.available_width(), ui.available_height()],
                egui::TextEdit::multiline(&mut self.draft).hint_text("Type here to sanity-check the core word-count wiring..."),
            );
        });
    }
}
