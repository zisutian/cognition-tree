// SPDX-License-Identifier: GPL-3.0-or-later

import {
  configurableSyntaxTones,
  isConfigurableSyntaxTone,
} from "./tones.ts";
import type {
  CtnInlineRule,
  CtnRuleRole,
  CtnSyntaxProfile,
} from "./types.ts";

export const syntaxProfileSchema = {
  label: {
    maxLength: 32,
    minLength: 1,
  },
  profileName: {
    maxLength: 64,
    minLength: 1,
  },
  requiredTypes: {
    body: "body",
    concept: "concept",
    globalReference: "global-reference",
    title: "title",
    todoItem: "todo-item",
  },
  roles: ["normal", "multiline"] as const satisfies readonly CtnRuleRole[],
  semanticId: {
    maxLength: 64,
    pattern: /^[a-z][a-z0-9-]*$/,
  },
  tabDisplayWidth: {
    max: 16,
    min: 1,
  },
  token: {
    maxLength: 12,
    minLength: 1,
  },
  tones: configurableSyntaxTones,
} as const;

export type CtnSyntaxProfileValidationPolicy =
  | { scope: "workspace" }
  | { scope: "journal" }
  | { scope: "todo" };

export const syntaxProfileValidationPolicies = {
  journal: { scope: "journal" },
  todo: { scope: "todo" },
  workspace: { scope: "workspace" },
} as const satisfies Record<
  CtnSyntaxProfileValidationPolicy["scope"],
  CtnSyntaxProfileValidationPolicy
>;

export type SyntaxProfileSchemaDiagnosticCode =
  | "duplicate-inline-trigger"
  | "duplicate-marker"
  | "duplicate-semantic-id"
  | "forbidden-rule"
  | "invalid-fixed-type"
  | "invalid-role"
  | "invalid-semantic-id"
  | "invalid-tab-display-width"
  | "invalid-tone"
  | "missing-marker-rule"
  | "missing-required-rule"
  | "required"
  | "reserved-semantic-id"
  | "too-long";

export type SyntaxProfileSchemaDiagnostic = {
  code: SyntaxProfileSchemaDiagnosticCode;
  message: string;
  path: string;
};

function createDiagnostic(
  code: SyntaxProfileSchemaDiagnosticCode,
  path: string,
  message: string,
): SyntaxProfileSchemaDiagnostic {
  return { code, message, path };
}

function validateText(
  value: string,
  path: string,
  label: string,
  maxLength: number,
): SyntaxProfileSchemaDiagnostic[] {
  if (!value) {
    return [createDiagnostic("required", path, `${label}不能为空。`)];
  }

  return value.length > maxLength
    ? [
        createDiagnostic(
          "too-long",
          path,
          `${label}不能超过 ${maxLength} 个字符。`,
        ),
      ]
    : [];
}

function validateSemanticId(
  value: string,
  path: string,
  label: string,
): SyntaxProfileSchemaDiagnostic[] {
  const diagnostics = validateText(
    value,
    path,
    label,
    syntaxProfileSchema.semanticId.maxLength,
  );

  if (
    value &&
    value.length <= syntaxProfileSchema.semanticId.maxLength &&
    !syntaxProfileSchema.semanticId.pattern.test(value)
  ) {
    diagnostics.push(
      createDiagnostic(
        "invalid-semantic-id",
        path,
        `${label}必须是 ASCII kebab-case，例如 definition 或 claim-source。`,
      ),
    );
  }

  return diagnostics;
}

function isValidSemanticId(value: string) {
  return (
    value.length <= syntaxProfileSchema.semanticId.maxLength &&
    syntaxProfileSchema.semanticId.pattern.test(value)
  );
}

function validateTone(
  value: string,
  path: string,
  allowDefault = false,
): SyntaxProfileSchemaDiagnostic[] {
  return (allowDefault && value === "default") ||
    isConfigurableSyntaxTone(value)
    ? []
    : [
        createDiagnostic(
          "invalid-tone",
          path,
          "颜色必须是预设颜色或 #RRGGBB。",
        ),
      ];
}

export function validateSyntaxProfileName(value: string) {
  return validateText(
    value,
    "$.name",
    "语法名称",
    syntaxProfileSchema.profileName.maxLength,
  );
}

export function validateSyntaxTabDisplayWidth(value: number) {
  return !Number.isInteger(value) ||
    value < syntaxProfileSchema.tabDisplayWidth.min ||
    value > syntaxProfileSchema.tabDisplayWidth.max
    ? [
        createDiagnostic(
          "invalid-tab-display-width",
          "$.tabDisplayWidth",
          `Tab 显示宽度必须是 ${syntaxProfileSchema.tabDisplayWidth.min} 到 ${syntaxProfileSchema.tabDisplayWidth.max} 之间的整数。`,
        ),
      ]
    : [];
}

