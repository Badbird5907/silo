import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

const linkClassName =
  "text-primary inline-flex items-center gap-0.5 font-medium underline-offset-4 hover:underline";

export function ExternalTextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClassName}
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}
