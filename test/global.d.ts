// Minimal ambient declarations for the node:test / node:assert/strict
// built-ins used by these tests, avoiding a dependency on `@types/node`
// (this project's only devDependency is `typescript`, per PLAN.md hard
// constraints).

declare module "node:test" {
  type TestFn = () => void | Promise<void>;
  export function test(name: string, fn: TestFn): void;
  export function beforeEach(fn: TestFn): void;
  export function afterEach(fn: TestFn): void;
}

declare module "node:assert/strict" {
  interface Assert {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    match(actual: string, expected: RegExp, message?: string): void;
    doesNotThrow(fn: () => unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
  }
  const assert: Assert;
  export default assert;
}
