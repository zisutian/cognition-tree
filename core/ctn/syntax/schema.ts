// SPDX-License-Identifier: GPL-3.0-or-later

import {
  configurableSyntaxTones,
  isConfigurableSyntaxTone,
} from "./tones.ts";
import type {
  CtnBlockRule,
  CtnInlineRule,
  CtnSyntaxDefinition,
  CtnSyntaxDisplayRule,
  CtnSyntaxOwner,
  CtnSyntaxTone,
} from "./types.ts";

export type CtnSyntaxOwnerPolicy = {
  fixedName: string | null;
  globalReferenceTrigger: {
    close: string;
    open: string;
  } | null;
  owner: CtnSyntaxOwner;
  root: {
    required: boolean;
    semanticId: "body" | "concept" | null;
  };
  title: {
    source: "required" | "synthetic";
    syntheticStyle: CtnSyntaxDisplayRule | null;
  };
  todoItem: {
    kind: "line";
    label: string;
    marker: string;
    semanticId: "todo-item";
  } | null;
};

const ownerPolicies = {
  workspace: {
    fixedName: null,
    globalReferenceTrigger: null,
    owner: "workspace",
    root: {
      required: true,
      semanticId: "concept",
    },
    title: {
      source: "required",
      syntheticStyle: null,
    },
    todoItem: null,
  },
  journal: {
    fixedName: "日记",
    globalReferenceTrigger: {
      close: "]]",
      open: "[[",
    },
    owner: "journal",
    root: {
      required: true,
      semanticId: "body",
    },
    title: {
      source: "synthetic",
      syntheticStyle: {
        label: "标题",
        textColor: "cyan",
        tone: "blue",
      },
    },
    todoItem: null,
  },
  todo: {
    fixedName: "代办",
    globalReferenceTrigger: null,
    owner: "todo",
    root: {
      required: false,
      semanticId: null,
    },
    title: {
      source: "synthetic",
      syntheticStyle: {
        label: "事项集合",
        textColor: "cyan",
        tone: "blue",
      },
    },
    todoItem: {
      kind: "line",
      label: "代办",
      marker: "[]",
      semanticId: "todo-item",
    },
  },
} as const satisfies Record<CtnSyntaxOwner, CtnSyntaxOwnerPolicy>;

export const ctnSyntaxSchema = {
  fields: {
    block: [
      "marker",
      "semanticId",
      "label",
      "kind",
      "tone",
      "textColor",
    ],
    display: ["label", "tone", "textColor"],
    header: ["formatVersion", "name", "tabDisplayWidth"],
    inline: {
      paired: [
        "kind",
        "open",
        "close",
        "semanticId",
        "label",
        "tone",
        "textColor",
      ],
      single: [
        "kind",
        "marker",
        "semanticId",
        "label",
        "tone",
        "textColor",
      ],
    },
    topLevel: [
      "formatVersion",
      "name",
      "tabDisplayWidth",
      "title",
      "root",
      "blocks",
      "inline",
    ],
  },
  formatVersion: 2,
  label: {
    maxLength: 32,
    minLength: 1,
  },
  name: {
    maxLength: 64,
    minLength: 1,
  },
  requiredSemanticIds: {
    body: "body",
    concept: "concept",
    globalReference: "global-reference",
    title: "title",
    todoItem: "todo-item",
  },
  blockKinds: ["line", "multiline"] as const,
  semanticId: {
    maxLength: 64,
    pattern: /^[a-z][a-z0-9-]*$/,
  },
  tabDisplayWidth: {
    max: 16,
    min: 1,
  },
  token: {
    maxCodePoints: 12,
    minCodePoints: 1,
  },
  owners: ownerPolicies,
  tones: configurableSyntaxTones,
} as const;

export type CtnSyntaxDiagnosticCode =
  | "duplicate-block-token"
  | "duplicate-inline-trigger"
  | "duplicate-semantic-id"
  | "forbidden-field"
  | "invalid-block-kind"
  | "invalid-field"
  | "invalid-fixed-name"
  | "invalid-format-version"
  | "invalid-semantic-id"
  | "invalid-tab-display-width"
  | "invalid-token"
  | "invalid-tone"
  | "missing-field"
  | "missing-required-rule"
  | "reserved-semantic-id"
  | "too-long";

export type CtnSyntaxSchemaDiagnostic = {
  code: CtnSyntaxDiagnosticCode;
  message: string;
  path: string;
};

