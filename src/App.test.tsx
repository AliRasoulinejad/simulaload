import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import App from "./App";
import { DEFAULT_TICK_SECONDS } from "./engine/constants";

describe("App", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("seeds the pinned Entry Point and runs/pauses the simulation clock from Start/Pause", () => {
    vi.useFakeTimers();
    render(<App />);

    expect(screen.getByText(/entry point/i)).toBeInTheDocument();
    expect(screen.getByText("0 rps")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    act(() => {
      vi.advanceTimersByTime(DEFAULT_TICK_SECONDS * 1000 * 2);
    });
    expect(screen.getByText("50 rps")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  });
});
