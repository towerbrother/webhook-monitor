import type { Job, WebhookDeliveryJobData } from "@repo/queue";
import { EventStatus, canTransition, type PrismaClient } from "@repo/db";
import { deliveryAttemptsTotal, deliveryDurationMs } from "@repo/shared";
import type { Logger } from "./logger.js";

export interface ProcessorContext {
  logger: Logger;
  prisma: PrismaClient;
}

/**
 * Custom error thrown when an HTTP delivery attempt returns a non-2xx status.
 * Throwing causes BullMQ to schedule a retry according to the queue backoff config.
 */
export class DeliveryError extends Error {
  constructor(
    public readonly statusCode: number | undefined,
    public readonly deliveryMessage: string,
    public readonly eventId: string
  ) {
    super(
      `Delivery failed for event ${eventId}: ${deliveryMessage}${statusCode !== undefined ? ` (HTTP ${statusCode})` : ""}`
    );
    this.name = "DeliveryError";
  }
}

/**
 * Process a webhook delivery job.
 *
 * Makes an outbound HTTP POST to the endpoint URL, records a DeliveryAttempt,
 * updates Event.status, and throws DeliveryError on non-2xx so BullMQ retries.
 */
export async function processWebhookDelivery(
  job: Job<WebhookDeliveryJobData>,
  context: ProcessorContext
): Promise<void> {
  const { eventId, projectId, endpointId, url, method, headers, body } =
    job.data;
  const { logger, prisma } = context;

  const correlationId = job.data.correlationId ?? job.id;
  const attemptNumber = job.attemptsMade + 1;
  const maxAttempts = job.opts?.attempts ?? 5;
  const requestedAt = new Date();

  logger.info(
    {
      eventId,
      projectId,
      endpointId,
      correlationId,
      url,
      attempt: attemptNumber,
      jobId: job.id,
    },
    "Processing webhook delivery job"
  );

  // ── HTTP delivery ────────────────────────────────────────────────────────
  let statusCode: number | undefined;
  let success = false;
  let errorMessage: string | undefined;
  let respondedAt: Date;

  try {
    const response = await fetch(url, {
      method: method ?? "POST",
      headers: headers as Record<string, string>,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });

    respondedAt = new Date();
    statusCode = response.status;
    success = response.ok;

    if (!response.ok) {
      errorMessage = `HTTP ${response.status} ${response.statusText}`;
    }
  } catch (err) {
    respondedAt = new Date();
    success = false;
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  // ── Determine new event status ────────────────────────────────────────────
  const isLastAttempt = attemptNumber >= maxAttempts;
  const newStatus = success
    ? EventStatus.DELIVERED
    : isLastAttempt
      ? EventStatus.FAILED
      : EventStatus.RETRYING;

  // ── Persist DeliveryAttempt + Event.status in one transaction ─────────────
  try {
    await prisma.$transaction(async (tx) => {
      const event = await tx.event.findUnique({
        where: { id: eventId },
        select: { status: true },
      });

      if (!event) {
        logger.error(
          { eventId, projectId, correlationId },
          "Event not found during delivery"
        );
        return;
      }

      // Short-circuit if event is already terminal (e.g. duplicate job execution)
      if (event.status === EventStatus.DELIVERED) {
        logger.info(
          { eventId, correlationId },
          "Event already delivered, skipping status update"
        );
        return;
      }

      if (canTransition(event.status, newStatus)) {
        await tx.event.update({
          where: { id: eventId },
          data: { status: newStatus },
        });
      }

      await tx.deliveryAttempt.create({
        data: {
          eventId,
          projectId,
          attemptNumber,
          requestedAt,
          respondedAt: respondedAt!,
          statusCode: statusCode ?? null,
          success,
          errorMessage: errorMessage ?? null,
        },
      });
    });
  } catch (dbError) {
    logger.error(
      {
        eventId,
        projectId,
        correlationId,
        error: dbError instanceof Error ? dbError.message : String(dbError),
      },
      "Failed to persist delivery attempt"
    );
    // Re-throw so BullMQ retries the job
    throw dbError;
  }

  // ── Record Prometheus metrics ─────────────────────────────────────────────
  const durationMs = respondedAt!.getTime() - requestedAt.getTime();
  const successLabel = success ? "true" : "false";
  deliveryAttemptsTotal.inc({ project_id: projectId, success: successLabel });
  deliveryDurationMs.observe(
    { project_id: projectId, success: successLabel },
    durationMs
  );

  if (success) {
    logger.info(
      {
        eventId,
        projectId,
        correlationId,
        statusCode,
        attempt: attemptNumber,
        jobId: job.id,
      },
      "Webhook delivery successful"
    );
  } else {
    logger.error(
      {
        eventId,
        projectId,
        correlationId,
        statusCode,
        errorMessage,
        attempt: attemptNumber,
        jobId: job.id,
        isLastAttempt,
      },
      "Webhook delivery failed"
    );
    // Throw so BullMQ manages the retry timeline
    throw new DeliveryError(
      statusCode,
      errorMessage ?? "Unknown error",
      eventId
    );
  }
}
