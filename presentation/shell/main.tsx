import React from "react";
import ReactDOM from "react-dom/client";
import {
  clientStartupConfigurationPath,
  loadClientApiConfiguration,
} from "../../infrastructure/client/runtime/apiConfiguration";
import { AppRoot } from "./AppRoot";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

async function startClient() {
  try {
    const api = await loadClientApiConfiguration();

    root.render(
      <React.StrictMode>
        <AppRoot api={api} />
      </React.StrictMode>,
    );
  } catch {
    root.render(
      <main role="alert">
        <h1>启动配置不可用</h1>
        <p>
          请检查
          {" "}
          <code>{clientStartupConfigurationPath}</code>
          {" "}
          后重新加载页面。
        </p>
      </main>,
    );
  }
}

void startClient();
