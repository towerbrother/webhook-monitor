"use client";

import { useEffect, useState } from "react";
import { SectionCard, Button, Alert, AlertDescription } from "@repo/ui";
import { useApi } from "../../src/hooks/use-api";
import { type EndpointDTO } from "../../src/lib/api";
import { EndpointTable } from "../../src/components/endpoints/endpoint-table";
import { CreateEndpointDialog } from "../../src/components/endpoints/create-endpoint-dialog";
import { DeleteEndpointDialog } from "../../src/components/endpoints/delete-endpoint-dialog";

interface Toast {
  message: string;
  type: "success" | "error";
}

interface FetchState {
  endpoints: EndpointDTO[];
  isLoading: boolean;
  error: string | null;
  refreshId: number;
}

export default function EndpointsPage() {
  const api = useApi();
  const [fetchState, setFetchState] = useState<FetchState>({
    endpoints: [],
    isLoading: true,
    error: null,
    refreshId: 0,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EndpointDTO | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listEndpoints()
      .then((data) => {
        if (!cancelled) {
          setFetchState((prev) => ({
            ...prev,
            endpoints: data,
            isLoading: false,
            error: null,
          }));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFetchState((prev) => ({
            ...prev,
            isLoading: false,
            error:
              err instanceof Error ? err.message : "Failed to load endpoints",
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, fetchState.refreshId]);

  function refresh() {
    setFetchState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      refreshId: prev.refreshId + 1,
    }));
  }

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function handleSuccess(message: string) {
    showToast(message, "success");
    refresh();
  }

  function handleDeleteSuccess(message: string) {
    setDeleteTarget(null);
    showToast(message, "success");
    refresh();
  }

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

      {fetchState.error && (
        <Alert variant="destructive">
          <AlertDescription>{fetchState.error}</AlertDescription>
        </Alert>
      )}

      <SectionCard
        title="Endpoints"
        action={
          <Button onClick={() => setCreateOpen(true)} size="sm">
            New Endpoint
          </Button>
        }
      >
        <EndpointTable
          endpoints={fetchState.endpoints}
          isLoading={fetchState.isLoading}
          onDelete={setDeleteTarget}
        />
      </SectionCard>

      <CreateEndpointDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleSuccess}
      />

      <DeleteEndpointDialog
        endpoint={deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onSuccess={handleDeleteSuccess}
      />
    </div>
  );
}
