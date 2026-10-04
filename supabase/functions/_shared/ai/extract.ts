// Turns an uploaded file into model input. PDFs and images go to Claude
// natively; Word and Excel are converted to text here. Nothing is truncated:
// files over the limit are rejected so the user can split them.
import { strFromU8, unzipSync } from 'fflate';
import readXlsxFile from 'read-excel-file/universal';
import type { ContentPart } from './provider.ts';

export const MAX_TEXT_CHARS = 300_000;

export class UnsupportedDocumentError extends Error {
  constructor(readonly code: 'unsupported_type' | 'document_too_long' | 'empty_document') {
    super(code);
  }
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function textPart(text: string): ContentPart {
  const clean = text.replace(/\u0000/g, '').trim();
  if (!clean) throw new UnsupportedDocumentError('empty_document');
  if (clean.length > MAX_TEXT_CHARS) throw new UnsupportedDocumentError('document_too_long');
  return { kind: 'text', text: clean };
}

const MAX_UNZIPPED_BYTES = 50 * 1024 * 1024;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/**
 * Plain text of a .docx: the body XML with paragraph and tab structure kept.
 * Reads only word/document.xml and refuses oversized entries (zip bombs).
 */
export function docxText(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => f.name === 'word/document.xml' && f.originalSize <= MAX_UNZIPPED_BYTES,
    });
  } catch {
    throw new UnsupportedDocumentError('unsupported_type');
  }
  const xml = files['word/document.xml'];
  if (!xml) throw new UnsupportedDocumentError('unsupported_type');
  return strFromU8(xml)
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
      e[0] === '#'
        ? String.fromCodePoint(
            e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10),
          )
        : (ENTITIES[e] ?? m),
    )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

export async function documentToPart(bytes: Uint8Array, mimeType: string): Promise<ContentPart> {
  switch (mimeType) {
    case 'application/pdf':
      return { kind: 'pdf', base64: toBase64(bytes) };
    case 'image/png':
    case 'image/jpeg':
    case 'image/webp':
      return { kind: 'image', base64: toBase64(bytes), mediaType: mimeType };
    case DOCX: {
      return textPart(docxText(bytes));
    }
    case XLSX: {
      const sheets = await readXlsxFile(new Blob([bytes as BlobPart]));
      const text = sheets
        .map(
          (s) =>
            `# ${s.sheet}\n` +
            s.data.map((row) => row.map((c) => (c ?? '').toString()).join('\t')).join('\n'),
        )
        .join('\n\n');
      return textPart(text);
    }
    case 'text/plain':
    case 'text/csv':
      return textPart(new TextDecoder().decode(bytes));
    default:
      throw new UnsupportedDocumentError('unsupported_type');
  }
}
