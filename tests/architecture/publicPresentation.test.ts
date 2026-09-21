import type { ComponentProps } from "react";
import { expectTypeOf, it } from "vitest";
import { Workbench, Tree } from "compact-ui";
import { Button, InputControl, Section } from "compact-ui";

it("consumes public controls with closed appearance contracts", () => {
  type VisualOverrides<T> = Extract<keyof T, "className" | "style" | "density">;
  expectTypeOf<
    VisualOverrides<ComponentProps<typeof Button>>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    VisualOverrides<ComponentProps<typeof InputControl>>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    VisualOverrides<ComponentProps<typeof Section>>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    VisualOverrides<ComponentProps<typeof Workbench>>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    VisualOverrides<ComponentProps<typeof Tree>>
  >().toEqualTypeOf<never>();
});
