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

export type EventStatus = "PENDING" | "RETRYING" | "DELIVERED" | "FAILED";

export interface EventDTO {
  id: string;
  status: EventStatus;
  idempotencyKey: string | null;
  receivedAt: string;
  method: string;
  headers: Record<string, unknown>;
}

export interface DeliveryAttemptDTO {
  id: string;
  attemptNumber: number;
  requestedAt: string;
  respondedAt: string | null;
  statusCode: number | null;
  success: boolean;
  errorMessage: string | null;
}

export interface EventDetailDTO extends EventDTO {
  body: unknown;
  deliveryAttempts: DeliveryAttemptDTO[];
}

export interface EventListResponse {
  events: EventDTO[];
  nextCursor: string | null;
}

export interface ReplayResponse {
  queued: boolean;
  eventId?: string;
  message?: string;
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

  async getEndpoint(endpointId: string): Promise<EndpointDTO> {
    const res = await fetch(`${this.baseUrl}/endpoints/${endpointId}`, {
      headers: this.buildHeaders(),
    });
    if (!res.ok) {
      const err: ApiError = await res.json();
      throw new Error(err.message ?? "Failed to get endpoint");
    }
    return res.json() as Promise<EndpointDTO>;
  }

  async listEvents(
    endpointId: string,
    params: { limit?: number; cursor?: string } = {}
  ): Promise<EventListResponse> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.cursor) query.set("cursor", params.cursor);
    const qs = query.toString();
    const res = await fetch(
      `${this.baseUrl}/webhooks/${endpointId}/events${qs ? `?${qs}` : ""}`,
      { headers: this.buildHeaders() }
    );
    if (!res.ok) {
      const err: ApiError = await res.json();
      throw new Error(err.message ?? "Failed to list events");
    }
    return res.json() as Promise<EventListResponse>;
  }

  async getEvent(endpointId: string, eventId: string): Promise<EventDetailDTO> {
    const res = await fetch(
      `${this.baseUrl}/webhooks/${endpointId}/events/${eventId}`,
      { headers: this.buildHeaders() }
    );
    if (!res.ok) {
      const err: ApiError = await res.json();
      throw Object.assign(new Error(err.message ?? "Failed to get event"), {
        statusCode: res.status,
      });
    }
    return res.json() as Promise<EventDetailDTO>;
  }

  async replayEvent(
    endpointId: string,
    eventId: string
  ): Promise<ReplayResponse> {
    const res = await fetch(
      `${this.baseUrl}/webhooks/${endpointId}/events/${eventId}/replay`,
      { method: "POST", headers: this.buildHeaders() }
    );
    if (res.status === 429) {
      throw Object.assign(new Error("Rate limit: max 10 replays per minute"), {
        statusCode: 429,
      });
    }
    if (!res.ok && res.status !== 200 && res.status !== 202) {
      const err: ApiError = await res.json();
      throw new Error(err.message ?? "Failed to replay event");
    }
    return res.json() as Promise<ReplayResponse>;
  }
}

export function createApiClient(
  projectKey: string | null,
  baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
): ApiClient {
  return new ApiClient(baseUrl, projectKey);
}
