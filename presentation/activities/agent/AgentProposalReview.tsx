// SPDX-License-Identifier: GPL-3.0-or-later

import { AlertTriangle, Copy } from "lucide-react";
import type { AgentProposalView } from "../../../application/agent";
import { Button } from "../../ui/shared/primitives";
import { useFeedback } from "../../ui/shared/FeedbackProvider";
import {
  ToolPropertyList,
  ToolPropertyRow,
  ToolSection,
  ToolSectionStack,
} from "../../ui/shared/ToolSurface";

type ReviewResource = AgentProposalView["review"]["resources"][number];

const actionLabels: Record<ReviewResource["actions"][number], string> = {
  "content-updated": "内容修改",
  created: "新建",
  deleted: "删除",
  moved: "移动",
  renamed: "重命名",
  "state-updated": "状态修改",
};

const technicalChangeLabels = {
  created: "新增",
  deleted: "删除",
  moved: "移动",
  "state-updated": "状态修改",
  updated: "更新",
} as const;

export function proposalStoreLabel(proposal: AgentProposalView) {
  if (proposal.store.domain === "workspace") {
    return proposal.review.storeLabel ?? "仓库不可用";
  }
  return proposal.store.domain === "journal" ? "日记" : "代办";
}

export function AgentProposalReview({
  proposal,
}: {
  proposal: AgentProposalView;
}) {
  const summary = summarizeResources(proposal.review.resources);

  return (
    <>
      <ToolSection title="变更摘要">
        <p>
          {summary.created > 0 ? `新建 ${summary.created} 项` : null}
          {summary.created > 0 && summary.updated > 0 ? "，" : null}
          {summary.updated > 0 ? `修改 ${summary.updated} 项` : null}
          {(summary.created > 0 || summary.updated > 0) && summary.deleted > 0
            ? "，"
            : null}
          {summary.deleted > 0 ? `删除 ${summary.deleted} 项` : null}
          {summary.created + summary.updated + summary.deleted === 0
            ? "没有可展示的资源变更"
            : null}
        </p>
        {proposal.destructive ? (
          <div className="agent-proposal-destructive-warning" role="alert">
            <AlertTriangle aria-hidden="true" size={16} />
            <div>
              <strong>这份 Proposal 包含删除</strong>
              <span>批准后仍需再次独立确认，才会执行写入。</span>
            </div>
          </div>
        ) : null}
      </ToolSection>
      <ToolSection title="逐项审查">
        {proposal.review.resources.length === 0 ? (
          <p className="agent-muted">没有可展示的资源变更。</p>
        ) : (
          <ol className="agent-review-resource-list">
            {proposal.review.resources.map((resource) => (
              <AgentProposalReviewResource
                key={resource.resourceId}
                resource={resource}
              />
            ))}
          </ol>
        )}
      </ToolSection>
      <AgentProposalTechnicalDetails proposal={proposal} />
    </>
  );
}

