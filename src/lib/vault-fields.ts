// Pure rules for vault uploads: allowed types by extension, size, and categories.

export const MAX_DOC_BYTES = 4 * 1024 * 1024;

export const DOC_CATEGORIES = [
  { id: "legal", label: "Legal" },
  { id: "financial", label: "Financial" },
  { id: "tax", label: "Tax" },
  { id: "investment", label: "Investment" },
  { id: "hr", label: "HR" },
  { id: "compliance", label: "Compliance" },
  { id: "playbook", label: "Playbook" },
  { id: "other", label: "Other" },
] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number]["id"];
export const isDocCategory = (v: unknown): v is DocCategory => DOC_CATEGORIES.some((c) => c.id === v);
export const docCategoryLabel = (id: string) => DOC_CATEGORIES.find((c) => c.id === id)?.label ?? id;

/** The type is decided by the extension, never by what the browser claims. */
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  txt: "text/plain",
};
export const ALLOWED_EXTENSIONS = Object.keys(TYPES);

export function mimeFor(fileName: string): string | null {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return ext ? TYPES[ext] ?? null : null;
}

/** A safe download name: no paths, quotes or control characters. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const clean = base.replace(/[^\w.\- ()]/g, "_").replace(/^\.+/, "").slice(0, 120);
  return clean || "file";
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
