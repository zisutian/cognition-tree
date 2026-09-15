import { createContext } from "react";

export type ControlSizing = "container" | "content";

/** Fields fill their form column; toolbar controls use their content width. */
export const ControlSizingContext = createContext<ControlSizing>("content");
