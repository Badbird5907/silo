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
      <Badge variant="default" className="bg-green-600 text-white hover:bg-green-700">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Completed
      </Badge>
    );
  }

  if (normalizedStatus === "pending") {
    return (
      <Badge variant="secondary" className="bg-yellow-500 text-white hover:bg-yellow-600">
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
    <Badge variant="destructive" className="bg-red-600 text-white hover:bg-red-700">
      <XCircle className="mr-1 h-3 w-3" />
      Failed
    </Badge>
  );
}
