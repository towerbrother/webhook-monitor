export interface ProjectDTO {
  id: string;
  name: string;
  createdAt: string;
  maskedKey: string;
}

export interface CreateProjectResponse {
  id: string;
  name: string;
  projectKey: string;
  createdAt: string;
}

export interface EndpointDTO {
  id: string;
  url: string;
  name: string;
  projectId: string;
  createdAt: string;
}

export interface CreateEndpointBody {
  url: string;
  name: string;
  signingSecret?: string;
}

export interface ApiError {
  error: string;
  message: string;
  details?: ValidationIssue[];
}

export interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

export class ValidationError extends Error {
  issues: ValidationIssue[];
  statusCode: number;

  constructor(message: string, issues: ValidationIssue[], statusCode: number) {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
    this.statusCode = statusCode;
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly projectKey: string | null;

  constructor(baseUrl: string, projectKey: string | null = null) {
    this.baseUrl = baseUrl;
    this.projectKey = projectKey;
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...extra,
    };
    if (this.projectKey) {
      headers["X-Project-Key"] = this.projectKey;
    }
    return headers;
  }

  async createProject(name: string): Promise<CreateProjectResponse> {
    const res = await fetch(`${this.baseUrl}/projects`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err: ApiError = await res.json();
      throw new Error(err.message ?? "Failed to create project");
    }
    return res.json() as Promise<CreateProjectResponse>;
  }

  async listProjects(): Promise<ProjectDTO[]> {
    const res = await fetch(`${this.baseUrl}/projects`, {
      headers: this.buildHeaders(),
    });
    if (!res.ok) {
      const err: ApiError = await res.json();
      throw new Error(err.message ?? "Failed to list projects");
    }
    return res.json() as Promise<ProjectDTO[]>;
  }

  async deleteProject(projectId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/projects/${projectId}`, {
      method: "DELETE",
      headers: this.buildHeaders(),
    });
    if (!res.ok && res.status !== 204) {
      const err: ApiError = await res.json();
      throw new Error(err.message ?? "Failed to delete project");
    }
  }

  async listEndpoints(): Promise<EndpointDTO[]> {
    const res = await fetch(`${this.baseUrl}/endpoints`, {
      headers: this.buildHeaders(),
    });
    if (!res.ok) {
      const err: ApiError = await res.json();
      throw new Error(err.message ?? "Failed to list endpoints");
    }
    return res.json() as Promise<EndpointDTO[]>;
  }

  async createEndpoint(body: CreateEndpointBody): Promise<EndpointDTO> {
    const res = await fetch(`${this.baseUrl}/endpoints`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = (await res.json()) as ApiError;
      if (res.status === 400 && err.details) {
        throw new ValidationError(
          err.message ?? "Validation failed",
          err.details,
          400
        );
      }
      throw new Error(err.message ?? "Failed to create endpoint");
    }
    return res.json() as Promise<EndpointDTO>;
  }

  async deleteEndpoint(endpointId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/endpoints/${endpointId}`, {
      method: "DELETE",
      headers: this.buildHeaders(),
    });
    if (!res.ok && res.status !== 204) {
      const err: ApiError = await res.json();
      throw new Error(err.message ?? "Failed to delete endpoint");
    }
  }
}

export function createApiClient(
  projectKey: string | null,
  baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
): ApiClient {
  return new ApiClient(baseUrl, projectKey);
}