function AgentProposalReviewResource({
  resource,
}: {
  resource: ReviewResource;
}) {
  const current = resource.after ?? resource.before;
  const pathChanged = resource.before && resource.after &&
    resource.before.path !== resource.after.path;
  const blockSummary = formatBlockSummary(resource.blockSummary);

  return (
    <li className="agent-review-resource">
      <header>
        <strong>{current?.path ?? "无法识别的资源"}</strong>
        <span className="agent-review-actions">
          {resource.actions.map((action) => (
            <span key={action}>{actionLabels[action]}</span>
          ))}
        </span>
      </header>
      {pathChanged ? (
        <p className="agent-review-path-change">
          <span>{resource.before?.path}</span>
          <span aria-hidden="true">→</span>
          <span>{resource.after?.path}</span>
        </p>
      ) : null}
      {blockSummary ? (
        <p className="agent-review-block-summary">块变更：{blockSummary}</p>
      ) : null}
      {resource.diff.length === 0 ? (
        <p className="agent-muted">没有正文行变更。</p>
      ) : (
        <div className="agent-line-diff">
          {resource.diff.map((hunk, hunkIndex) => (
            <div className="agent-line-diff-hunk" key={hunkIndex}>
              {hunk.lines.map((line, lineIndex) => (
                <div
                  className={`agent-line-diff-row is-${line.kind}`}
                  key={`${line.beforeLineNumber}:${line.afterLineNumber}:${lineIndex}`}
                >
                  <span>{line.beforeLineNumber ?? ""}</span>
                  <span>{line.afterLineNumber ?? ""}</span>
                  <span aria-hidden="true">
                    {line.kind === "added"
                      ? "+"
                      : line.kind === "removed"
                        ? "−"
                        : " "}
                  </span>
                  <code>{line.text || " "}</code>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function AgentProposalTechnicalDetails({
  proposal,
}: {
  proposal: AgentProposalView;
}) {
  return (
    <ToolSection className="agent-proposal-technical">
      <details>
        <summary>技术详情</summary>
        <ToolSectionStack className="agent-proposal-technical-body">
          <ToolSection aria-label="Proposal 技术元数据">
            <ToolPropertyList aria-label="Proposal 技术元数据">
              <ToolPropertyRow
                label="Proposal ID"
                value={<TechnicalInlineValue value={proposal.id} />}
              />
              <ToolPropertyRow label="版本" value={proposal.version} />
              <ToolPropertyRow
                label="Base revision"
                value={<TechnicalInlineValue value={proposal.baseRevision} />}
              />
              <ToolPropertyRow
                label="Digest"
                value={<TechnicalInlineValue value={proposal.digest} />}
              />
              {proposal.store.domain === "workspace" ? (
                <ToolPropertyRow
                  label="Repository ID"
                  value={(
                    <TechnicalInlineValue value={proposal.store.repositoryId} />
                  )}
                />
              ) : null}
            </ToolPropertyList>
          </ToolSection>
          <ToolSection title="资源变更">
            {proposal.changes.resources.length === 0 ? (
              <p className="agent-muted">无</p>
            ) : (
              <ul className="agent-technical-change-list">
                {proposal.changes.resources.map((change, index) => (
                  <li key={`${change.resourceId}:${change.kind}:${index}`}>
                    <strong>{technicalChangeLabels[change.kind]}</strong>
                    <TechnicalInlineValue value={change.resourceId} />
                    {change.version ? (
                      <TechnicalInlineValue value={change.version} />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </ToolSection>
          <ToolSection title="块变更">
            {proposal.changes.blocks.length === 0 ? (
              <p className="agent-muted">无</p>
            ) : (
              <ul className="agent-technical-change-list">
                {proposal.changes.blocks.map((change, index) => (
                  <li key={`${change.blockId}:${change.kind}:${index}`}>
                    <strong>{technicalChangeLabels[change.kind]}</strong>
                    <TechnicalInlineValue value={change.blockId} />
                    <span>所属资源</span>
                    <TechnicalInlineValue value={change.resourceId} />
                  </li>
                ))}
              </ul>
            )}
          </ToolSection>
          <ToolSection title="字符级 diff">
            {proposal.diff.length === 0 ? (
              <p className="agent-muted">无</p>
            ) : (
              <ul className="agent-technical-diff-list">
                {proposal.diff.map((hunk, index) => (
                  <li key={`${hunk.resourceId}:${hunk.from}:${index}`}>
                    <header>
                      <TechnicalInlineValue value={hunk.resourceId} />
                      <span>{hunk.from}–{hunk.to}</span>
                    </header>
                    <pre>{hunk.insertedText || "（删除所选范围）"}</pre>
                  </li>
                ))}
              </ul>
            )}
          </ToolSection>
        </ToolSectionStack>
      </details>
    </ToolSection>
  );
}

function TechnicalInlineValue({ value }: { value: string }) {
  const feedback = useFeedback();

  return (
    <span className="agent-technical-value">
      <code>{shortTechnicalValue(value)}</code>
      <Button
        aria-label="复制完整值"
        onClick={() => void feedback.runAction(async () => {
          if (!navigator.clipboard) {
            throw new Error("当前浏览器不支持复制到剪贴板。");
          }
          await navigator.clipboard.writeText(value);
        })}
        title="复制完整值"
        type="button"
        variant="icon"
      >
        <Copy aria-hidden="true" size={12} />
      </Button>
    </span>
  );
}

function shortTechnicalValue(value: string) {
  const prefix = value.startsWith("sha256:") ? "sha256:" : "";
  const body = prefix ? value.slice(prefix.length) : value;

  return body.length <= 20
    ? value
    : `${prefix}${body.slice(0, 8)}…${body.slice(-8)}`;
}

function summarizeResources(resources: readonly ReviewResource[]) {
  return resources.reduce((summary, resource) => {
    if (resource.actions.includes("created")) summary.created += 1;
    else if (resource.actions.includes("deleted")) summary.deleted += 1;
    else summary.updated += 1;
    return summary;
  }, { created: 0, deleted: 0, updated: 0 });
}

function formatBlockSummary(summary: ReviewResource["blockSummary"]) {
  return [
    ["新增", summary.created],
    ["修改", summary.updated],
    ["移动", summary.moved],
    ["状态修改", summary.stateUpdated],
    ["删除", summary.deleted],
  ].filter(([, count]) => count !== 0)
    .map(([label, count]) => `${label} ${count}`)
    .join("，");
}
