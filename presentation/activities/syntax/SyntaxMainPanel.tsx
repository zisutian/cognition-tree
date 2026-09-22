import { Stack as SectionStack } from "compact-ui";
import {
  Button,
  FormActions,
  EmptyState,
  FieldRow,
  FormLayout,
  InputControl,
  Section,
} from "compact-ui";
import { Plus } from "lucide-react";
import { SyntaxRuleHeader } from "./SyntaxRuleLayout.tsx";
import { useEffect, useRef } from "react";
import {
  isAvailableSyntaxViewModel,
  syntaxFieldIds,
  type SyntaxViewModel,
} from "../../../application/syntax/index.ts";

import { Page, PageBody } from "../../ui/index.ts";

import { BlockRuleRows, TitleAndRootRows } from "./SyntaxBlockRuleRows.tsx";
import { InlineRuleRows } from "./SyntaxInlineRuleRows.tsx";

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
        <SectionStack>
          <FormLayout>
            <FieldRow label="缩进宽度">
              {(accessibility) => (
                <InputControl
                  {...accessibility}
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
              )}
            </FieldRow>
          </FormLayout>
          <div
            data-syntax-field-id={syntaxFieldIds.blockRuleGroup}
            tabIndex={-1}
          >
            <Section
              title="块规则"
              actions={
                <Button
                  disabled={!syntax.canMutate}
                  onClick={syntax.actions.addBlock}
                >
                  <Plus aria-hidden="true" />
                  新增块规则
                </Button>
              }
            >
              <SyntaxRuleHeader />
              <TitleAndRootRows syntax={syntax} />
              <BlockRuleRows syntax={syntax} />
            </Section>
          </div>
          <div
            data-syntax-field-id={syntaxFieldIds.inlineRuleGroup}
            tabIndex={-1}
          >
            <Section
              title="行内规则"
              actions={
                <FormActions>
                  <Button
                    disabled={!syntax.canMutate}
                    onClick={() => syntax.actions.addInline("paired")}
                  >
                    <Plus aria-hidden="true" />
                    成对符号
                  </Button>
                  <Button
                    disabled={!syntax.canMutate}
                    onClick={() => syntax.actions.addInline("single")}
                  >
                    <Plus aria-hidden="true" />
                    单个符号
                  </Button>
                </FormActions>
              }
            >
              <SyntaxRuleHeader inline />
              <InlineRuleRows syntax={syntax} />
            </Section>
          </div>
        </SectionStack>
      </PageBody>
    </Page>
  );
}
