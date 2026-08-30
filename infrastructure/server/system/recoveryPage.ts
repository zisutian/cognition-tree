// SPDX-License-Identifier: GPL-3.0-or-later

export const recoveryPageHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>认知树恢复设置</title>
  <link rel="stylesheet" href="/recovery.css">
  <script src="/recovery.js" defer></script>
</head>
<body>
  <main>
    <p class="eyebrow">Cognition Tree · Recovery</p>
    <h1>恢复服务设置</h1>
    <p class="description">内容和智能体尚未加载。请选择继续使用的数据根；留空会恢复为项目内的 <code>.cognition-tree</code>。</p>
    <form id="recovery">
      <label for="dataRoot">数据根</label>
      <input id="dataRoot" name="dataRoot" autocomplete="off" placeholder="留空使用项目默认位置">
      <button type="submit">保存并重启</button>
    </form>
    <p id="result" class="status" role="status" aria-live="polite"></p>
  </main>
</body>
</html>`;

export const recoveryPageScript = `
const form = document.querySelector("#recovery");
const input = document.querySelector("#dataRoot");
const result = document.querySelector("#result");
const submit = form.querySelector("button[type=submit]");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submit.disabled = true;
  result.dataset.kind = "pending";
  result.textContent = "正在保存……";
  const dataRoot = input.value.trim();

  try {
    const response = await fetch("/api/v3/recovery/system-configuration", {
      body: JSON.stringify({ dataRoot: dataRoot || null }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.toLowerCase().startsWith("application/json")
      ? await response.json()
      : null;

    if (!response.ok) {
      result.dataset.kind = "error";
      result.textContent = body && typeof body.message === "string"
        ? body.message
        : "恢复失败";
      submit.disabled = false;
      return;
    }
    result.dataset.kind = "success";
    result.textContent = "设置已保存，服务正在重启……";
  } catch {
    result.dataset.kind = "error";
    result.textContent = "无法连接恢复服务，请重试。";
    submit.disabled = false;
  }
});`;

export const recoveryPageStylesheet = `
:root {
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  background: #0b0f17;
  color: #e7ecf4;
}

* {
  box-sizing: border-box;
}

body {
  min-height: 100vh;
  margin: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: radial-gradient(circle at top, #172033 0, #0b0f17 58%);
}

main {
  width: min(100%, 560px);
  padding: 30px;
  border-radius: 18px;
  background: #111827;
  box-shadow: 0 24px 70px rgb(0 0 0 / 35%);
}

.eyebrow {
  margin: 0 0 8px;
  color: #8fa6c9;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.2;
}

.description {
  margin: 14px 0 24px;
  color: #aebbd0;
  line-height: 1.65;
}

code {
  color: #c9d8ef;
}

form {
  display: grid;
  gap: 10px;
}

label {
  color: #c9d3e3;
  font-size: 13px;
  font-weight: 650;
}

input,
button {
  min-height: 42px;
  border: 0;
  border-radius: 10px;
  font: inherit;
}

input {
  width: 100%;
  padding: 0 13px;
  background: #1d2738;
  color: #f3f6fb;
  outline: none;
}

input:focus {
  background: #25334a;
}

button {
  margin-top: 4px;
  padding: 0 18px;
  background: #d7e5ff;
  color: #111827;
  cursor: pointer;
  font-weight: 750;
}

button:hover:not(:disabled) {
  background: #eef4ff;
}

button:disabled {
  cursor: wait;
  opacity: .58;
}

.status {
  min-height: 22px;
  margin: 18px 0 0;
  color: #aebbd0;
  font-size: 14px;
}

.status[data-kind="error"] {
  color: #ffaaa5;
}

.status[data-kind="success"] {
  color: #9ce0b3;
}
`;
