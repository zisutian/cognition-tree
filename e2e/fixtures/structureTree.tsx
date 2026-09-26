// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, CompactProvider } from "compact-ui";
import "compact-ui/styles.css";
import { uiConfig } from "../../presentation/ui/foundation/config.ts";
import { StructureTree, type StructureTreeNode } from "../../presentation/ui/shared/tree/index.ts";

function node(id: string, lineNumber: number, children: StructureTreeNode[] = []): StructureTreeNode {
  return {
    children,
    hasDiagnostics: false,
    id,
    label: "组分",
    lineLabel: `L${lineNumber}`,
    lineNumber,
    textDisplay: {
      displayText: id,
      segments: [{ id, kind: "text", text: id }],
      textColor: "default",
    },
  };
}

function StructureTreeFixture() {
  const [documentId, setDocumentId] = useState("first");
  const [showChild, setShowChild] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [largeCount, setLargeCount] = useState(0);
  const nodes = empty ? [] : largeCount > 0
    ? Array.from({ length: largeCount }, (_, index) => node(`long-${index}`, index + 1))
    : [node("parent", 1, showChild ? [node("child", 2, [node("grandchild", 3)])] : []), node(updated ? "sibling-updated" : "sibling", 4)];

  return (
    <CompactProvider config={uiConfig}>
      <main style={{ padding: 24 }}>
        <Button onClick={() => setSelected(3)}>外部选择孙节点</Button>
        <Button onClick={() => setSelected(4)}>外部选择旁支</Button>
        <Button onClick={() => setShowChild(false)}>删除子节点</Button>
        <Button onClick={() => setDocumentId((id) => id === "first" ? "second" : "first")}>切换文档</Button>
        <Button onClick={() => setDragging((value) => !value)}>切换拖动</Button>
        <Button onClick={() => setUpdated((value) => !value)}>更新同一文档</Button>
        <Button onClick={() => setEmpty(true)}>清空结构</Button>
        <Button onClick={() => setLargeCount(500)}>显示500行</Button>
        <Button onClick={() => setLargeCount(501)}>显示501行</Button>
        <output data-document={documentId} data-selected={selected ?? ""} id="tree-state">树状态</output>
        <StructureTree
          ariaLabel="测试结构树"
          keepMountedLineNumbers={dragging ? new Set([3]) : undefined}
          nodes={nodes}
          onSelectLine={setSelected}
          selectedLineNumbers={selected === null ? undefined : new Set([selected])}
          selectedRootLineNumber={selected}
          stateKey={documentId}
        />
      </main>
    </CompactProvider>
  );
}

createRoot(document.getElementById("root")!).render(<StructureTreeFixture />);
