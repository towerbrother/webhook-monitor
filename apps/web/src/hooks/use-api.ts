"use client";

import { useMemo } from "react";
import { createApiClient, type ApiClient } from "../lib/api";
import { useProject } from "../context/project-context";

export function useApi(): ApiClient {
  const { activeProjectKey } = useProject();
  return useMemo(() => createApiClient(activeProjectKey), [activeProjectKey]);
}
