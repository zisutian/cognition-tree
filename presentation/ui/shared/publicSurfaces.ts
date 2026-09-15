import type { ReactNode } from "react";
import {
  FieldRow as FieldRowImplementation,
  FormActions as FormActionsImplementation,
  FormLayout as FormLayoutImplementation,
} from "./FormLayout.tsx";
import {
  ManagementList as ManagementListImplementation,
  ManagementRow as ManagementRowImplementation,
} from "./ManagementList.tsx";
import {
  Section as SectionImplementation,
  SectionStack as SectionStackImplementation,
} from "./Section.tsx";
import { StatusBadge as StatusBadgeImplementation } from "./StatusPresentation.tsx";
import {
  ToolList as ToolListImplementation,
  ToolListRow as ToolListRowImplementation,
} from "./ToolList.tsx";
import {
  ToolPropertyList as ToolPropertyListImplementation,
  ToolPropertyRow as ToolPropertyRowImplementation,
} from "./ToolPropertyList.tsx";
import {
  ToolDivider as ToolDividerImplementation,
  ToolToolbar as ToolToolbarImplementation,
} from "./ToolToolbar.tsx";

// The public composition API cannot restyle shared internals.
type Surface<C> = C extends (props: infer P) => ReactNode
  ? (props: Omit<P, "className" | "style">) => ReactNode
  : never;
export const FieldRow = FieldRowImplementation as Surface<
  typeof FieldRowImplementation
>;
export const FormActions = FormActionsImplementation as Surface<
  typeof FormActionsImplementation
>;
export const FormLayout = FormLayoutImplementation as Surface<
  typeof FormLayoutImplementation
>;
export const Section = SectionImplementation as Surface<
  typeof SectionImplementation
>;
export const SectionStack = SectionStackImplementation as Surface<
  typeof SectionStackImplementation
>;
export const ToolToolbar = ToolToolbarImplementation as Surface<
  typeof ToolToolbarImplementation
>;
export const ToolDivider = ToolDividerImplementation as Surface<
  typeof ToolDividerImplementation
>;
export const ToolPropertyList = ToolPropertyListImplementation as Surface<
  typeof ToolPropertyListImplementation
>;
export const ToolPropertyRow = ToolPropertyRowImplementation as Surface<
  typeof ToolPropertyRowImplementation
>;
export const ToolList = ToolListImplementation as Surface<
  typeof ToolListImplementation
>;
export const ToolListRow = ToolListRowImplementation as Surface<
  typeof ToolListRowImplementation
>;
export const ManagementList = ManagementListImplementation as Surface<
  typeof ManagementListImplementation
>;
export const ManagementRow = ManagementRowImplementation as Surface<
  typeof ManagementRowImplementation
>;
export const StatusBadge = StatusBadgeImplementation as Surface<
  typeof StatusBadgeImplementation
>;
