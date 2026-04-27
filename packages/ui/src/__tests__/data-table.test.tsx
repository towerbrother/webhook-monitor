import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "../components/data-table";

type Row = { id: string; name: string };
const columnHelper = createColumnHelper<Row>();
const columns = [
  columnHelper.accessor("id", { header: "ID" }),
  columnHelper.accessor("name", { header: "Name" }),
];

describe("DataTable", () => {
  it("renders 3 skeleton rows when isLoading=true", () => {
    const { container } = render(
      <DataTable columns={columns} data={[]} isLoading={true} />
    );
    const skeletons = container.querySelectorAll(
      "[data-testid='skeleton-row']"
    );
    expect(skeletons.length).toBe(3);
  });

  it("renders emptyState when data=[] and isLoading=false", () => {
    render(
      <DataTable columns={columns} data={[]} emptyState={<div>No data</div>} />
    );
    expect(screen.getByText("No data")).toBeDefined();
  });

  it("renders data rows when data is provided", () => {
    const data: Row[] = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ];
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText("Alice")).toBeDefined();
    expect(screen.getByText("Bob")).toBeDefined();
  });

  it("renders column headers", () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText("ID")).toBeDefined();
    expect(screen.getByText("Name")).toBeDefined();
  });
});
