import type { Chunk, DocumentVersion, SourceDocument } from "../contracts";
import { chunkDocument, hash, type ChunkerConfig } from "./chunker";
export class InMemoryIngestionIndex {
  private chunks = new Map<string, Chunk>(); private versions = new Map<string, DocumentVersion>(); private tombstones = new Set<string>();
  upsert(source: SourceDocument, config: ChunkerConfig) { const contentHash = hash(source.content); const prior = this.versions.get(source.id); if (prior?.contentHash === contentHash && !prior.deleted) return { changed: false, chunks: this.all() }; this.removeChunks(source.id); this.tombstones.delete(source.id); const chunks = chunkDocument(source, config); chunks.forEach((chunk) => this.chunks.set(chunk.id, chunk)); this.versions.set(source.id, { sourceId: source.id, version: source.version, contentHash, chunkIds: chunks.map((chunk) => chunk.id), deleted: false }); return { changed: true, chunks } }
  delete(sourceId: string) { this.removeChunks(sourceId); this.tombstones.add(sourceId); const prior = this.versions.get(sourceId); if (prior) this.versions.set(sourceId, { ...prior, chunkIds: [], deleted: true }); }
  replay(sources: SourceDocument[], config: ChunkerConfig) { this.chunks.clear(); for (const source of sources) if (!this.tombstones.has(source.id)) this.upsert(source, config); return this.all(); }
  all() { return [...this.chunks.values()]; } isDeleted(id: string) { return this.tombstones.has(id); }
  private removeChunks(sourceId: string) { for (const [id, chunk] of this.chunks) if (chunk.metadata.sourceId === sourceId) this.chunks.delete(id); }
}