function diagnostic(
  code: CtnSyntaxDiagnosticCode,
  path: string,
  message: string,
): CtnSyntaxSchemaDiagnostic {
  return { code, message, path };
}

function validateText(
  value: string,
  path: string,
  label: string,
  maxLength: number,
) {
  const diagnostics: CtnSyntaxSchemaDiagnostic[] = [];

  if (!value.trim()) {
    diagnostics.push(diagnostic("missing-field", path, `${label}不能为空。`));
  }
  if (Array.from(value).length > maxLength) {
    diagnostics.push(
      diagnostic("too-long", path, `${label}不能超过 ${maxLength} 个字符。`),
    );
  }
  return diagnostics;
}

function validateTone(
  value: CtnSyntaxTone,
  path: string,
  allowDefault: boolean,
) {
  return (allowDefault && value === "default") ||
      isConfigurableSyntaxTone(value)
    ? []
    : [
        diagnostic(
          "invalid-tone",
          path,
          "颜色必须是预设颜色或 #RRGGBB。",
        ),
      ];
}

export function validateCtnSyntaxName(value: string) {
  return validateText(
    value,
    "$.name",
    "语法名称",
    ctnSyntaxSchema.name.maxLength,
  );
}

export function validateCtnSyntaxTabDisplayWidth(value: number) {
  return Number.isInteger(value) &&
      value >= ctnSyntaxSchema.tabDisplayWidth.min &&
      value <= ctnSyntaxSchema.tabDisplayWidth.max
    ? []
    : [
        diagnostic(
          "invalid-tab-display-width",
          "$.tabDisplayWidth",
          `Tab 显示宽度必须是 ${ctnSyntaxSchema.tabDisplayWidth.min} 到 ${ctnSyntaxSchema.tabDisplayWidth.max} 之间的整数。`,
        ),
      ];
}

export function normalizeCtnSyntaxTabDisplayWidthInput(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) return "";

  return String(
    Math.min(
      ctnSyntaxSchema.tabDisplayWidth.max,
      Math.max(
        ctnSyntaxSchema.tabDisplayWidth.min,
        Number.parseInt(digits, 10),
      ),
    ),
  );
}

function validateSemanticId(
  value: string,
  path: string,
): CtnSyntaxSchemaDiagnostic[] {
  const diagnostics = validateText(
    value,
    path,
    "语义 ID",
    ctnSyntaxSchema.semanticId.maxLength,
  );

  if (
    value &&
    Array.from(value).length <= ctnSyntaxSchema.semanticId.maxLength &&
    !ctnSyntaxSchema.semanticId.pattern.test(value)
  ) {
    diagnostics.push(
      diagnostic(
        "invalid-semantic-id",
        path,
        "语义 ID 必须是 ASCII kebab-case，例如 definition 或 claim-source。",
      ),
    );
  }
  return diagnostics;
}

function validateToken(
  value: string,
  path: string,
): CtnSyntaxSchemaDiagnostic[] {
  const codePoints = Array.from(value);
  const validLength =
    codePoints.length >= ctnSyntaxSchema.token.minCodePoints &&
    codePoints.length <= ctnSyntaxSchema.token.maxCodePoints;
  const validCharacters =
    codePoints.length > 0 &&
    codePoints.every((codePoint) => /^[\p{P}\p{S}]$/u.test(codePoint));

  return validLength && validCharacters
    ? []
    : [
        diagnostic(
          "invalid-token",
          path,
          `符号必须由 1–${ctnSyntaxSchema.token.maxCodePoints} 个 Unicode 标点或符号组成，不能包含空白、字母或数字。`,
        ),
      ];
}

function validateDisplayRule(
  rule: CtnSyntaxDisplayRule,
  path: string,
  {
    allowDefaultTextColor = false,
    allowDefaultTone = true,
  }: {
    allowDefaultTextColor?: boolean;
    allowDefaultTone?: boolean;
  } = {},
) {
  return [
    ...validateText(
      rule.label,
      `${path}.label`,
      "名称",
      ctnSyntaxSchema.label.maxLength,
    ),
    ...validateTone(rule.tone, `${path}.tone`, allowDefaultTone),
    ...validateTone(
      rule.textColor,
      `${path}.textColor`,
      allowDefaultTextColor,
    ),
  ];
}

