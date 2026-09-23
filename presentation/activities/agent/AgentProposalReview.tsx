// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Stack as SectionStack,
  PropertyList as ToolPropertyList,
  PropertyRow as ToolPropertyRow,
} from "compact-ui";
import {
  Button,
  EmptyState,
  FormActions,
  List,
  ListRow,
  Section,
  Stack,
  StatusText,
} from "compact-ui";
import { createClassNames } from "../../ui/index.ts";
import agentStyles from "./agent.module.css";
const cx = createClassNames(agentStyles);

import { Copy } from "lucide-react";
import type {
  AgentProposalView,
} from "../../../application/agent/index.ts";
import { useFeedback } from "../../ui/index.ts";

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
      <Section title="变更摘要">
        <StatusText>
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
        </StatusText>
      </Section>
      <Section title="逐项审查">
        {proposal.review.resources.length === 0 ? (
          <EmptyState title="没有可展示的资源变更。" />
        ) : (
          <List aria-label="逐项资源变更">
            {proposal.review.resources.map((resource) => (
              <AgentProposalReviewResource
                key={resource.resourceId}
                resource={resource}
              />
            ))}
          </List>
        )}
      </Section>
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
  const pathChanged =
    resource.before &&
    resource.after &&
    resource.before.path !== resource.after.path;
  const blockSummary = formatBlockSummary(resource.blockSummary);

  return (
    <ListRow
      layout="detailed"
      title={current?.path ?? "无法识别的资源"}
      description={
        <Stack gap="tight">
          <FormActions>
            {resource.actions.map((action) => (
              <StatusText key={action}>{actionLabels[action]}</StatusText>
            ))}
          </FormActions>
          {pathChanged ? (
            <Stack direction="row" gap="tight" wrap>
              <span>{resource.before?.path}</span>
              <span aria-hidden="true">→</span>
              <span>{resource.after?.path}</span>
            </Stack>
          ) : null}
          {blockSummary ? (
            <StatusText>块变更：{blockSummary}</StatusText>
          ) : null}
          {resource.diff.length === 0 ? (
            <EmptyState title="没有正文行变更。" />
          ) : (
            <div className={cx("agent-line-diff")}>
              {resource.diff.map((hunk, hunkIndex) => (
                <div className={cx("agent-line-diff-hunk")} key={hunkIndex}>
                  {hunk.lines.map((line, lineIndex) => (
                    <div
                      className={cx(`agent-line-diff-row is-${line.kind}`)}
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
        </Stack>
      }
    />
  );
}

function AgentProposalTechnicalDetails({
  proposal,
}: {
  proposal: AgentProposalView;
}) {
  return (
    <Section>
      <details className={cx("agent-technical-details")}>
        <summary>技术详情</summary>
        <SectionStack>
          <Section>
            <section aria-label="Proposal 技术元数据">
              <ToolPropertyList>
                <ToolPropertyRow
                  label="Proposal ID"
                  children={<TechnicalInlineValue value={proposal.id} />}
                />
                <ToolPropertyRow label="版本" children={proposal.version} />
                <ToolPropertyRow
                  label="Base revision"
                  children={
                    <TechnicalInlineValue value={proposal.baseRevision} />
                  }
                />
                <ToolPropertyRow
                  label="Digest"
                  children={<TechnicalInlineValue value={proposal.digest} />}
                />
                {proposal.store.domain === "workspace" ? (
                  <ToolPropertyRow
                    label="Repository ID"
                    children={
                      <TechnicalInlineValue
                        value={proposal.store.repositoryId}
                      />
                    }
                  />
                ) : null}
              </ToolPropertyList>
            </section>
          </Section>
          <Section title="资源变更">
            {proposal.changes.resources.length === 0 ? (
              <EmptyState title="无" />
            ) : (
              <List aria-label="资源变更">
                {proposal.changes.resources.map((change, index) => (
                  <ListRow
                    key={`${change.resourceId}:${change.kind}:${index}`}
                    layout="detailed"
                    title={technicalChangeLabels[change.kind]}
                    description={
                      <Stack gap="tight">
                        <TechnicalInlineValue value={change.resourceId} />
                        {change.version ? (
                          <TechnicalInlineValue value={change.version} />
                        ) : null}
                      </Stack>
                    }
                  />
                ))}
              </List>
            )}
          </Section>
          <Section title="块变更">
            {proposal.changes.blocks.length === 0 ? (
              <EmptyState title="无" />
            ) : (
              <List aria-label="块变更">
                {proposal.changes.blocks.map((change, index) => (
                  <ListRow
                    key={`${change.blockId}:${change.kind}:${index}`}
                    layout="detailed"
                    title={technicalChangeLabels[change.kind]}
                    description={
                      <Stack gap="tight">
                        <TechnicalInlineValue value={change.blockId} />
                        <span>所属资源</span>
                        <TechnicalInlineValue value={change.resourceId} />
                      </Stack>
                    }
                  />
                ))}
              </List>
            )}
          </Section>
          <Section title="字符级 diff">
            {proposal.diff.length === 0 ? (
              <EmptyState title="无" />
            ) : (
              <List aria-label="字符级 diff">
                {proposal.diff.map((hunk, index) => (
                  <ListRow
                    key={`${hunk.resourceId}:${hunk.from}:${index}`}
                    layout="detailed"
                    title={
                      <Stack direction="row" wrap>
                        <TechnicalInlineValue value={hunk.resourceId} />
                        <span>
                          {hunk.from}–{hunk.to}
                        </span>
                      </Stack>
                    }
                    description={
                      <pre className={cx("agent-character-diff")}>
                        {hunk.insertedText || "（删除所选范围）"}
                      </pre>
                    }
                  />
                ))}
              </List>
            )}
          </Section>
        </SectionStack>
      </details>
    </Section>
  );
}

function TechnicalInlineValue({ value }: { value: string }) {
  const feedback = useFeedback();

  return (
    <Stack direction="row" align="center" gap="tight">
      <code>{shortTechnicalValue(value)}</code>
      <Button
        aria-label="复制完整值"
        onClick={() =>
          void feedback.runAction(async () => {
            if (!navigator.clipboard) {
              throw new Error("当前浏览器不支持复制到剪贴板。");
            }
            await navigator.clipboard.writeText(value);
          })
        }
        title="复制完整值"
        type="button"
        appearance="plain"
        iconOnly
      >
        <Copy aria-hidden="true" size={12} />
      </Button>
    </Stack>
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
  return resources.reduce(
    (summary, resource) => {
      if (resource.actions.includes("created")) summary.created += 1;
      else if (resource.actions.includes("deleted")) summary.deleted += 1;
      else summary.updated += 1;
      return summary;
    },
    { created: 0, deleted: 0, updated: 0 },
  );
}

function formatBlockSummary(summary: ReviewResource["blockSummary"]) {
  return [
    ["新增", summary.created],
    ["修改", summary.updated],
    ["移动", summary.moved],
    ["状态修改", summary.stateUpdated],
    ["删除", summary.deleted],
  ]
    .filter(([, count]) => count !== 0)
    .map(([label, count]) => `${label} ${count}`)
    .join("，");
}
