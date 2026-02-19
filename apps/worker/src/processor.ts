import type { Job, WebhookDeliveryJobData } from "@repo/queue";

export interface ProcessorContext {
  logger: {
    info: (obj: Record<string, unknown>, msg: string) => void;
    error: (obj: Record<string, unknown>, msg: string) => void;
  };
}

/**
 * Process a webhook delivery job.
 *
 * Step 3: Logs job data (placeholder for actual delivery)
 * Step 4: Will add HTTP delivery logic
 * Step 5: Will add event status updates
 */
export async function processWebhookDelivery(
  job: Job<WebhookDeliveryJobData>,
  context: ProcessorContext
): Promise<void> {
  const { eventId, projectId, endpointId, url, attempt } = job.data;

  context.logger.info(
    { eventId, projectId, endpointId, url, attempt, jobId: job.id },
    "Processing webhook delivery job"
  );

  // Placeholder: Simulate processing time
  // In Step 4, this becomes actual HTTP delivery
  await new Promise((resolve) => setTimeout(resolve, 100));

  context.logger.info(
    { eventId, projectId, jobId: job.id },
    "Webhook delivery job completed (placeholder)"
  );
}
