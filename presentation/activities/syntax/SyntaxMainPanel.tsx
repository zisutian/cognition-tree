import { Stack as SectionStack } from "compact-ui";
import { Button, EmptyState, InputControl, Section } from "compact-ui";
import { RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  isAvailableSyntaxViewModel,
  syntaxFieldIds,
  type SyntaxViewModel,
} from "../../../application/syntax/index.ts";
import { createClassNames } from "../../ui/index.ts";
import syntaxStyles from "./syntax.module.css";
const cx = createClassNames(syntaxStyles);

import { Page, PageBody } from "../../ui/index.ts";

import { BlockRuleRows, TitleAndRootRows } from "./SyntaxBlockRuleRows.tsx";
import { InlineRuleRows } from "./SyntaxInlineRuleRows.tsx";
import { SyntaxRuleHeader } from "./SyntaxRuleLayout.tsx";

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
      <Page aria-label="语法配置">
        <EmptyState title="语法配置暂不可用" />
      </Page>
    );
  }

  return (
    <Page
      aria-label="语法配置"
      data-syntax-field-id={syntaxFieldIds.viewRoot}
      tabIndex={-1}
    >
      <PageBody>
        {syntax.hasDraftErrors ? (
          <div className={cx("syntax-invalid-draft")} role="alert">
            <span>语法包含无效更改</span>
            <Button
              onClick={syntax.revertInvalidChanges}
              type="button"
              variant="normal"
            >
              <RotateCcw aria-hidden="true" size={13} />
              撤销无效更改
            </Button>
          </div>
        ) : null}
        <SectionStack>
          <Section title="基础">
            <label className={cx("syntax-setting-line")}>
              <span className={cx("syntax-setting-label")}>缩进宽度</span>
              <InputControl
                disabled={!syntax.canMutate}
                aria-label="缩进宽度"
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
          </Section>
          <div
            data-syntax-field-id={syntaxFieldIds.blockRuleGroup}
            tabIndex={-1}
          >
            <Section title="块规则">
              <SyntaxRuleHeader kind="block" />
              <TitleAndRootRows syntax={syntax} />
              <BlockRuleRows syntax={syntax} />
            </Section>
          </div>
          <div
            data-syntax-field-id={syntaxFieldIds.inlineRuleGroup}
            tabIndex={-1}
          >
            <Section title="行内规则">
              <SyntaxRuleHeader kind="inline" />
              <InlineRuleRows syntax={syntax} />
            </Section>
          </div>
        </SectionStack>
      </PageBody>
    </Page>
  );
}
