import { createHash } from "node:crypto";
import { createExtractorFromData } from "node-unrar-js";
import { Open } from "unzipper";

export const MAX_ARCHIVE_FILES = 1_000;
export const MAX_EXTRACTED_BYTES = 100 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRY_BYTES = 25 * 1024 * 1024;
export const MAX_ARCHIVE_PATH_LENGTH = 400;

export type ProjectFileEntry = {
  relativePath: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  data: Buffer;
};

export type ProjectArchive = {
  format: "zip" | "rar" | "file";
  isArchive: boolean;
  archiveName: string;
  fileCount: number;
  totalBytes: number;
  entries: ProjectFileEntry[];
};

const contentTypes: Record<string, string> = {
  json: "application/json",
  js: "text/javascript",
  jsx: "text/javascript",
  ts: "text/typescript",
  tsx: "text/typescript",
  css: "text/css",
  html: "text/html",
  htm: "text/html",
  md: "text/markdown",
  txt: "text/plain",
  yaml: "application/yaml",
  yml: "application/yaml",
  xml: "application/xml",
  csv: "text/csv",
  py: "text/x-python",
  sh: "text/x-shellscript",
  sql: "application/sql",
  toml: "application/toml",
  env: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

function contentTypeFor(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return contentTypes[extension] ?? "application/octet-stream";
}

export function normalizeArchivePath(rawPath: string) {
  const normalized = rawPath.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) throw new Error("Archive contains an unsafe file path");
  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length || parts.some(part => part === "." || part === ".." || part.includes("\0"))) {
    throw new Error("Archive contains an unsafe file path");
  }
  const relativePath = parts.join("/");
  if (relativePath.length > MAX_ARCHIVE_PATH_LENGTH) {
    throw new Error(`Archive file paths cannot exceed ${MAX_ARCHIVE_PATH_LENGTH} characters`);
  }
  return relativePath;
}

function assertEntryLimits(fileCount: number, totalBytes: number, relativePath: string, sizeBytes: number) {
  if (fileCount > MAX_ARCHIVE_FILES) throw new Error(`Archives are limited to ${MAX_ARCHIVE_FILES} files`);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > MAX_ARCHIVE_ENTRY_BYTES) {
    throw new Error(`Archive entry ${relativePath} exceeds the ${MAX_ARCHIVE_ENTRY_BYTES / (1024 * 1024)} MB file limit`);
  }
  if (totalBytes > MAX_EXTRACTED_BYTES) {
    throw new Error(`The unpacked project exceeds the ${MAX_EXTRACTED_BYTES / (1024 * 1024)} MB total limit`);
  }
}

function toEntry(relativePath: string, data: Buffer): ProjectFileEntry {
  return {
    relativePath,
    fileName: relativePath.split("/").pop() ?? relativePath,
    contentType: contentTypeFor(relativePath),
    sizeBytes: data.length,
    checksumSha256: createHash("sha256").update(data).digest("hex"),
    data,
  };
}

async function extractZip(buffer: Buffer, archiveName: string): Promise<ProjectArchive> {
  const directory = await Open.buffer(buffer);
  const fileEntries = directory.files.filter(file => file.type === "File");
  if (!fileEntries.length) throw new Error("The ZIP archive does not contain any files");
  if (fileEntries.length > MAX_ARCHIVE_FILES) throw new Error(`Archives are limited to ${MAX_ARCHIVE_FILES} files`);

  let totalBytes = 0;
  for (const file of fileEntries) {
    const relativePath = normalizeArchivePath(file.path);
    totalBytes += file.uncompressedSize;
    assertEntryLimits(fileEntries.length, totalBytes, relativePath, file.uncompressedSize);
  }

  const entries: ProjectFileEntry[] = [];
  for (const file of fileEntries) {
    const relativePath = normalizeArchivePath(file.path);
    const data = await file.buffer();
    if (data.length > MAX_ARCHIVE_ENTRY_BYTES) throw new Error(`Archive entry ${relativePath} exceeds the file limit`);
    entries.push(toEntry(relativePath, data));
  }
  return { format: "zip", isArchive: true, archiveName, fileCount: entries.length, totalBytes: entries.reduce((sum, entry) => sum + entry.sizeBytes, 0), entries };
}

async function extractRar(buffer: Buffer, archiveName: string): Promise<ProjectArchive> {
  const archiveData = new Uint8Array(buffer.byteLength);
  archiveData.set(buffer);
  const extractor = await createExtractorFromData({ data: archiveData.buffer as ArrayBuffer });
  const headers = Array.from(extractor.getFileList().fileHeaders);
  const fileHeaders = headers.filter(header => !header.flags.directory);
  if (!fileHeaders.length) throw new Error("The RAR archive does not contain any files");
  if (fileHeaders.length > MAX_ARCHIVE_FILES) throw new Error(`Archives are limited to ${MAX_ARCHIVE_FILES} files`);

  let totalBytes = 0;
  for (const header of fileHeaders) {
    const relativePath = normalizeArchivePath(header.name);
    totalBytes += header.unpSize;
    assertEntryLimits(fileHeaders.length, totalBytes, relativePath, header.unpSize);
  }

  const extracted = extractor.extract({ files: fileHeaders.map(header => header.name) });
  const files = Array.from(extracted.files);
  const entries: ProjectFileEntry[] = [];
  for (const file of files) {
    const relativePath = normalizeArchivePath(file.fileHeader.name);
    if (!file.extraction) continue;
    const data = Buffer.from(file.extraction);
    if (data.length > MAX_ARCHIVE_ENTRY_BYTES) throw new Error(`Archive entry ${relativePath} exceeds the file limit`);
    entries.push(toEntry(relativePath, data));
  }
  if (!entries.length) throw new Error("The RAR archive did not yield any readable files");
  return { format: "rar", isArchive: true, archiveName, fileCount: entries.length, totalBytes: entries.reduce((sum, entry) => sum + entry.sizeBytes, 0), entries };
}

export async function inspectProjectArchive(buffer: Buffer, archiveName: string, contentType?: string): Promise<ProjectArchive> {
  const lowerName = archiveName.toLowerCase();
  if (lowerName.endsWith(".zip") || contentType === "application/zip") return extractZip(buffer, archiveName);
  if (lowerName.endsWith(".rar") || contentType === "application/vnd.rar" || contentType === "application/x-rar-compressed") return extractRar(buffer, archiveName);
  const relativePath = normalizeArchivePath(archiveName);
  return { format: "file", isArchive: false, archiveName, fileCount: 1, totalBytes: buffer.length, entries: [toEntry(relativePath, buffer)] };
}
