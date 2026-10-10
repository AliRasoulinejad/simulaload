import "@testing-library/jest-dom/vitest";

// jsdom does not implement ResizeObserver, which React Flow requires on mount.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
