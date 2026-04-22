"use client";

import { Link2Icon } from "lucide-react";

import { GitHubIcon } from "@/components/github-icon";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface DocsPageActionsProps {
  githubUrl: string;
  markdownPath: string;
}

export function DocsPageActions({
  githubUrl,
  markdownPath,
}: DocsPageActionsProps) {
  async function copyMarkdownLink() {
    const url = new URL(markdownPath, window.location.origin).toString();
    await navigator.clipboard.writeText(url);
  }

  function openGithubPage() {
    window.open(githubUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex shrink-0 items-start justify-end md:pt-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Page links"
          className={cn(
            buttonVariants({
              variant: "outline",
              size: "icon-sm",
            }),
            "text-fd-muted-foreground hover:text-fd-foreground",
          )}
        >
          <Link2Icon className="size-4" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-48 min-w-48">
          <DropdownMenuItem onClick={copyMarkdownLink}>
            <Link2Icon className="size-4" />
            Copy MDX Link
          </DropdownMenuItem>

          <DropdownMenuItem onClick={openGithubPage}>
            <GitHubIcon className="size-4" />
            View On GitHub
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
