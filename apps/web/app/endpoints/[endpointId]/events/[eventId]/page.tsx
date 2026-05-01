"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
  EmptyState,
  Skeleton,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@repo/ui";
import { useApi } from "../../../../../src/hooks/use-api";
import {
  type EventDetailDTO,
  type DeliveryAttemptDTO,
  type EventStatus,
} from "../../../../../src/lib/api";

interface Toast {
  message: string;
  type: "success" | "error";
}

function formatAbsolute(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function durationMs(requestedAt: string, respondedAt: string | null): string {
  if (!respondedAt) return "—";
  return `${new Date(respondedAt).getTime() - new Date(requestedAt).getTime()} ms`;
}

function statusCodeColor(code: number | null): string {
  if (!code) return "bg-muted text-muted-foreground";
  if (code >= 200 && code < 300) return "bg-http-2xx-bg text-http-2xx-fg";
  if (code >= 300 && code < 400) return "bg-http-3xx-bg text-http-3xx-fg";
  if (code >= 400 && code < 500) return "bg-http-4xx-bg text-http-4xx-fg";
  return "bg-http-5xx-bg text-http-5xx-fg";
}

function HeadersTable({ headers }: { headers: Record<string, unknown> }) {
  const entries = Object.entries(headers);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? entries : entries.slice(0, 8);

  return (
    <div className="space-y-1">
      <div className="flex justify-end mb-2">
        <CopyButton text={JSON.stringify(headers, null, 2)} />
      </div>
      <div className="rounded border overflow-hidden">
        <table className="w-full text-xs">
          <tbody>
            {visible.map(([key, value]) => (
              <tr key={key} className="border-b last:border-b-0">
                <td className="px-3 py-1.5 font-mono text-muted-foreground w-1/3 align-top">
                  {key}
                </td>
                <td className="px-3 py-1.5 font-mono break-all">
                  {String(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entries.length > 8 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs"
        >
          {showAll
            ? "Show fewer headers"
            : `Show all ${entries.length} headers`}
        </Button>
      )}
    </div>
  );
}

function BodyBlock({ body }: { body: unknown }) {
  if (body === null || body === undefined || body === "") {
    return <EmptyState heading="No request body" />;
  }
  const text =
    typeof body === "object" ? JSON.stringify(body, null, 2) : String(body);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <CopyButton text={text} />
      </div>
      <pre className="bg-muted rounded p-3 text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap break-all">
        {text}
      </pre>
    </div>
  );
}

function DeliveryAttemptRow({ attempt }: { attempt: DeliveryAttemptDTO }) {
  return (
    <div className="flex flex-col gap-1 py-3">
      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
          {attempt.attemptNumber}
        </span>
        <span className="text-sm text-muted-foreground">
          {formatAbsolute(attempt.requestedAt)}
        </span>
        <span className="text-sm text-muted-foreground">
          {durationMs(attempt.requestedAt, attempt.respondedAt)}
        </span>
        {attempt.statusCode !== null && (
          <span
            className={`text-xs font-mono px-1.5 py-0.5 rounded ${statusCodeColor(attempt.statusCode)}`}
          >
            {attempt.statusCode}
          </span>
        )}
        <span
          className={`text-xs font-medium ${attempt.success ? "text-green-600" : "text-red-600"}`}
        >
          {attempt.success ? "✓ Success" : "✗ Failed"}
        </span>
      </div>
      {attempt.errorMessage && (
        <Alert variant="destructive" className="mt-1 ml-9 py-2">
          <AlertDescription className="text-xs font-mono">
            {attempt.errorMessage}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default function EventDetailPage() {
  const params = useParams<{ endpointId: string; eventId: string }>();
  const { endpointId, eventId } = params;
  const api = useApi();
  const router = useRouter();

  const [event, setEvent] = useState<EventDetailDTO | null>(null);
  const [endpointName, setEndpointName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [replayOpen, setReplayOpen] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  const fetchEvent = useCallback(() => {
    api
      .getEvent(endpointId, eventId)
      .then((data) => {
        setEvent(data);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        const statusCode =
          err instanceof Error &&
          "statusCode" in err &&
          (err as { statusCode: number }).statusCode === 404
            ? 404
            : null;
        if (statusCode === 404) {
          router.push(`/endpoints/${endpointId}/events`);
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load event");
        setIsLoading(false);
      });
  }, [api, endpointId, eventId, router]);

  useEffect(() => {
    fetchEvent();
  }, [fetchEvent]);

  // Fetch endpoint name for breadcrumb
  useEffect(() => {
    let cancelled = false;
    api
      .getEndpoint(endpointId)
      .then((ep) => {
        if (!cancelled) setEndpointName(ep.name);
      })
      .catch(() => {
        // breadcrumb falls back to ID
      });
    return () => {
      cancelled = true;
    };
  }, [api, endpointId]);

  function handleReplayConfirm() {
    setIsReplaying(true);
    api
      .replayEvent(endpointId, eventId)
      .then((result) => {
        setReplayOpen(false);
        if (result.queued) {
          setEvent((prev) =>
            prev ? { ...prev, status: "PENDING" as EventStatus } : prev
          );
          showToast("Queued for replay", "success");
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
        setReplayOpen(false);
        setIsReplaying(false);
      });
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>{error ?? "Event not found"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const shortId = event.id.slice(0, 8);

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
        <Link
          href={`/endpoints/${endpointId}/events`}
          className="hover:text-foreground"
        >
          {endpointName ?? endpointId}
        </Link>
        <span>/</span>
        <Link
          href={`/endpoints/${endpointId}/events`}
          className="hover:text-foreground"
        >
          Events
        </Link>
        <span>/</span>
        <span className="text-foreground font-mono">{shortId}</span>
      </nav>

      {/* Event Overview */}
      <SectionCard
        title="Event Overview"
        action={
          event.status === "FAILED" ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setReplayOpen(true)}
            >
              Replay
            </Button>
          ) : undefined
        }
      >
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Status</p>
            <StatusBadge status={event.status} />
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Method</p>
            <Badge variant="secondary">{event.method}</Badge>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Event ID</p>
            <div className="flex items-center gap-1.5 font-mono text-xs">
              {event.id}
              <CopyButton text={event.id} />
            </div>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">
              Idempotency Key
            </p>
            {event.idempotencyKey ? (
              <div className="flex items-center gap-1.5 font-mono text-xs">
                {event.idempotencyKey}
                <CopyButton text={event.idempotencyKey} />
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
          <div className="col-span-2">
            <p className="text-muted-foreground text-xs mb-0.5">Received At</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-default">
                    {formatAbsolute(event.receivedAt)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{event.receivedAt}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </SectionCard>

      {/* Request Headers */}
      <SectionCard title="Request Headers">
        <HeadersTable headers={event.headers} />
      </SectionCard>

      {/* Request Body */}
      <SectionCard title="Request Body">
        <BodyBlock body={event.body} />
      </SectionCard>

      {/* Delivery Attempts */}
      <SectionCard title="Delivery Attempts">
        {event.deliveryAttempts.length === 0 ? (
          <EmptyState heading="No delivery attempts yet" />
        ) : (
          <div>
            {event.deliveryAttempts.map((attempt, i) => (
              <div key={attempt.id}>
                <DeliveryAttemptRow attempt={attempt} />
                {i < event.deliveryAttempts.length - 1 && <Separator />}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Replay confirmation dialog */}
      <AlertDialog open={replayOpen} onOpenChange={setReplayOpen}>
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
