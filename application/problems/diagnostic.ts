export type Diagnostic<Target> = {
  code: string;
  id: string;
  locationLabel: string;
  message: string;
  severity: "error" | "warning";
  source: "document" | "name" | "reference" | "syntax";
  target: Target;
};
