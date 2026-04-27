"use client";

import {
  type ColumnDef,
  DataTable,
  EmptyState,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
  Button,
} from "@repo/ui";
import Link from "next/link";
import { type EndpointDTO } from "../../lib/api";

interface EndpointTableProps {
  endpoints: EndpointDTO[];
  isLoading: boolean;
  onDelete: (endpoint: EndpointDTO) => void;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function TruncatedUrl({ url }: { url: string }) {
  const display = url.length > 40 ? url.slice(0, 40) + "…" : url;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="font-mono text-xs cursor-default">{display}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-mono text-xs">{url}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function EndpointTable({
  endpoints,
  isLoading,
  onDelete,
}: EndpointTableProps) {
  const columns: ColumnDef<EndpointDTO>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <Link
          href={`/endpoints/${row.original.id}/events`}
          className="font-medium text-primary hover:underline"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "url",
      header: "URL",
      cell: ({ row }) => <TruncatedUrl url={row.original.url} />,
    },
    {
      accessorKey: "createdAt",
      header: "Created At",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {formatDate(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => onDelete(row.original)}
        >
          Delete
        </Button>
      ),
    },
  ];

  const emptyState = (
    <EmptyState
      heading="No endpoints yet"
      description="Create your first endpoint to start receiving webhooks."
    />
  );

  return (
    <DataTable
      columns={columns}
      data={endpoints}
      isLoading={isLoading}
      emptyState={emptyState}
    />
  );
}
