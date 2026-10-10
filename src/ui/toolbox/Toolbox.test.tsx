import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toolbox } from "./Toolbox";

describe("Toolbox", () => {
  it("calls onAdd with the component type when a palette button is clicked", async () => {
    const onAdd = vi.fn();
    render(<Toolbox onAdd={onAdd} />);

    await userEvent.click(screen.getByRole("button", { name: /load balancer/i }));

    expect(onAdd).toHaveBeenCalledWith("loadBalancer");
  });

  it("does not render a button for Entry Point (it is pinned, not user-addable)", () => {
    render(<Toolbox onAdd={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /entry point/i })).not.toBeInTheDocument();
  });
});
