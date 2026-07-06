import { ChevronRight } from "lucide-react";
import type { UiSyntaxProfileDraftBuildResult } from "../../../application/workspace/projection/viewSyntax";
import {
  UiButton,
  UiList,
  UiListRow,
  UiMetrics,
  UiPanel,
  UiPanelBody,
  UiPanelHeader,
  UiSection,
  UiSectionTitle,
  UiStatus,
} from "../../shared/primitives";

type SyntaxProfileFeedback = {
  message: string;
  status: "error" | "success";
};

type SyntaxProfileDetailPanelProps = {
  draftResult: UiSyntaxProfileDraftBuildResult;
  feedback: SyntaxProfileFeedback | null;
  onCollapseDetail?: () => void;
  stats: {
    inlineRuleCount: number;
    lineRuleCount: number;
  };
};

export function SyntaxProfileDetailPanel({
  draftResult,
  feedback,
  onCollapseDetail,
  stats,
}: SyntaxProfileDetailPanelProps) {
  const draftProfile = draftResult.profile;
  const diagnostics = draftResult.diagnostics;

  return (
    <UiPanel as="aside" aria-label="语法状态" variant="detail">
      <UiPanelHeader
        leadingActions={
          onCollapseDetail ? (
            <UiButton
              aria-label="收回右侧栏"
              className="detail-header-collapse-button"
              onClick={onCollapseDetail}
              title="收回右侧栏"
              type="button"
              variant="icon"
            >
              <ChevronRight aria-hidden="true" size={15} strokeWidth={2} />
            </UiButton>
          ) : null
        }
        title="语法"
      />

      <UiPanelBody>
        <UiMetrics
          aria-label="语法统计"
          items={[
            { label: "块规则", value: stats.lineRuleCount },
            { label: "行内规则", value: stats.inlineRuleCount },
            { label: "问题", value: diagnostics.length },
          ]}
        />

        {feedback ? (
          <UiStatus tone={feedback.status}>
            <p>{feedback.message}</p>
          </UiStatus>
        ) : null}

        <UiSection>
          <UiSectionTitle>当前配置</UiSectionTitle>
          {draftProfile ? (
            <UiList as="dl" variant="definition">
              <UiListRow as="div">
                <dt>名称</dt>
                <dd>{draftProfile.name}</dd>
              </UiListRow>
              <UiListRow as="div">
                <dt>缩进宽度</dt>
                <dd>{draftProfile.tabDisplayWidth}</dd>
              </UiListRow>
            </UiList>
          ) : (
            <p className="ui-muted">当前配置无效</p>
          )}
        </UiSection>

        {diagnostics.length > 0 ? (
          <UiSection>
            <UiSectionTitle>配置问题</UiSectionTitle>
            <UiList variant="diagnostic" scroll>
              {diagnostics.map((diagnostic, index) => (
                <UiListRow key={`${diagnostic.path}-${index}`}>
                  <span>{diagnostic.path}</span>
                  <p>{diagnostic.message}</p>
                </UiListRow>
              ))}
            </UiList>
          </UiSection>
        ) : null}
      </UiPanelBody>
    </UiPanel>
  );
}
