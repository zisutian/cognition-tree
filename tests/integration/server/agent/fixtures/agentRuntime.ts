import type { ApiRuntime } from "../../../../../infrastructure/server/api/http/runtime.ts";
export const runtime: ApiRuntime = {
  createId: () => "00000000-0000-4000-8000-000000000001",
  now: () => new Date("2026-08-25T00:00:00.000Z"),
  timezoneOffsetMinutes: () => 480,
  today: () => "2026-08-25",
};
