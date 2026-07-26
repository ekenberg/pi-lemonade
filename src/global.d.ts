// Minimal ambient declaration for Node's `process` global, avoiding a
// dependency on `@types/node` (this project's only devDependency is
// `typescript`, per PLAN.md hard constraints).
declare const process: {
  env: Record<string, string | undefined>;
};
