import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest runs with `globals: false`, so RTL can't register its own automatic
// cleanup; unmount rendered trees after every test here instead.
afterEach(() => {
  cleanup();
});

// jsdom does not implement ResizeObserver, which React Flow requires on mount.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
