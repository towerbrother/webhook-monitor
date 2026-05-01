"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  SectionCard,
  Badge,
  Button,
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  StatusBadge,
  CopyButton,
  DataTable,
  EmptyState,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
  type ColumnDef,
} from "@repo/ui";
import { useApi } from "../../../../src/hooks/use-api";
import { type EventDTO, type EventStatus } from "../../../../src/lib/api";

const POLL_INTERVAL_MS = 5000;
const PAGE_LIMIT = 20;

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatAbsoluteTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

interface ReplayDialogState {
  event: EventDTO | null;
  open: boolean;
}

interface Toast {
  message: string;
  type: "success" | "error";
}

export default function EventsPage() {
  const params = useParams<{ endpointId: string }>();
  const endpointId = params.endpointId;
  const api = useApi();

  const [endpointName, setEndpointName] = useState<string | null>(null);
  const [endpointError, setEndpointError] = useState<string | null>(null);

  const [events, setEvents] = useState<EventDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pollTick, setPollTick] = useState(0);

  const [replayDialog, setReplayDialog] = useState<ReplayDialogState>({
    event: null,
    open: false,
  });
  const [isReplaying, setIsReplaying] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const isFirstLoad = useRef(true);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  // Fetch endpoint metadata once
  useEffect(() => {
    let cancelled = false;
    api
      .getEndpoint(endpointId)
      .then((ep) => {
        if (!cancelled) {
          setEndpointName(ep.name);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setEndpointError(
            err instanceof Error ? err.message : "Endpoint not found"
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, endpointId]);

  // Initial + polled event list fetch (replaces first page)
  useEffect(() => {
    let cancelled = false;
    const loading = isFirstLoad.current;
    if (loading) {
      isFirstLoad.current = false;
    }
    api
      .listEvents(endpointId, { limit: PAGE_LIMIT })
      .then((data) => {
        if (!cancelled) {
          setEvents(data.events);
          setNextCursor(data.nextCursor);
          setEventsError(null);
          if (loading) setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setEventsError(
            err instanceof Error ? err.message : "Failed to load events"
          );
          if (loading) setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, endpointId, pollTick]);

  // 5-second polling
  useEffect(() => {
    const id = setInterval(() => {
      setPollTick((t) => t + 1);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  function handleLoadMore() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    api
      .listEvents(endpointId, { limit: PAGE_LIMIT, cursor: nextCursor })
      .then((data) => {
        setEvents((prev) => [...prev, ...data.events]);
        setNextCursor(data.nextCursor);
        setIsLoadingMore(false);
      })
      .catch((err: unknown) => {
        showToast(
          err instanceof Error ? err.message : "Failed to load more events",
          "error"
        );
        setIsLoadingMore(false);
      });
  }

  function handleReplayConfirm() {
    const event = replayDialog.event;
    if (!event) return;
    setIsReplaying(true);
    api
      .replayEvent(endpointId, event.id)
      .then((result) => {
        setReplayDialog({ event: null, open: false });
        if (result.queued) {
          setEvents((prev) =>
            prev.map((e) =>
              e.id === event.id ? { ...e, status: "PENDING" as EventStatus } : e
            )
          );
          showToast("Event queued for replay", "success");
        } else {
          showToast(result.message ?? "No action taken", "success");
        }
        setIsReplaying(false);
      })
      .catch((err: unknown) => {
        const is429 =
          err instanceof Error &&
          "statusCode" in err &&
          (err as { statusCode: number }).statusCode === 429;
        showToast(
          is429
            ? "Rate limit: max 10 replays per minute"
            : err instanceof Error
              ? err.message
              : "Replay failed",
          "error"
        );
        setReplayDialog({ event: null, open: false });
        setIsReplaying(false);
      });
  }

  const columns: ColumnDef<EventDTO>[] = [
    {
      id: "eventId",
      header: "Event ID",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs">
            {row.original.id.slice(0, 8)}
          </span>
          <CopyButton text={row.original.id} />
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "method",
      header: "Method",
      cell: ({ row }) => (
        <Badge variant="secondary">{row.original.method}</Badge>
      ),
    },
    {
      accessorKey: "receivedAt",
      header: "Received At",
      cell: ({ row }) => (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm text-muted-foreground cursor-default">
                {formatRelativeTime(row.original.receivedAt)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{formatAbsoluteTime(row.original.receivedAt)}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-2 justify-end">
          {row.original.status === "FAILED" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setReplayDialog({ event: row.original, open: true })
              }
            >
              Replay
            </Button>
          )}
          <Link
            href={`/endpoints/${endpointId}/events/${row.original.id}`}
            className="text-sm text-primary hover:underline"
          >
            View
          </Link>
        </div>
      ),
    },
  ];

  const emptyState = (
    <EmptyState
      heading="No events yet"
      description="Send a webhook to this endpoint to see it here."
      action={
        <div className="flex items-center gap-2 mt-2">
          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
            POST http://localhost:3001/webhooks/{endpointId}
          </code>
          <CopyButton text={`http://localhost:3001/webhooks/${endpointId}`} />
        </div>
      }
    />
  );

  return (
    <div className="p-6 space-y-4">
      {toast && (
        <Alert
          variant={toast.type === "error" ? "destructive" : "default"}
          className="fixed top-4 right-4 w-auto max-w-sm z-50"
        >
          <AlertDescription>{toast.message}</AlertDescription>
        </Alert>
      )}

      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground flex items-center gap-1.5">
        <Link href="/endpoints" className="hover:text-foreground">
          Endpoints
        </Link>
        <span>/</span>
        <span className="text-foreground">{endpointName ?? endpointId}</span>
        <span>/</span>
        <span>Events</span>
      </nav>

      {endpointError && (
        <Alert variant="destructive">
          <AlertDescription>{endpointError}</AlertDescription>
        </Alert>
      )}

      {eventsError && (
        <Alert variant="destructive">
          <AlertDescription>{eventsError}</AlertDescription>
        </Alert>
      )}

      <SectionCard
        title={`${endpointName ?? endpointId} — Events`}
        action={
          <Badge className="bg-green-500 text-white animate-pulse">Live</Badge>
        }
      >
        <DataTable
          columns={columns}
          data={events}
          isLoading={isLoading}
          emptyState={emptyState}
        />

        {!isLoading && events.length > 0 && (
          <div className="mt-4 flex justify-center">
            {nextCursor ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Loading…" : "Load more"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                — No more events —
              </p>
            )}
          </div>
        )}
      </SectionCard>

      {/* Replay confirmation dialog */}
      <AlertDialog
        open={replayDialog.open}
        onOpenChange={(open) => {
          if (!open) setReplayDialog({ event: null, open: false });
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replay this event?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be re-queued for delivery to the endpoint.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isReplaying}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReplayConfirm}
              disabled={isReplaying}
            >
              {isReplaying ? "Queuing…" : "Replay"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
