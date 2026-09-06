import { hoverTooltip } from "@codemirror/view";
import {
  getCtnEditorParsedDocument,
} from "./ctnDecorations.ts";
import type {
  CtnEditorAnalysisField,
} from "./ctnEditorAnalysis.ts";

export function createCtnDiagnosticTooltip(
  analysisField: CtnEditorAnalysisField,
) {
  return hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos);
    const parsedDocument = getCtnEditorParsedDocument(
      view,
      analysisField,
    );

    if (!parsedDocument) {
      return null;
    }

    const diagnostics = parsedDocument.diagnostics.filter(
      (diagnostic) => diagnostic.lineNumber === line.number,
    );

    if (diagnostics.length === 0) {
      return null;
    }

    return {
      above: true,
      end: line.to,
      pos: line.from,
      create() {
        const dom = document.createElement("div");
        dom.className = "ctn-diagnostic-tooltip";

        for (const diagnostic of diagnostics) {
          const item = document.createElement("div");
          item.className = "ctn-diagnostic-tooltip-item";
          item.textContent = `L${diagnostic.lineNumber}: ${diagnostic.message}`;
          dom.appendChild(item);
        }

        return { dom };
      },
    };
  });
}
