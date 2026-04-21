"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { Input } from "@silo-storage/ui/components/input";
import { cn } from "@silo-storage/ui/lib/utils";

interface SelectChildProps {
  children?: React.ReactNode;
  textValue?: string;
}

function getSearchText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getSearchText).join(" ");
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return getSearchText(node.props.children);
  }

  return "";
}

function filterSelectChildren(
  children: React.ReactNode,
  query: string,
): { children: React.ReactNode[]; hasMatch: boolean } {
  const normalizedQuery = query.trim().toLowerCase();
  const items = React.Children.toArray(children);

  if (!normalizedQuery) {
    return { children: items, hasMatch: items.length > 0 };
  }

  const filteredChildren: React.ReactNode[] = [];
  const pendingDecorators: React.ReactNode[] = [];
  let hasMatch = false;

  for (const child of items) {
    if (!React.isValidElement<SelectChildProps>(child)) {
      continue;
    }

    if (child.type === React.Fragment) {
      const result = filterSelectChildren(child.props.children, normalizedQuery);

      if (result.hasMatch) {
        filteredChildren.push(...pendingDecorators.splice(0));
        filteredChildren.push(
          <React.Fragment key={child.key}>{result.children}</React.Fragment>,
        );
        hasMatch = true;
      }

      continue;
    }

    if (
      child.type === SelectLabel ||
      child.type === SelectSeparator ||
      child.type === SelectPrimitive.Label ||
      child.type === SelectPrimitive.Separator
    ) {
      pendingDecorators.push(child);
      continue;
    }

    if (child.type === SelectGroup || child.type === SelectPrimitive.Group) {
      const result = filterSelectChildren(child.props.children, normalizedQuery);

      if (result.hasMatch) {
        filteredChildren.push(...pendingDecorators.splice(0));
        filteredChildren.push(
          React.cloneElement(child, undefined, result.children),
        );
        hasMatch = true;
      }

      continue;
    }

    if (child.type === SelectItem || child.type === SelectPrimitive.Item) {
      const itemText =
        typeof child.props.textValue === "string"
          ? child.props.textValue
          : getSearchText(child.props.children);

      if (itemText.toLowerCase().includes(normalizedQuery)) {
        filteredChildren.push(...pendingDecorators.splice(0));
        filteredChildren.push(child);
        hasMatch = true;
      }

      continue;
    }

    filteredChildren.push(...pendingDecorators.splice(0));
    filteredChildren.push(child);
  }

  return { children: filteredChildren, hasMatch };
}

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  children,
  showIcon = false,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  showIcon?: boolean;
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "border-input data-placeholder:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      {showIcon && (
        <SelectPrimitive.Icon asChild>
          <ChevronDownIcon className="size-4 opacity-50" />
        </SelectPrimitive.Icon>
      )}
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "popper",
  searchable = false,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content> & {
  searchable?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const { children: filteredChildren, hasMatch } = React.useMemo(
    () => filterSelectChildren(children, query),
    [children, query],
  );

  React.useEffect(() => {
    if (!searchable) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const input = searchInputRef.current;
      if (!input || document.activeElement === input) {
        return;
      }

      input.focus();
      const cursorPosition = input.value.length;
      input.setSelectionRange(cursorPosition, cursorPosition);
    });

    return () => cancelAnimationFrame(frame);
  }, [query, searchable]);

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-96 min-w-32 overflow-hidden rounded-md border shadow-md",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        {searchable && (
          <div className="border-b p-1">
            <Input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDownCapture={(event) => {
                if (event.key !== "Escape") {
                  event.stopPropagation();
                }
              }}
              placeholder="Search..."
              autoFocus
              className="h-8"
            />
          </div>
        )}
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1",
          )}
        >
          {hasMatch ? (
            filteredChildren
          ) : (
            <div className="text-muted-foreground px-2 py-1.5 text-sm">
              No results found.
            </div>
          )}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("text-muted-foreground px-2 py-1.5 text-xs", className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
