import {
  isAvailableSyntaxViewModel,
  type SyntaxViewModel,
} from "../../../application/syntax/syntaxViewModel";
import { RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { syntaxFieldIds } from "../../../application/syntax/syntaxProjection";
import {
  Button,
  EmptyState,
} from "../../ui/shared/primitives";
import { InputControl } from "../../ui/shared/controls";
import {
  ToolPanel,
  ToolPanelBody,
  ToolSection,
  ToolSectionStack,
} from "../../ui/shared/ToolSurface";
import {
  BlockRuleRows,
  TitleAndRootRows,
} from "./SyntaxBlockRuleRows";
import { InlineRuleRows } from "./SyntaxInlineRuleRows";
import {
  SyntaxRuleHeader,
} from "./SyntaxRuleLayout";

export function SyntaxMainPanel({ view }: { view: SyntaxViewModel }) {
  const syntax = view;
  const consumedFocusRequestIdRef = useRef<number | null>(null);

  useEffect(() => {
    const fieldId = syntax.focusTarget?.fieldId;

    if (
      !fieldId ||
      consumedFocusRequestIdRef.current === syntax.focusTarget?.requestId
    ) {
      return;
    }

    const fields = document.querySelectorAll<HTMLElement>(
      "[data-syntax-field-id]",
    );
    const field = [...fields].find(
      (candidate) => candidate.dataset.syntaxFieldId === fieldId,
    );
    const fallback = [...fields].find(
      (candidate) =>
        candidate.dataset.syntaxFieldId === syntaxFieldIds.viewRoot,
    );
    const target = field ?? fallback;

    if (!target || !syntax.focusTarget) {
      return;
    }

    target.scrollIntoView({ block: "nearest" });
    target.focus({ preventScroll: true });
    consumedFocusRequestIdRef.current = syntax.focusTarget.requestId;
    syntax.onConsumeFocusTarget(syntax.focusTarget.requestId);
  }, [syntax.focusTarget?.requestId, syntax.onConsumeFocusTarget]);

  if (!isAvailableSyntaxViewModel(syntax)) {
    return (
      <ToolPanel
        aria-label="语法配置"
        className="syntax-panel"
        title="语法配置"
      >
        <EmptyState
          description="请等待对应仓库就绪，或在左侧选择其他语法配置。"
          title="语法配置暂不可用"
        />
      </ToolPanel>
    );
  }

  return (
    <ToolPanel
      className="syntax-panel"
      aria-label="语法配置"
      data-syntax-field-id={syntaxFieldIds.viewRoot}
      tabIndex={-1}
      title={syntax.draft.name || "未命名语法"}
    >
      <ToolPanelBody layout="table">
        {syntax.hasDraftErrors ? (
          <div className="syntax-invalid-draft" role="alert">
            <span>当前更改无效；修复或撤销前不能离开此配置。</span>
            <Button
              onClick={syntax.revertInvalidChanges}
              type="button"
              variant="secondary"
            >
              <RotateCcw aria-hidden="true" size={13} />
              撤销无效更改
            </Button>
          </div>
        ) : null}
        <ToolSectionStack
          aria-label="语法设置"
          className="syntax-rule-sections"
        >
          <ToolSection title="基础">
            <label className="syntax-setting-line">
              <span className="syntax-setting-label">缩进宽度</span>
              <InputControl
                aria-label="缩进宽度"
                className="syntax-number-control"
                data-syntax-field-id={syntaxFieldIds.tabDisplayWidth}
                inputMode="numeric"
                max={syntax.constraints.tabDisplayWidth.max}
                min={syntax.constraints.tabDisplayWidth.min}
                step={1}
                type="number"
                value={syntax.draft.tabDisplayWidth}
                onChange={(event) =>
                  syntax.actions.updateTabDisplayWidth(event.target.value)
                }
              />
            </label>
          </ToolSection>
          <ToolSection
            data-syntax-field-id={syntaxFieldIds.blockRuleGroup}
            tabIndex={-1}
            title="块规则"
          >
            <SyntaxRuleHeader kind="block" />
            <TitleAndRootRows syntax={syntax} />
            <BlockRuleRows syntax={syntax} />
          </ToolSection>
          <ToolSection
            data-syntax-field-id={syntaxFieldIds.inlineRuleGroup}
            tabIndex={-1}
            title="行内规则"
          >
            <SyntaxRuleHeader kind="inline" />
            <InlineRuleRows syntax={syntax} />
          </ToolSection>
        </ToolSectionStack>
      </ToolPanelBody>
    </ToolPanel>
  );
}
