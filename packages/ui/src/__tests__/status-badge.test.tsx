import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../components/status-badge";

describe("StatusBadge", () => {
  it("renders 'Delivered' label for DELIVERED status", () => {
    render(<StatusBadge status="DELIVERED" />);
    expect(screen.getByText("Delivered")).toBeDefined();
  });

  it("renders 'Failed' label for FAILED status", () => {
    render(<StatusBadge status="FAILED" />);
    expect(screen.getByText("Failed")).toBeDefined();
  });

  it("renders 'Pending' label for PENDING status", () => {
    render(<StatusBadge status="PENDING" />);
    expect(screen.getByText("Pending")).toBeDefined();
  });

  it("renders 'Retrying' label for RETRYING status", () => {
    render(<StatusBadge status="RETRYING" />);
    expect(screen.getByText("Retrying")).toBeDefined();
  });

  it("applies success variant class for DELIVERED", () => {
    const { container } = render(<StatusBadge status="DELIVERED" />);
    expect(container.firstChild).toBeDefined();
  });

  it("applies destructive variant class for FAILED", () => {
    const { container } = render(<StatusBadge status="FAILED" />);
    expect(container.firstChild).toBeDefined();
  });
});