function getInlineTrigger(rule: CtnInlineRule) {
  return rule.kind === "paired" ? rule.open : rule.marker;
}

export function normalizeSyntaxTabDisplayWidthInput(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return String(
    Math.min(
      syntaxProfileSchema.tabDisplayWidth.max,
      Math.max(
        syntaxProfileSchema.tabDisplayWidth.min,
        Number.parseInt(digits, 10),
      ),
    ),
  );
}

export function validateSyntaxProfile(
  profile: CtnSyntaxProfile,
  policy: CtnSyntaxProfileValidationPolicy =
    syntaxProfileValidationPolicies.workspace,
): SyntaxProfileSchemaDiagnostic[] {
  const diagnostics: SyntaxProfileSchemaDiagnostic[] = [];
  const semanticIds = new Map<string, string>();
  const markers = new Map<string, string>();
  const inlineTriggers = new Map<string, string>();
  const reservedTypes = new Set<string>([
    syntaxProfileSchema.requiredTypes.title,
    syntaxProfileSchema.requiredTypes.concept,
    syntaxProfileSchema.requiredTypes.body,
    syntaxProfileSchema.requiredTypes.globalReference,
    syntaxProfileSchema.requiredTypes.todoItem,
  ]);

  const registerSemanticId = (type: string, path: string) => {
    if (!isValidSemanticId(type)) {
      return;
    }

    const previousPath = semanticIds.get(type);

    if (previousPath) {
      diagnostics.push(
        createDiagnostic(
          "duplicate-semantic-id",
          path,
          `语义 ID ${type} 已在 ${previousPath} 使用。`,
        ),
      );
      return;
    }

    semanticIds.set(type, path);
  };

  diagnostics.push(
    ...validateSyntaxProfileName(profile.name),
    ...validateSyntaxTabDisplayWidth(profile.tabDisplayWidth),
  );

  diagnostics.push(
    ...validateText(
      profile.titleRule.label,
      "title.label",
      "首行标题名称",
      syntaxProfileSchema.label.maxLength,
    ),
    ...validateSemanticId(
      profile.titleRule.type,
      "title.type",
      "首行标题语义 ID",
    ),
    ...validateTone(profile.titleRule.textColor, "title.textColor"),
    ...validateTone(profile.titleRule.tone, "title.tone"),
  );

  if (profile.titleRule.type !== syntaxProfileSchema.requiredTypes.title) {
    diagnostics.push(
      createDiagnostic(
        "invalid-fixed-type",
        "title.type",
        `首行标题语义 ID 必须是 ${syntaxProfileSchema.requiredTypes.title}。`,
      ),
    );
  }

  registerSemanticId(profile.titleRule.type, "title.type");

  const topLevelUnmarkedConstraint = (() => {
    switch (policy.scope) {
      case "workspace":
        return {
          label: "顶格概念",
          path: "concept",
          type: syntaxProfileSchema.requiredTypes.concept,
        } as const;
      case "journal":
        return {
          label: "顶格正文",
          path: "body",
          type: syntaxProfileSchema.requiredTypes.body,
        } as const;
      case "todo":
        return null;
    }
  })();

  if (topLevelUnmarkedConstraint === null) {
    if (profile.topLevelUnmarkedRule !== null) {
      diagnostics.push(
        createDiagnostic(
          "forbidden-rule",
          "topLevelUnmarkedRule",
          "代办语法不允许无行首符号的正文规则。",
        ),
      );
    }
  } else if (profile.topLevelUnmarkedRule === null) {
    diagnostics.push(
      createDiagnostic(
        "missing-required-rule",
        topLevelUnmarkedConstraint.path,
        `缺少${topLevelUnmarkedConstraint.label}规则。`,
      ),
    );
  } else {
    const rule = profile.topLevelUnmarkedRule;
    const { label, path, type } = topLevelUnmarkedConstraint;

    diagnostics.push(
      ...validateText(
        rule.label,
        `${path}.label`,
        `${label}名称`,
        syntaxProfileSchema.label.maxLength,
      ),
      ...validateSemanticId(rule.type, `${path}.type`, `${label}语义 ID`),
      ...validateTone(
        rule.textColor,
        `${path}.textColor`,
        policy.scope === "journal",
      ),
      ...validateTone(rule.tone, `${path}.tone`, policy.scope === "journal"),
    );

    if (rule.type !== type) {
      diagnostics.push(
        createDiagnostic(
          "invalid-fixed-type",
          `${path}.type`,
          `${label}语义 ID 必须是 ${type}。`,
        ),
      );
    }

    registerSemanticId(rule.type, `${path}.type`);
  }

  profile.markerRules.forEach((rule, index) => {
    const path = `markers[${index}]`;

    diagnostics.push(
      ...validateText(
        rule.label,
        `${path}.label`,
        "行首名称",
        syntaxProfileSchema.label.maxLength,
      ),
      ...validateText(
        rule.marker,
        `${path}.marker`,
        "行首符号",
        syntaxProfileSchema.token.maxLength,
      ),
      ...validateSemanticId(rule.type, `${path}.type`, "行首语义 ID"),
      ...validateTone(rule.textColor, `${path}.textColor`),
      ...validateTone(
        rule.tone,
        `${path}.tone`,
        policy.scope === "todo" &&
          rule.type === syntaxProfileSchema.requiredTypes.todoItem,
      ),
    );

    if (!syntaxProfileSchema.roles.includes(rule.role)) {
      diagnostics.push(
        createDiagnostic(
          "invalid-role",
          `${path}.role`,
          `行首规则角色只能是 ${syntaxProfileSchema.roles.join("、")}。`,
        ),
      );
    }

    if (
      reservedTypes.has(rule.type) &&
      !(policy.scope === "todo" &&
        rule.type === syntaxProfileSchema.requiredTypes.todoItem)
    ) {
      diagnostics.push(
        createDiagnostic(
          "reserved-semantic-id",
          `${path}.type`,
          `语义 ID ${rule.type} 由固定规则保留。`,
        ),
      );
    }

    if (rule.marker) {
      const previousMarkerPath = markers.get(rule.marker);

      if (previousMarkerPath) {
        diagnostics.push(
          createDiagnostic(
            "duplicate-marker",
            `${path}.marker`,
            `行首符号 ${rule.marker} 已在 ${previousMarkerPath} 使用。`,
          ),
        );
      } else {
        markers.set(rule.marker, `${path}.marker`);
      }
    }

    registerSemanticId(rule.type, `${path}.type`);
  });

  if (profile.markerRules.length === 0) {
    diagnostics.push(
      createDiagnostic(
        "missing-marker-rule",
        "markers",
        "至少需要一个行首规则。",
      ),
    );
  }

  if (policy.scope === "todo") {
    const todoRules = profile.markerRules.filter(
      ({ type }) => type === syntaxProfileSchema.requiredTypes.todoItem,
    );

    if (todoRules.length !== 1) {
      diagnostics.push(
        createDiagnostic(
          "missing-required-rule",
          "markers.todo-item",
          "代办规则不能删除，且必须保持唯一。",
        ),
      );
    } else if (todoRules[0].role !== "normal") {
      diagnostics.push(
        createDiagnostic(
          "invalid-role",
          `markers[${profile.markerRules.indexOf(todoRules[0])}].role`,
          "代办规则角色固定为 normal。",
        ),
      );
    }
  }

  profile.inlineRules.forEach((rule, index) => {
    const path = `inlineRules[${index}]`;
    const trigger = getInlineTrigger(rule);

    diagnostics.push(
      ...validateText(
        rule.label,
        `${path}.label`,
        "行内名称",
        syntaxProfileSchema.label.maxLength,
      ),
      ...validateSemanticId(rule.type, `${path}.type`, "行内语义 ID"),
      ...validateTone(rule.textColor, `${path}.textColor`),
      ...validateTone(rule.tone, `${path}.tone`),
      ...validateText(
        trigger,
        rule.kind === "paired" ? `${path}.open` : `${path}.marker`,
        rule.kind === "paired" ? "开始符号" : "行内符号",
        syntaxProfileSchema.token.maxLength,
      ),
    );

    if (rule.kind === "paired") {
      diagnostics.push(
        ...validateText(
          rule.close,
          `${path}.close`,
          "结束符号",
          syntaxProfileSchema.token.maxLength,
        ),
      );
    }

    if (
      reservedTypes.has(rule.type) &&
      !(
        rule.kind === "paired" &&
        rule.type === syntaxProfileSchema.requiredTypes.globalReference
      )
    ) {
      diagnostics.push(
        createDiagnostic(
          "reserved-semantic-id",
          `${path}.type`,
          `语义 ID ${rule.type} 由固定规则保留。`,
        ),
      );
    }

    const triggerPath =
      rule.kind === "paired" ? `${path}.open` : `${path}.marker`;
    if (trigger) {
      const previousTriggerPath = inlineTriggers.get(trigger);

      if (previousTriggerPath) {
        diagnostics.push(
          createDiagnostic(
            "duplicate-inline-trigger",
            triggerPath,
            `行内触发符 ${trigger} 已在 ${previousTriggerPath} 使用。`,
          ),
        );
      } else {
        inlineTriggers.set(trigger, triggerPath);
      }
    }

    registerSemanticId(rule.type, `${path}.type`);
  });

  if (
    !profile.inlineRules.some(
      (rule) =>
        rule.kind === "paired" &&
        rule.type === syntaxProfileSchema.requiredTypes.globalReference,
    )
  ) {
    diagnostics.push(
      createDiagnostic(
        "missing-required-rule",
        "inlineRules.global-reference",
        "全局概念引用规则不能删除，且必须是成对行内规则。",
      ),
    );
  }

  return diagnostics;
}
