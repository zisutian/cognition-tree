// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, CompactProvider, TreeDragScope } from "compact-ui";
import "compact-ui/styles.css";
import { uiConfig } from "../../presentation/ui/foundation/config.ts";
import { StructureTree, type StructureTreeNode } from "../../presentation/ui/shared/tree/index.ts";
import { ContentTreeLabelPreferenceProvider } from "../../presentation/ui/shared/tree/ContentTreeLabelPreference.tsx";

function node(id: string, lineNumber: number, children: StructureTreeNode[] = []): StructureTreeNode {
  return {
    children,
    diagnostics: [],
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
  const [selected, setSelected] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [largeCount, setLargeCount] = useState(0);
  const [moveCount, setMoveCount] = useState(0);
  const nodes = empty ? [] : largeCount > 0
    ? Array.from({ length: largeCount }, (_, index) => node(`long-${index}`, index + 1))
    : [node("parent", 1, showChild ? [node("child", 2, [node("grandchild", 3)])] : []), node(updated ? "sibling-updated" : "sibling", 4)];

  return (
    <CompactProvider config={uiConfig}>
      <ContentTreeLabelPreferenceProvider initialVisible onChange={() => undefined}>
      <main style={{ padding: 24 }}>
        <Button onClick={() => setSelected("grandchild")}>外部选择孙节点</Button>
        <Button onClick={() => setSelected(updated ? "sibling-updated" : "sibling")}>外部选择旁支</Button>
        <Button onClick={() => setShowChild(false)}>删除子节点</Button>
        <Button onClick={() => setDocumentId((id) => id === "first" ? "second" : "first")}>切换文档</Button>
        <Button onClick={() => {
          setUpdated((value) => !value);
          if (selected === "sibling") setSelected("sibling-updated");
          if (selected === "sibling-updated") setSelected("sibling");
        }}>更新同一文档</Button>
        <Button onClick={() => setEmpty(true)}>清空结构</Button>
        <Button onClick={() => setLargeCount(500)}>显示500行</Button>
        <Button onClick={() => setLargeCount(501)}>显示501行</Button>
        <output data-document={documentId} data-selected={selected ?? ""} id="tree-state">树状态</output>
        <output data-moves={moveCount} id="move-state">移动请求</output>
        <TreeDragScope onMoveRequest={() => { setMoveCount((count) => count + 1); return { status: "success" }; }}>
        <div data-testid="tree-scroll-host" style={{ height: 420, overflowY: "auto" }}>
        <StructureTree
          ariaLabel="测试结构树"
          dragDrop={{
            treeId: "fixture",
            contentKey: documentId,
            canDrag: () => true,
            canDrop: (request) => !request.source.nodeIds.includes( ("nodeId" in request.target ? request.target.nodeId : "")),
          }}
          nodes={nodes}
          onSelectionChange={(ids) => setSelected([...ids][0] ?? null)}
          selectedIds={new Set(selected ? [selected] : [])}
          selectionMode="single"
          stateKey={documentId}
        />
        </div>
        </TreeDragScope>
      </main>
      </ContentTreeLabelPreferenceProvider>
    </CompactProvider>
  );
}

createRoot(document.getElementById("root")!).render(<StructureTreeFixture />);
