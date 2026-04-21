import { Badge } from "@silo-storage/ui/components/badge";
import { cn } from "@silo-storage/ui/lib/utils";

export function EnvBadge({
  name,
  type,
}: {
  name: string;
  type: string;
}) {
  return (
    <Badge
      className={cn(
        type === "production" &&
          "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        type === "staging" &&
          "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        type === "development" &&
          "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400",
      )}
    >
      {name}
    </Badge>
  );
}
