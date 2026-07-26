export type CtnEditorContentMode =
  | { kind: "body"; title: string }
  | { kind: "document" }
  | { kind: "raw" };

export type CtnEditorParsedContentMode = Exclude<
  CtnEditorContentMode,
  { kind: "raw" }
>;
