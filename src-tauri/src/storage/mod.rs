pub(crate) mod commands;
mod file_store;
mod models;
#[cfg(test)]
mod tests;

type StorageResult<T> = Result<T, Box<dyn std::error::Error>>;

pub use file_store::NoteFileStore;
