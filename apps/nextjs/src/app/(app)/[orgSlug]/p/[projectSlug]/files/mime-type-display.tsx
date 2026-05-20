"use client";

import type * as React from "react";

import { Badge } from "@silo-storage/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@silo-storage/ui/components/tooltip";
import { cn } from "@silo-storage/ui/lib/utils";

const MAX_MIME_TYPE_LENGTH = 32;

function getDisplayMimeType(mimeType: string) {
  if (mimeType.length <= MAX_MIME_TYPE_LENGTH) {
    return mimeType;
  }

  return `${mimeType.slice(0, MAX_MIME_TYPE_LENGTH - 3)}...`;
}

function MimeTypeTooltip({
  mimeType,
  children,
}: {
  mimeType: string;
  children: React.ReactNode;
}) {
  const isTruncated = mimeType.length > MAX_MIME_TYPE_LENGTH;

  if (!isTruncated) {
    return children;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" aria-label={mimeType}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[min(32rem,calc(100vw-2rem))] text-left break-all">
        {mimeType}
      </TooltipContent>
    </Tooltip>
  );
}

function MimeTypeBadge({ mimeType }: { mimeType: string }) {
  return (
    <MimeTypeTooltip mimeType={mimeType}>
      <Badge variant="outline">{getDisplayMimeType(mimeType)}</Badge>
    </MimeTypeTooltip>
  );
}

function MimeTypeText({
  mimeType,
  className,
}: {
  mimeType: string;
  className?: string;
}) {
  return (
    <MimeTypeTooltip mimeType={mimeType}>
      <span className={cn(className)}>{getDisplayMimeType(mimeType)}</span>
    </MimeTypeTooltip>
  );
}

export { MimeTypeBadge, MimeTypeText };
