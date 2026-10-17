mod app;
mod file_ops;

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default().with_inner_size([1280.0, 860.0]).with_min_inner_size([900.0, 600.0]),
        ..Default::default()
    };

    eframe::run_native(
        "Simple Author",
        options,
        Box::new(|_cc| Ok(Box::new(app::EditorApp::default()))),
    )
}
