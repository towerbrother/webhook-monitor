import { Badge } from "./ui/badge";

export type EventStatus = "PENDING" | "RETRYING" | "DELIVERED" | "FAILED";

const statusConfig: Record<
  EventStatus,
  {
    label: string;
    variant: "warning" | "secondary" | "success" | "destructive";
  }
> = {
  PENDING: { label: "Pending", variant: "warning" },
  RETRYING: { label: "Retrying", variant: "secondary" },
  DELIVERED: { label: "Delivered", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
};

export function StatusBadge({ status }: { status: EventStatus }) {
  const { label, variant } = statusConfig[status];
  return <Badge variant={variant}>{label}</Badge>;
}
