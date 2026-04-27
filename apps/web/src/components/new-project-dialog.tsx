"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Label,
  Alert,
  AlertDescription,
  CopyButton,
} from "@repo/ui";
import { createApiClient } from "../lib/api";
import { useProject } from "../context/project-context";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function NewProjectDialog({
  open,
  onOpenChange,
  onSuccess,
}: NewProjectDialogProps) {
  const { setActiveProject } = useProject();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [createdProject, setCreatedProject] = useState<{
    id: string;
    name: string;
    projectKey: string;
  } | null>(null);

  function handleClose() {
    if (createdProject) {
      onSuccess?.();
    }
    setName("");
    setError(null);
    setCreatedProject(null);
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const api = createApiClient(null);
      const project = await api.createProject(name.trim());
      setActiveProject(project.id, project.projectKey, project.name);
      setCreatedProject(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Projects scope your webhook endpoints and events.
          </DialogDescription>
        </DialogHeader>

        {!createdProject ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                placeholder="My Project"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Creating..." : "Create Project"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                <strong>Copy your project key now</strong> — it will not be
                shown again.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label>Project Key</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={createdProject.projectKey}
                  className="font-mono text-sm"
                />
                <CopyButton text={createdProject.projectKey} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
