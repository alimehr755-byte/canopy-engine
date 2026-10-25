import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function formatPercent(value: number, precision = 0): string {
  return `${value.toFixed(precision)}%`;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function sourceTypeLabel(type: string): string {
  switch (type) {
    case "INTERNET":
      return "Internet";
    case "PUBLICATION":
      return "Publication";
    case "REPOSITORY":
      return "Student paper";
    default:
      return type;
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "Complete";
    case "PROCESSING":
      return "Analyzing";
    case "QUEUED":
      return "Queued";
    case "FAILED":
      return "Failed";
    default:
      return status;
  }
}

export function truncate(value: string, length = 180): string {
  if (value.length <= length) {
    return value;
  }
  return `${value.slice(0, length).trimEnd()}…`;
}
