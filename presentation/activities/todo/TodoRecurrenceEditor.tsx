// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Button,
  CheckboxGroup,
  ChoiceGroup,
  FieldRow,
  FormActions,
  FormLayout,
  InputControl,
  StatusText,
} from "compact-ui";

import { useState, type FormEvent } from "react";
import type { TodoBlockView } from "../../../application/todo/index.ts";
import type {
  TodoIsoWeekday,
  TodoRecurrenceRule,
} from "../../../core/todo/index.ts";

import { useFeedback } from "../../ui/index.ts";

type RecurrenceMode = "daily" | "monthly" | "none" | "weekly";

const weekdays: Array<{ label: string; value: TodoIsoWeekday }> = [
  { label: "一", value: 1 },
  { label: "二", value: 2 },
  { label: "三", value: 3 },
  { label: "四", value: 4 },
  { label: "五", value: 5 },
  { label: "六", value: 6 },
  { label: "日", value: 7 },
];

function initialRule(node: TodoBlockView): TodoRecurrenceRule {
  return node.recurrence?.rule ?? { interval: 1, kind: "daily" };
}

function requirePositiveInteger(value: string, label: string) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error(`${label}必须是大于 0 的整数。`);
  }
  return number;
}

export function TodoRecurrenceEditor({
  disabled,
  node,
  onCancel,
  onConfirm,
}: {
  disabled: boolean;
  node: TodoBlockView;
  onCancel: () => void;
  onConfirm: (rule: TodoRecurrenceRule | null) => void;
}) {
  const feedback = useFeedback();
  const rule = initialRule(node);
  const [mode, setMode] = useState<RecurrenceMode>(rule.kind);
  const [interval, setInterval] = useState(String(rule.interval));
  const [dayOfMonth, setDayOfMonth] = useState(
    String(rule.kind === "monthly" ? rule.dayOfMonth : 1),
  );
  const [selectedWeekdays, setSelectedWeekdays] = useState<TodoIsoWeekday[]>(
    rule.kind === "weekly" ? rule.weekdays : [1],
  );
  const [errorMessage, setErrorMessage] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    try {
      let nextRule: TodoRecurrenceRule | null;

      if (mode === "none") {
        nextRule = null;
      } else {
        const parsedInterval = requirePositiveInteger(interval, "重复间隔");

        if (mode === "daily") {
          nextRule = { interval: parsedInterval, kind: mode };
        } else if (mode === "weekly") {
          if (selectedWeekdays.length === 0) {
            throw new Error("每周重复至少选择一个星期。");
          }
          nextRule = {
            interval: parsedInterval,
            kind: mode,
            weekdays: [...selectedWeekdays].sort((left, right) => left - right),
          };
        } else {
          const parsedDay = requirePositiveInteger(dayOfMonth, "每月日期");

          if (parsedDay > 31) {
            throw new Error("每月日期必须在 1 到 31 之间。");
          }
          nextRule = {
            dayOfMonth: parsedDay,
            interval: parsedInterval,
            kind: mode,
          };
        }
      }
      setErrorMessage("");
      onConfirm(nextRule);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "周期规则无效。",
      );
      feedback.notifyError(error);
    }
  };

  return (
    <section aria-label={`配置周期 ${node.text}`}>
      <FormLayout layout="stacked" onSubmit={submit}>
        {node.recurrence ? (
          <StatusText>
            {node.recurrence.active
              ? `完成 ${node.recurrence.completedCount}/${node.recurrence.totalCount}${
                  node.recurrence.nextOccurrenceDate
                    ? ` · 下次 ${node.recurrence.nextOccurrenceDate}`
                    : " · 暂无下次"
                }`
              : `历史完成 ${node.recurrence.completedCount}/${node.recurrence.totalCount} · 周期已停止`}
          </StatusText>
        ) : null}
        <ChoiceGroup<RecurrenceMode>
          ariaLabel="周期类型"
          mode="single"
          options={(
            [
              { label: "日", value: "daily" },
              { label: "周", value: "weekly" },
              { label: "月", value: "monthly" },
              ...(node.recurrence?.active
                ? [{ label: "停止", value: "none" as const }]
                : []),
            ] as const
          ).map((option) => ({ ...option, disabled }))}
          value={mode}
          onChange={(nextMode) => {
            setMode(nextMode);
            setErrorMessage("");
          }}
        />
        {mode !== "none" ? (
          <FieldRow
            label="重复间隔"
            description={
              mode === "daily" ? "天" : mode === "weekly" ? "周" : "月"
            }
          >
            {(accessibility) => (
              <InputControl
                {...accessibility}
                disabled={disabled}
                sizing="container"
                aria-label="重复间隔"
                inputMode="numeric"
                min={1}
                onChange={(event) => setInterval(event.currentTarget.value)}
                step={1}
                type="number"
                value={interval}
              />
            )}
          </FieldRow>
        ) : null}
        {mode === "weekly" ? (
          <CheckboxGroup
            ariaLabel="重复星期"
            options={weekdays.map((weekday) => ({
              ...weekday,
              value: String(weekday.value),
              label: `星期${weekday.label}`,
              disabled,
            }))}
            values={selectedWeekdays.map(String)}
            onChange={(values) => {
              setSelectedWeekdays(
                values.map((value) => Number(value) as TodoIsoWeekday),
              );
              setErrorMessage("");
            }}
          />
        ) : null}
        {mode === "monthly" ? (
          <FieldRow label="每月日期" description="日（月末自动收敛）">
            {(accessibility) => (
              <InputControl
                {...accessibility}
                disabled={disabled}
                sizing="container"
                aria-label="每月日期"
                inputMode="numeric"
                max={31}
                min={1}
                onChange={(event) => setDayOfMonth(event.currentTarget.value)}
                step={1}
                type="number"
                value={dayOfMonth}
              />
            )}
          </FieldRow>
        ) : null}
        {errorMessage ? (
          <span role="status">
            <StatusText mode="live" tone="danger">
              {errorMessage}
            </StatusText>
          </span>
        ) : null}
        <FormActions>
          <Button disabled={disabled} type="submit" variant="normal">
            确定
          </Button>
          <Button onClick={onCancel} type="button">
            取消
          </Button>
        </FormActions>
      </FormLayout>
    </section>
  );
}
