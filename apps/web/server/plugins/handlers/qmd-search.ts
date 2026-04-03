import { getBuiltinPluginBySlug } from '../catalog';
import type {
  PluginHandler,
  PluginContext,
  ActionResult,
  ActionTarget,
  SearchResult,
} from '../types';

// ---------------------------------------------------------------------------
// Fallback scoring (used when no external QMD endpoint is configured)
// ---------------------------------------------------------------------------

function scoreByQuery(name: string, query: string, tokens: string[]): number {
  const normalizedName = name.toLowerCase();
  let score = 0;

  if (normalizedName === query) score += 80;
  if (normalizedName.startsWith(query)) score += 35;
  if (normalizedName.includes(query)) score += 15;

  for (const token of tokens) {
    if (token.length >= 2 && normalizedName.includes(token)) {
      score += 7;
    }
  }

  // Slightly favor document types that tend to be knowledge-heavy.
  if (
    normalizedName.endsWith('.pdf') ||
    normalizedName.endsWith('.md') ||
    normalizedName.endsWith('.doc') ||
    normalizedName.endsWith('.docx') ||
    normalizedName.endsWith('.txt')
  ) {
    score += 4;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const manifest = getBuiltinPluginBySlug('qmd-search')!;

export const qmdSearchHandler: PluginHandler = {
  manifest,

  async executeAction(
    ctx: PluginContext,
    actionId: string,
    target: ActionTarget,
  ): Promise<ActionResult> {
    if (actionId === 'qmd.reindex-file' && target.type === 'file') {
      const endpointUrl = ctx.config.endpointUrl;

      if (typeof endpointUrl === 'string' && endpointUrl.length > 0) {
        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          if (ctx.secrets.apiKey) {
            headers['Authorization'] = `Bearer ${ctx.secrets.apiKey}`;
          }

          await fetch(`${endpointUrl}/reindex`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              fileId: target.id,
              workspaceId: ctx.workspaceId,
            }),
            signal: AbortSignal.timeout(5_000),
          });
        } catch {
          // External endpoint may be unavailable; still return queued
        }
      }

      return {
        status: 'queued',
        message: `Queued "${target.name}" for discovery re-indexing`,
      };
    }

    return {
      status: 'success',
      message: `${actionId} completed`,
    };
  },

  async search(
    ctx: PluginContext,
    params: { query: string; folderId?: string | null; limit?: number },
  ): Promise<SearchResult[]> {
    const endpointUrl = ctx.config.endpointUrl;

    // If an external QMD endpoint is configured, call it
    if (typeof endpointUrl === 'string' && endpointUrl.length > 0) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (ctx.secrets.apiKey) {
          headers['Authorization'] = `Bearer ${ctx.secrets.apiKey}`;
        }

        const res = await fetch(`${endpointUrl}/search`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query: params.query,
            workspaceId: ctx.workspaceId,
            folderId: params.folderId ?? null,
            limit: params.limit ?? 20,
          }),
          signal: AbortSignal.timeout(2_000),
        });

        if (res.ok) {
          const data = (await res.json()) as {
            results?: Array<{ fileId: string; score: number; snippet?: string }>;
          };
          if (Array.isArray(data.results)) {
            return data.results.map((r) => ({
              fileId: r.fileId,
              score: r.score,
              snippet: r.snippet,
            }));
          }
        }
      } catch {
        // Fall through to local scoring
      }
    }

    // Fallback: score workspace files by name matching
    const { files } = await import('@openstore/database');
    const { eq, and, ilike } = await import('drizzle-orm');

    const query = params.query.trim().toLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);

    const rows = await ctx.db
      .select({ id: files.id, name: files.name })
      .from(files)
      .where(
        and(
          eq(files.workspaceId, ctx.workspaceId),
          ilike(files.name, `%${params.query}%`),
        ),
      )
      .limit(params.limit ?? 50);

    return rows
      .map((row) => ({
        fileId: row.id,
        score: scoreByQuery(row.name, query, tokens),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
  },
};
