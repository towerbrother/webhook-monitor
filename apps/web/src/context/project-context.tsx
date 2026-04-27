"use client";

import { createContext, useContext, useState } from "react";

interface ProjectState {
  activeProjectId: string | null;
  activeProjectKey: string | null;
  projectName: string | null;
}

interface ProjectContextValue extends ProjectState {
  setActiveProject: (id: string, key: string, name: string) => void;
  clearProject: () => void;
}

const STORAGE_KEY = "wm_active_project";

interface StoredProject {
  id: string;
  key: string;
  name: string;
}

const initialState: ProjectState = {
  activeProjectId: null,
  activeProjectKey: null,
  projectName: null,
};

function readFromStorage(): ProjectState {
  if (typeof window === "undefined") return initialState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as StoredProject;
      return {
        activeProjectId: stored.id,
        activeProjectKey: stored.key,
        projectName: stored.name,
      };
    }
  } catch {
    // ignore malformed localStorage
  }
  return initialState;
}

const ProjectContext = createContext<ProjectContextValue>({
  ...initialState,
  setActiveProject: () => undefined,
  clearProject: () => undefined,
});

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ProjectState>(readFromStorage);

  function setActiveProject(id: string, key: string, name: string) {
    const next: ProjectState = {
      activeProjectId: id,
      activeProjectKey: key,
      projectName: name,
    };
    setState(next);
    const stored: StoredProject = { id, key, name };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }

  function clearProject() {
    setState(initialState);
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <ProjectContext.Provider
      value={{ ...state, setActiveProject, clearProject }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  return useContext(ProjectContext);
}
