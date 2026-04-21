"use client";

import type { LucideIcon } from "lucide-react";
import { TrashIcon } from "lucide-react";
import {
  DownloadIcon,
  FolderIcon,
  KeyRound,
  SettingsIcon,
  Shield,
  UploadIcon,
} from "lucide-react";

import {
  auditCategoryLabels,
  auditResourceTypeLabels,
  getAuditEventDefinition,
} from "@silo-storage/shared";

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

export function formatAuditTimestamp(date: Date): string {
  return new Date(date).toLocaleString();
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function getAuditEventIcon(eventCode: string): LucideIcon {
  const definition = getAuditEventDefinition(eventCode);

  switch (definition.icon) {
    case "upload":
      return UploadIcon;
    case "download":
      return DownloadIcon;
    case "key":
      return KeyRound;
    case "folder":
      return FolderIcon;
    case "shield":
      return Shield;
    case "delete":
      return TrashIcon;
    case "settings":
    default:
      return SettingsIcon;
  }
}

export function getAuditEventLabel(eventCode: string): string {
  return getAuditEventDefinition(eventCode).shortLabel;
}

export function getAuditEventColor(eventCode: string): string {
  const definition = getAuditEventDefinition(eventCode);
  switch (definition.badgeTone) {
    case "green":
      return "text-green-500";
    case "yellow":
      return "text-yellow-500";
    case "red":
      return "text-red-500";
    case "blue":
      return "text-blue-500";
    case "slate":
    default:
      return "text-muted-foreground";
  }
}

export function getAuditEventBgColor(eventCode: string): string {
  const definition = getAuditEventDefinition(eventCode);
  switch (definition.badgeTone) {
    case "green":
      return "bg-green-500/10";
    case "yellow":
      return "bg-yellow-500/10";
    case "red":
      return "bg-red-500/10";
    case "blue":
      return "bg-blue-500/10";
    case "slate":
    default:
      return "bg-muted";
  }
}

export function getAuditCategoryLabel(category: string) {
  return auditCategoryLabels[category as keyof typeof auditCategoryLabels] || category;
}

export function getAuditResourceTypeLabel(resourceType: string) {
  return (
    auditResourceTypeLabels[
      resourceType as keyof typeof auditResourceTypeLabels
    ] || resourceType
  );
}

export function formatAuditValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? `${value}` : "—";
  if (Array.isArray(value)) return value.map((item) => formatAuditValue(item)).join(", ");
  return JSON.stringify(value, null, 2);
}
