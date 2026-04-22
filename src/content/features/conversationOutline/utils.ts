import { maxLabelLength } from "./constants";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function headingLevel(element: HTMLElement): number {
  const level = Number(element.tagName.replace("H", ""));
  return Number.isFinite(level) ? Math.min(Math.max(level, 1), 6) : 2;
}

export function normalizeLabel(text: string | null | undefined, fallback: string): string {
  const normalized = text?.replace(/\s+/g, " ").trim();
  const label = normalized && normalized.length > 0 ? normalized : fallback;

  return label.length > maxLabelLength ? `${label.slice(0, maxLabelLength - 1)}...` : label;
}

export function cssEscape(value: string): string {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}

export function compareDocumentOrder(a: HTMLElement, b: HTMLElement): number {
  if (a === b) {
    return 0;
  }

  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
}
