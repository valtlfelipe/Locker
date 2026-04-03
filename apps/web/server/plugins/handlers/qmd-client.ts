const QMD_SERVICE_URL = process.env.QMD_SERVICE_URL;

const NON_INDEXABLE_PREFIXES = ['image/', 'video/', 'audio/'];
const NON_INDEXABLE_TYPES = new Set([
  'application/zip',
  'application/gzip',
  'application/x-tar',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/octet-stream',
]);

function shouldIndex(mimeType: string): boolean {
  if (NON_INDEXABLE_PREFIXES.some((p) => mimeType.startsWith(p))) return false;
  if (NON_INDEXABLE_TYPES.has(mimeType)) return false;
  return true;
}

export async function streamToString(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value, { stream: true }));
  }

  chunks.push(decoder.decode());
  return chunks.join('');
}

export const qmdClient = {
  isConfigured(): boolean {
    return !!QMD_SERVICE_URL;
  },

  shouldIndex,

  async indexFile(params: {
    workspaceId: string;
    fileId: string;
    fileName: string;
    mimeType: string;
    content: string;
  }): Promise<void> {
    if (!QMD_SERVICE_URL) return;

    await fetch(`${QMD_SERVICE_URL}/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(30_000),
    });
  },

  async search(params: {
    workspaceId: string;
    query: string;
    limit?: number;
  }): Promise<Array<{ fileId: string; score: number; snippet?: string }>> {
    if (!QMD_SERVICE_URL) return [];

    const res = await fetch(`${QMD_SERVICE_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) return [];
    const data = (await res.json()) as { results?: Array<{ fileId: string; score: number; snippet?: string }> };
    return data.results ?? [];
  },

  async deindexFile(params: {
    workspaceId: string;
    fileId: string;
  }): Promise<void> {
    if (!QMD_SERVICE_URL) return;

    await fetch(`${QMD_SERVICE_URL}/deindex`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(5_000),
    });
  },
};
