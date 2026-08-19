// SPDX-License-Identifier: GPL-3.0-or-later

import { useState, type FormEvent } from "react";
import type {
  TodoBlockView,
} from "../../../application/todo";
import type {
  TodoIsoWeekday,
  TodoRecurrenceRule,
} from "../../../core/todo/recurrence/todoRecurrence";
import {
  Button,
  SegmentedControl,
} from "../../ui/shared/primitives";
import { useFeedback } from "../../ui/shared/FeedbackProvider";

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
  node,
  onCancel,
  onConfirm,
}: {
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
    <form
      aria-label={`配置周期 ${node.text}`}
      className="todo-recurrence-editor"
      onSubmit={submit}
    >
      {node.recurrence ? (
        <p className="todo-recurrence-summary">
          {node.recurrence.active
            ? `完成 ${node.recurrence.completedCount}/${node.recurrence.totalCount}${
                node.recurrence.nextOccurrenceDate
                  ? ` · 下次 ${node.recurrence.nextOccurrenceDate}`
                  : " · 暂无下次"
              }`
            : `历史完成 ${node.recurrence.completedCount}/${node.recurrence.totalCount} · 周期已停止`}
        </p>
      ) : null}
      <SegmentedControl
        ariaLabel="周期类型"
        fill
        options={[
          { label: "日", value: "daily" },
          { label: "周", value: "weekly" },
          { label: "月", value: "monthly" },
          ...(node.recurrence?.active
            ? [{ label: "停止", value: "none" as const }]
            : []),
        ]}
        value={mode}
        onChange={(nextMode) => {
          setMode(nextMode);
          setErrorMessage("");
        }}
      />
      {mode !== "none" ? (
        <label className="todo-recurrence-field">
          <span>每隔</span>
          <input
            aria-label="重复间隔"
            className="ui-input"
            inputMode="numeric"
            min={1}
            onChange={(event) => setInterval(event.currentTarget.value)}
            step={1}
            type="number"
            value={interval}
          />
          <span>{mode === "daily" ? "天" : mode === "weekly" ? "周" : "月"}</span>
        </label>
      ) : null}
      {mode === "weekly" ? (
        <div aria-label="重复星期" className="todo-recurrence-weekdays">
          {weekdays.map((weekday) => (
            <label key={weekday.value}>
              <input
                checked={selectedWeekdays.includes(weekday.value)}
                onChange={(event) => {
                  setSelectedWeekdays((current) =>
                    event.currentTarget.checked
                      ? [...current, weekday.value]
                      : current.filter((value) => value !== weekday.value)
                  );
                  setErrorMessage("");
                }}
                type="checkbox"
              />
              <span>{weekday.label}</span>
            </label>
          ))}
        </div>
      ) : null}
      {mode === "monthly" ? (
        <label className="todo-recurrence-field">
          <span>第</span>
          <input
            aria-label="每月日期"
            className="ui-input"
            inputMode="numeric"
            max={31}
            min={1}
            onChange={(event) => setDayOfMonth(event.currentTarget.value)}
            step={1}
            type="number"
            value={dayOfMonth}
          />
          <span>日（月末自动收敛）</span>
        </label>
      ) : null}
      {errorMessage ? (
        <p className="todo-recurrence-error" role="status">
          {errorMessage}
        </p>
      ) : null}
      <div className="todo-recurrence-actions">
        <Button type="submit" variant="primary">确定</Button>
        <Button onClick={onCancel} type="button">取消</Button>
      </div>
    </form>
  );
}
