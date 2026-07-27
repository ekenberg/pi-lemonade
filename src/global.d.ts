// Minimal ambient declaration for Node's `process` global, avoiding a
// dependency on `@types/node` (this project's only devDependency is
// `typescript`, per PLAN.md hard constraints).
declare const process: {
  env: Record<string, string | undefined>;
};

// Minimal ambient declaration for the one pi-tui function this extension uses
// at runtime. pi resolves this bare specifier with its own loader when it
// loads the extension (plain `node` cannot resolve it from the installed
// extension directory), so it must not become a package dependency — same
// approach as the node:test shim in test/global.d.ts.
declare module "@earendil-works/pi-tui" {
  export function matchesKey(data: string, keyId: string): boolean;
}
