"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
  Alert,
  AlertDescription,
} from "@repo/ui";
import { useApi } from "../../hooks/use-api";
import { ValidationError } from "../../lib/api";

interface CreateEndpointDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
}

interface FieldErrors {
  url?: string;
  name?: string;
  general?: string;
}

export function CreateEndpointDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateEndpointDialogProps) {
  const api = useApi();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [signingSecret, setSigningSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function resetForm() {
    setName("");
    setUrl("");
    setSigningSecret("");
    setShowSecret(false);
    setFieldErrors({});
  }

  function handleOpenChange(open: boolean) {
    if (!open) resetForm();
    onOpenChange(open);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await api.createEndpoint({
        name: name.trim(),
        url: url.trim(),
        ...(signingSecret.trim() ? { signingSecret: signingSecret.trim() } : {}),
      });
      resetForm();
      onOpenChange(false);
      onSuccess("Endpoint created");
    } catch (err) {
      if (err instanceof ValidationError) {
        const errors: FieldErrors = {};
        for (const issue of err.issues) {
          const field = issue.path[0];
          if (field === "url") errors.url = issue.message;
          else if (field === "name") errors.name = issue.message;
          else errors.general = issue.message;
        }
        setFieldErrors(errors);
      } else if (err instanceof Error) {
        setFieldErrors({ general: err.message });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Endpoint</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {fieldErrors.general && (
            <Alert variant="destructive">
              <AlertDescription>{fieldErrors.general}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="endpoint-name">Name</Label>
            <Input
              id="endpoint-name"
              placeholder="My Webhook"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!fieldErrors.name}
            />
            {fieldErrors.name && (
              <p className="text-sm text-destructive">{fieldErrors.name}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endpoint-url">URL</Label>
            <Input
              id="endpoint-url"
              type="url"
              placeholder="https://example.com/webhook"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-invalid={!!fieldErrors.url}
            />
            {fieldErrors.url && (
              <p className="text-sm text-destructive">{fieldErrors.url}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endpoint-secret">
              Signing Secret{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="endpoint-secret"
                type={showSecret ? "text" : "password"}
                placeholder="whsec_..."
                value={signingSecret}
                onChange={(e) => setSigningSecret(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowSecret((v) => !v)}
              >
                {showSecret ? "Hide" : "Show"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
