import { CheckCircle2, Clock, Trash2, XCircle } from "lucide-react";

import { Badge } from "@silo-storage/ui/components/badge";

type FileStatus = "completed" | "pending" | "failed" | "deleted";

interface FileStatusBadgeProps {
  status: string;
}

function normalizeFileStatus(status: string): FileStatus {
  if (
    status === "completed" ||
    status === "pending" ||
    status === "failed" ||
    status === "deleted"
  ) {
    return status;
  }
  return "failed";
}

export function FileStatusBadge({ status }: FileStatusBadgeProps) {
  const normalizedStatus = normalizeFileStatus(status);

  if (normalizedStatus === "completed") {
    return (
      <Badge variant="default" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Completed
      </Badge>
    );
  }

  if (normalizedStatus === "pending") {
    return (
      <Badge variant="secondary" className="border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400">
        <Clock className="mr-1 h-3 w-3" />
        Pending
      </Badge>
    );
  }

  if (normalizedStatus === "deleted") {
    return (
      <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30">
        <Trash2 className="mr-1 h-3 w-3" />
        Deleted
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400">
      <XCircle className="mr-1 h-3 w-3" />
      Failed
    </Badge>
  );
}
