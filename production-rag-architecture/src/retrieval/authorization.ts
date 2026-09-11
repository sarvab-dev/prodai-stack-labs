import type { AuthorizationAttributes, Chunk, RetrievalQuery } from "../contracts";
export function isAuthorized(acl: AuthorizationAttributes, query: RetrievalQuery) { return acl.visibility === "public" || (acl.tenantId === query.tenantId && (acl.visibility === "tenant" || acl.allowedGroups.some((group) => query.groups.includes(group)))); }
export const authorizedChunks = (chunks: Chunk[], query: RetrievalQuery) => chunks.filter((chunk) => isAuthorized(chunk.metadata.authorization, query));
