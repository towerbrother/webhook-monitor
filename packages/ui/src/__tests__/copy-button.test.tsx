import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { CopyButton } from "../components/copy-button";

describe("CopyButton", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, "isSecureContext", {
      value: true,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("renders a button", () => {
    render(<CopyButton text="hello" />);
    expect(screen.getByRole("button")).toBeDefined();
  });

  it("copies text to clipboard on click", async () => {
    render(<CopyButton text="hello world" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(writeText).toHaveBeenCalledWith("hello world");
  });

  it("shows check icon after copy", async () => {
    render(<CopyButton text="hello" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(screen.getByTestId("check-icon")).toBeDefined();
  });

  it("reverts copy icon after 2000ms", async () => {
    vi.useFakeTimers();
    render(<CopyButton text="hello" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    expect(screen.getByTestId("check-icon")).toBeDefined();

    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    expect(screen.queryByTestId("check-icon")).toBeNull();
  });
});