function inlineTrigger(rule: CtnInlineRule) {
  return rule.kind === "paired" ? rule.open : rule.marker;
}

export function validateCtnSyntaxDefinition(
  definition: CtnSyntaxDefinition,
  owner: CtnSyntaxOwner,
): CtnSyntaxSchemaDiagnostic[] {
  const diagnostics: CtnSyntaxSchemaDiagnostic[] = [];
  const policy = ctnSyntaxSchema.owners[owner];
  const semanticIds = new Map<string, string>();
  const blockTokens = new Map<string, string>();
  const inlineTriggers = new Map<string, string>();
  const reserved = new Set<string>(
    Object.values(ctnSyntaxSchema.requiredSemanticIds),
  );
  const registerSemanticId = (
    semanticId: string,
    path: string,
    allowedReserved: string | null = null,
  ) => {
    diagnostics.push(...validateSemanticId(semanticId, path));

    if (reserved.has(semanticId) && semanticId !== allowedReserved) {
      diagnostics.push(
        diagnostic(
          "reserved-semantic-id",
          path,
          `语义 ID ${semanticId} 由固定规则保留。`,
        ),
      );
    }
    const previousPath = semanticIds.get(semanticId);

    if (previousPath) {
      diagnostics.push(
        diagnostic(
          "duplicate-semantic-id",
          path,
          `语义 ID ${semanticId} 已在 ${previousPath} 使用。`,
        ),
      );
    } else if (ctnSyntaxSchema.semanticId.pattern.test(semanticId)) {
      semanticIds.set(semanticId, path);
    }
  };

  if (definition.formatVersion !== ctnSyntaxSchema.formatVersion) {
    diagnostics.push(
      diagnostic(
        "invalid-format-version",
        "$.formatVersion",
        `formatVersion 必须是 ${ctnSyntaxSchema.formatVersion}。`,
      ),
    );
  }
  diagnostics.push(
    ...validateCtnSyntaxName(definition.name),
    ...validateCtnSyntaxTabDisplayWidth(definition.tabDisplayWidth),
  );
  if (policy.fixedName !== null && definition.name !== policy.fixedName) {
    diagnostics.push(
      diagnostic(
        "invalid-fixed-name",
        "$.name",
        `${policy.fixedName}语法名称固定为“${policy.fixedName}”。`,
      ),
    );
  }

  semanticIds.set(ctnSyntaxSchema.requiredSemanticIds.title, "title");
  if (policy.title.source === "required") {
    if (definition.title === null) {
      diagnostics.push(
        diagnostic("missing-field", "title", "Workspace 语法缺少 [title]。"),
      );
    } else {
      diagnostics.push(...validateDisplayRule(definition.title, "title"));
    }
  } else if (definition.title !== null) {
    diagnostics.push(
      diagnostic(
        "forbidden-field",
        "title",
        `${policy.fixedName ?? owner}语法的标题由系统固定，不能声明 [title]。`,
      ),
    );
  }

  if (policy.root.required) {
    if (definition.root === null) {
      diagnostics.push(
        diagnostic("missing-field", "root", "当前语法缺少 [root]。"),
      );
    } else {
      diagnostics.push(
        ...validateDisplayRule(
          definition.root,
          "root",
          { allowDefaultTextColor: owner === "journal" },
        ),
      );
      if (policy.root.semanticId) {
        semanticIds.set(policy.root.semanticId, "root");
      }
    }
  } else if (definition.root !== null) {
    diagnostics.push(
      diagnostic(
        "forbidden-field",
        "root",
        "Todo 语法不能声明 [root]。",
      ),
    );
  }

  if (definition.blocks.length === 0) {
    diagnostics.push(
      diagnostic("missing-required-rule", "blocks", "至少需要一个块规则。"),
    );
  }
  definition.blocks.forEach((rule: CtnBlockRule, index) => {
    const path = `blocks[${index}]`;

    diagnostics.push(
      ...validateDisplayRule(
        rule,
        path,
        {
          allowDefaultTextColor: owner === "todo" &&
            rule.semanticId === ctnSyntaxSchema.requiredSemanticIds.todoItem,
        },
      ),
      ...validateToken(rule.marker, `${path}.marker`),
    );
    if (!ctnSyntaxSchema.blockKinds.includes(rule.kind)) {
      diagnostics.push(
        diagnostic(
          "invalid-block-kind",
          `${path}.kind`,
          "块类型只能是 line 或 multiline。",
        ),
      );
    }
    const previousTokenPath = blockTokens.get(rule.marker);

    if (previousTokenPath) {
      diagnostics.push(
        diagnostic(
          "duplicate-block-token",
          `${path}.marker`,
          `块符号 ${rule.marker} 已在 ${previousTokenPath} 使用。`,
        ),
      );
    } else if (rule.marker) {
      blockTokens.set(rule.marker, `${path}.marker`);
    }
    registerSemanticId(
      rule.semanticId,
      `${path}.semanticId`,
      owner === "todo"
        ? ctnSyntaxSchema.requiredSemanticIds.todoItem
        : null,
    );
  });

  const todoItemPolicy = policy.todoItem;

  if (todoItemPolicy) {
    const todoRules = definition.blocks.filter(
      ({ semanticId }) =>
        semanticId === todoItemPolicy.semanticId,
    );

    if (todoRules.length !== 1) {
      diagnostics.push(
        diagnostic(
          "missing-required-rule",
          "blocks.todo-item",
          "Todo 语法必须保留唯一的 todo-item 块规则。",
        ),
      );
    } else {
      const todoRule = todoRules[0];
      const todoRulePath = `blocks[${definition.blocks.indexOf(todoRule)}]`;

      if (todoRule.kind !== todoItemPolicy.kind) {
        diagnostics.push(
          diagnostic(
            "invalid-block-kind",
            `${todoRulePath}.kind`,
            "todo-item 块类型固定为 line。",
          ),
        );
      }
      if (todoRule.label !== todoItemPolicy.label) {
        diagnostics.push(
          diagnostic(
            "invalid-field",
            `${todoRulePath}.label`,
            `todo-item 名称固定为“${todoItemPolicy.label}”。`,
          ),
        );
      }
      if (todoRule.marker !== todoItemPolicy.marker) {
        diagnostics.push(
          diagnostic(
            "invalid-field",
            `${todoRulePath}.marker`,
            `todo-item 符号固定为 ${todoItemPolicy.marker}。`,
          ),
        );
      }
    }
  }

  definition.inline.forEach((rule, index) => {
    const path = `inline[${index}]`;

    diagnostics.push(
      ...validateDisplayRule(rule, path, { allowDefaultTone: false }),
      ...validateToken(inlineTrigger(rule), rule.kind === "paired"
        ? `${path}.open`
        : `${path}.marker`),
    );
    if (rule.kind === "paired") {
      diagnostics.push(...validateToken(rule.close, `${path}.close`));
    }
    const trigger = inlineTrigger(rule);
    const previousTriggerPath = inlineTriggers.get(trigger);

    if (previousTriggerPath) {
      diagnostics.push(
        diagnostic(
          "duplicate-inline-trigger",
          rule.kind === "paired" ? `${path}.open` : `${path}.marker`,
          `行内触发符 ${trigger} 已在 ${previousTriggerPath} 使用。`,
        ),
      );
    } else if (trigger) {
      inlineTriggers.set(
        trigger,
        rule.kind === "paired" ? `${path}.open` : `${path}.marker`,
      );
    }
    registerSemanticId(
      rule.semanticId,
      `${path}.semanticId`,
      rule.semanticId === ctnSyntaxSchema.requiredSemanticIds.globalReference
        ? ctnSyntaxSchema.requiredSemanticIds.globalReference
        : null,
    );
  });

  const globalReferences = definition.inline.filter(
    ({ semanticId }) =>
      semanticId === ctnSyntaxSchema.requiredSemanticIds.globalReference,
  );

  if (
    globalReferences.length !== 1 ||
    globalReferences[0]?.kind !== "paired"
  ) {
    diagnostics.push(
      diagnostic(
        "missing-required-rule",
        "inline.global-reference",
        "必须保留唯一且成对的 global-reference 行内规则。",
      ),
    );
  } else if (policy.globalReferenceTrigger) {
    const reference = globalReferences[0];

    if (
      reference.kind !== "paired" ||
      reference.open !== policy.globalReferenceTrigger.open ||
      reference.close !== policy.globalReferenceTrigger.close
    ) {
      diagnostics.push(
        diagnostic(
          "invalid-field",
          "inline.global-reference",
          "Journal 的 global-reference 必须使用受保护的 [[...]] 符号。",
        ),
      );
    }
  }

  return diagnostics;
}
