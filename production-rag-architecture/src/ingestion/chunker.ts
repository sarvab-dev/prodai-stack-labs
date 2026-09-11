import { createHash } from "node:crypto";
import type { Chunk, SourceDocument } from "../contracts";
export type ChunkerConfig = { size: number; overlap: number; chunkerVersion: string; indexVersion: string };
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function chunkDocument(source: SourceDocument, config: ChunkerConfig): Chunk[] {
  if (config.size < 1 || config.overlap < 0 || config.overlap >= config.size) throw new Error("Invalid chunk configuration");
  const words = source.content.trim().split(/\s+/); const chunks: Chunk[] = [];
  for (let startWord = 0; startWord < words.length; startWord += config.size - config.overlap) {
    const text = words.slice(startWord, startWord + config.size).join(" "); if (!text) break;
    const contentHash = hash(text); const id = `${source.id}:${config.chunkerVersion}:${startWord}:${contentHash.slice(0, 12)}`;
    chunks.push({ id, version: `${source.version}:${config.chunkerVersion}`, contentHash, text, metadata: { sourceId: source.id, sourceVersion: source.version, sourceUri: source.uri, title: source.title, section: source.section, page: source.page, start: startWord, end: Math.min(words.length, startWord + config.size), authorization: source.authorization, chunkerVersion: config.chunkerVersion, indexVersion: config.indexVersion } });
    if (startWord + config.size >= words.length) break;
  }
  return chunks;
}
