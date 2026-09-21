import React from "react";
import ReactDOM from "react-dom/client";
import { AppRoot } from "./AppRoot.tsx";
import { CompactProvider } from "compact-ui";
import "compact-ui/styles.css";
import { uiConfig } from "../ui/index.ts";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

root.render(
  <React.StrictMode>
    <CompactProvider config={uiConfig} fill>
      <AppRoot />
    </CompactProvider>
  </React.StrictMode>,
);
