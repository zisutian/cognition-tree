import { createContext } from "react";

export type PageLayout =
  | "document"
  | "canvas"
  | "form"
  | "results"
  | "table"
  | "detail"
  | "conversation";

/** The composition root chooses the template once for the entire region. */
export const PageLayoutContext = createContext<PageLayout | null>(null);
