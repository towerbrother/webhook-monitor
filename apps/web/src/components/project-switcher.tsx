"use client";

import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Button,
} from "@repo/ui";
import { type ProjectDTO, createApiClient } from "../lib/api";
import { useProject } from "../context/project-context";
import { NewProjectDialog } from "./new-project-dialog";

export function ProjectSwitcher() {
  const { activeProjectId, projectName, setActiveProject, clearProject } =
    useProject();
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [keyPromptProjectId, setKeyPromptProjectId] = useState<string | null>(
    null
  );
  const [enteredKey, setEnteredKey] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);

  useEffect(() => {
    createApiClient(null)
      .listProjects()
      .then((data) => setProjects(data))
      .catch(() => undefined);
  }, []);

  function fetchProjects() {
    createApiClient(null)
      .listProjects()
      .then((data) => setProjects(data))
      .catch(() => undefined);
  }

  function handleSelectProject(project: ProjectDTO) {
    setKeyPromptProjectId(project.id);
    setEnteredKey("");
    setKeyError(null);
  }

  function handleKeySubmit(project: ProjectDTO) {
    if (!enteredKey.trim()) {
      setKeyError("Project key is required");
      return;
    }
    setActiveProject(project.id, enteredKey.trim(), project.name);
    setKeyPromptProjectId(null);
    setEnteredKey("");
    setKeyError(null);
  }

  const promptedProject = projects.find((p) => p.id === keyPromptProjectId);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-start truncate">
            {projectName ?? "Select Project"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          {projects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onSelect={() => handleSelectProject(project)}
              className={activeProjectId === project.id ? "font-medium" : ""}
            >
              {project.name}
            </DropdownMenuItem>
          ))}
          {projects.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={() => setDialogOpen(true)}>
            + New Project
          </DropdownMenuItem>
          {activeProjectId && (
            <DropdownMenuItem
              onSelect={clearProject}
              className="text-destructive"
            >
              Clear Active Project
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {promptedProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg p-6 w-80 space-y-4 shadow-lg">
            <h3 className="font-medium">Enter Project Key</h3>
            <p className="text-sm text-muted-foreground">
              Enter the project key for{" "}
              <strong>{promptedProject.name}</strong>
            </p>
            <input
              type="password"
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="Project key"
              value={enteredKey}
              onChange={(e) => setEnteredKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleKeySubmit(promptedProject);
              }}
              autoFocus
            />
            {keyError && (
              <p className="text-destructive text-sm">{keyError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setKeyPromptProjectId(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleKeySubmit(promptedProject)}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}

      <NewProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchProjects}
      />
    </>
  );
}
