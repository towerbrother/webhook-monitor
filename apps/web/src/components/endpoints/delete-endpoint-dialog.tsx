"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@repo/ui";
import { useApi } from "../../hooks/use-api";
import { type EndpointDTO } from "../../lib/api";

interface DeleteEndpointDialogProps {
  endpoint: EndpointDTO | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
}

export function DeleteEndpointDialog({
  endpoint,
  onOpenChange,
  onSuccess,
}: DeleteEndpointDialogProps) {
  const api = useApi();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirm() {
    if (!endpoint) return;
    setIsDeleting(true);
    try {
      await api.deleteEndpoint(endpoint.id);
      onOpenChange(false);
      onSuccess("Endpoint deleted");
    } catch {
      onOpenChange(false);
      onSuccess("Failed to delete endpoint");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AlertDialog open={!!endpoint} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {endpoint?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the endpoint and all associated events.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
