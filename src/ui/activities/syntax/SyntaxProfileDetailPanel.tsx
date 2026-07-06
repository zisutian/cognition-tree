import { getToneSwatchClass, getToneSwatchStyle } from "./TonePicker";
import type {
  UiSyntaxProfileDraftBuildResult,
  UiSyntaxTone,
} from "../../../application/workspace/projection/viewSyntax";
import {
  UiList,
  UiListRow,
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
};

function ToneSwatch({
  label,
  tone,
}: {
  label: string;
  tone: UiSyntaxTone;
}) {
  return (
    <span
      aria-label={`${label} ${tone}`}
      className={getToneSwatchClass(tone)}
      style={getToneSwatchStyle(tone)}
      title={`${label} ${tone}`}
    >
      <span />
    </span>
  );
}

export function SyntaxProfileDetailPanel({
  draftResult,
  feedback,
}: SyntaxProfileDetailPanelProps) {
  const draftProfile = draftResult.profile;
  const diagnostics = draftResult.diagnostics;

  return (
    <UiPanel as="aside" aria-label="语法状态" variant="detail">
      <UiPanelHeader stats={[`${diagnostics.length} 校验`]} title="语法" />

      <UiPanelBody>
        {feedback ? (
          <UiStatus tone={feedback.status}>
            <p>{feedback.message}</p>
          </UiStatus>
        ) : null}

        <UiSection>
          <UiSectionTitle>生成摘要</UiSectionTitle>
          {draftProfile ? (
            <UiList as="dl" variant="definition">
              <UiListRow as="div">
                <dt>名称</dt>
                <dd>{draftProfile.name}</dd>
              </UiListRow>
              <UiListRow as="div">
                <dt>Tab</dt>
                <dd>{draftProfile.tabDisplayWidth}</dd>
              </UiListRow>
              <UiListRow as="div">
                <dt>行首</dt>
                <dd>{draftProfile.markerRules.length + 2}</dd>
              </UiListRow>
              <UiListRow as="div">
                <dt>行内</dt>
                <dd>{draftProfile.inlineRules.length}</dd>
              </UiListRow>
            </UiList>
          ) : (
            <p className="ui-muted">无有效 profile</p>
          )}
        </UiSection>

        <UiSection>
          <UiSectionTitle>行首规则</UiSectionTitle>
          {draftProfile ? (
            <UiList as="div" variant="cards">
              <UiListRow as="div" className="syntax-marker-row">
                <code>首行</code>
                <ToneSwatch label="背景" tone={draftProfile.titleRule.tone} />
                <ToneSwatch
                  label="字体"
                  tone={draftProfile.titleRule.textColor}
                />
                <span className="syntax-marker-label">
                  {draftProfile.titleRule.label}
                </span>
              </UiListRow>
              <UiListRow as="div" className="syntax-marker-row">
                <code>顶格</code>
                <ToneSwatch label="背景" tone={draftProfile.conceptRule.tone} />
                <ToneSwatch
                  label="字体"
                  tone={draftProfile.conceptRule.textColor}
                />
                <span className="syntax-marker-label">
                  {draftProfile.conceptRule.label}
                </span>
              </UiListRow>
              {draftProfile.markerRules.map((rule) => (
                <UiListRow
                  as="div"
                  className="syntax-marker-row"
                  key={rule.marker}
                >
                  <code>{rule.marker}</code>
                  <ToneSwatch label="背景" tone={rule.tone} />
                  <ToneSwatch label="字体" tone={rule.textColor} />
                  <span className="syntax-marker-label">{rule.label}</span>
                </UiListRow>
              ))}
            </UiList>
          ) : null}
        </UiSection>

        <UiSection>
          <UiSectionTitle>行内规则</UiSectionTitle>
          {draftProfile ? (
            <UiList as="div" variant="cards">
              {draftProfile.inlineRules.map((rule) => (
                <UiListRow
                  as="div"
                  className="syntax-marker-row"
                  key={
                    rule.kind === "paired"
                      ? `${rule.kind}-${rule.open}-${rule.close}`
                      : `${rule.kind}-${rule.marker}`
                  }
                >
                  <code>
                    {rule.kind === "paired"
                      ? `${rule.open}…${rule.close}`
                      : rule.marker}
                  </code>
                  <ToneSwatch label="背景" tone={rule.tone} />
                  <ToneSwatch label="字体" tone={rule.textColor} />
                  <span className="syntax-marker-label">{rule.label}</span>
                </UiListRow>
              ))}
            </UiList>
          ) : null}
        </UiSection>

        {diagnostics.length > 0 ? (
          <UiSection>
            <UiSectionTitle>校验问题</UiSectionTitle>
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
