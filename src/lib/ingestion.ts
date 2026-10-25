import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import type { ExtractedDocument } from "./types";

export interface IngestionLimits {
  maxBytes: number;
  maxCharacters: number;
}

export function ingestionLimits(): IngestionLimits {
  const maxBytes = Number(process.env.MAX_UPLOAD_BYTES ?? "15728640");
  return {
    maxBytes: Number.isFinite(maxBytes) ? maxBytes : 15728640,
    maxCharacters: 1_200_000
  };
}

export function decodeTextBuffer(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf8");
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  const utf8 = buffer.toString("utf8");
  // eslint-disable-next-line no-control-regex
  const nullRatio = (utf8.match(/\u0000/gu)?.length ?? 0) / Math.max(1, utf8.length);
  if (nullRatio > 0.05) {
    const swapped = Buffer.from(buffer);
    if (swapped.length % 2 === 0) {
      swapped.swap16();
      return swapped.toString("utf16le");
    }
  }
  return utf8;
}

export function cleanExtractedText(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/\u0000/gu, "")
    .replace(/\r\n?/gu, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u200B-\u200F\uFEFF]/gu, "")
    .replace(/\u00A0/gu, " ")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function looksLikePdf(buffer: Buffer, fileName: string): boolean {
  return (
    buffer.subarray(0, 5).toString("latin1") === "%PDF-" || fileName.toLowerCase().endsWith(".pdf")
  );
}

function looksLikeDocx(buffer: Buffer, fileName: string): boolean {
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  return isZip && (fileName.toLowerCase().endsWith(".docx") || fileName.toLowerCase().endsWith(".doc"));
}

export async function extractDocument(
  buffer: Buffer,
  fileName: string | null,
  mediaType: string | null
): Promise<ExtractedDocument> {
  const limits = ingestionLimits();
  const warnings: string[] = [];

  if (buffer.length === 0) {
    throw new Error("The uploaded file is empty.");
  }
  if (buffer.length > limits.maxBytes) {
    throw new Error(
      `File exceeds the ${(limits.maxBytes / (1024 * 1024)).toFixed(0)} MB upload limit.`
    );
  }

  const name = fileName ?? "";
  const lowerName = name.toLowerCase();
  const type = (mediaType ?? "").toLowerCase();

  if (lowerName.endsWith(".doc")) {
    throw new Error("Legacy .doc files are not supported. Save the document as .docx or PDF.");
  }

  if (looksLikePdf(buffer, name) || type === "application/pdf") {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const extracted = await extractText(pdf, { mergePages: true });
      const text = Array.isArray(extracted.text) ? extracted.text.join("\n\n") : extracted.text;
      if (!text || text.trim().length === 0) {
        throw new Error("The PDF contains no extractable text. Scanned documents require OCR.");
      }
      if (text.length > limits.maxCharacters) {
        warnings.push("Document truncated to the maximum analysable length.");
      }
      return {
        text: cleanExtractedText(text.slice(0, limits.maxCharacters)),
        fileName: fileName ?? null,
        mediaType: mediaType ?? "application/pdf",
        kind: "pdf",
        warnings
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read PDF.";
      throw new Error(message, { cause: error });
    }
  }

  if (looksLikeDocx(buffer, name) || type.includes("wordprocessingml")) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value ?? "";
      if (!text || text.trim().length === 0) {
        throw new Error("The document contains no extractable text.");
      }
      if (result.messages.length > 0) {
        warnings.push(`${result.messages.length} document format warning(s) were normalized.`);
      }
      if (text.length > limits.maxCharacters) {
        warnings.push("Document truncated to the maximum analysable length.");
      }
      return {
        text: cleanExtractedText(text.slice(0, limits.maxCharacters)),
        fileName: fileName ?? null,
        mediaType: mediaType ?? "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        kind: "docx",
        warnings
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read DOCX file.";
      throw new Error(message, { cause: error });
    }
  }

  const text = decodeTextBuffer(buffer);
  const controlRatio =
    // eslint-disable-next-line no-control-regex
    (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu)?.length ?? 0) / Math.max(1, text.length);

  if (controlRatio > 0.02) {
    throw new Error("The file does not appear to contain readable text.");
  }
  if (text.trim().length === 0) {
    throw new Error("The document contains no text.");
  }
  if (text.length > limits.maxCharacters) {
    warnings.push("Document truncated to the maximum analysable length.");
  }

  return {
    text: cleanExtractedText(text.slice(0, limits.maxCharacters)),
    fileName: fileName ?? null,
    mediaType: mediaType ?? "text/plain",
    kind: "text",
    warnings
  };
}

export function decodeBase64Payload(payload: string): Buffer {
  const commaIndex = payload.indexOf(",");
  const raw = payload.startsWith("data:") && commaIndex >= 0 ? payload.slice(commaIndex + 1) : payload;
  return Buffer.from(raw, "base64");
}
