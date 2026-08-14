import { hashIdempotencyParts } from "./workerHash.js";
import { normalizePaginationLimit, normalizePaginationOffset } from "./workerPagination.js";
import { isNonEmptyString } from "./workerValueUtils.js";
import type {
  SearchIndexProjectionAdapter,
  SearchIndexProjectionDocument,
  SearchIndexProjectionPage,
  SearchIndexProjectionQuery,
  SearchIndexProjectionSort
} from "./workerTypes.js";

export function createInMemorySearchIndexProjectionAdapter(
  initialDocuments: readonly SearchIndexProjectionDocument[] = []
): SearchIndexProjectionAdapter {
  const documentsById = new Map<string, SearchIndexProjectionDocument>();
  for (const document of initialDocuments) {
    documentsById.set(document.id, cloneSearchIndexProjectionDocument(document));
  }

  return {
    kind: "in-memory-search-projection-wip",
    applyDocuments({ documents, projectionDigest, at }) {
      let upsertedDocumentCount = 0;
      let updatedDocumentCount = 0;
      let unchangedDocumentCount = 0;

      for (const document of orderSearchIndexDocuments(documents)) {
        const nextDocument = cloneSearchIndexProjectionDocument(document);
        const currentDocument = documentsById.get(nextDocument.id);
        if (currentDocument === undefined) {
          upsertedDocumentCount += 1;
          documentsById.set(nextDocument.id, nextDocument);
          continue;
        }

        if (areSearchIndexDocumentsEqual(currentDocument, nextDocument)) {
          unchangedDocumentCount += 1;
          continue;
        }

        updatedDocumentCount += 1;
        documentsById.set(nextDocument.id, nextDocument);
      }

      return {
        adapterKind: "in-memory-search-projection-wip",
        boundary: "wip-in-memory-projection",
        consistency: "retry-safe-upsert",
        projectionDigest,
        appliedAt: at,
        idempotencyKeyHash: hashIdempotencyParts([
          "search.index.apply",
          projectionDigest,
          ...orderSearchIndexDocuments(documents).map((document) => document.id)
        ]),
        receivedDocumentCount: documents.length,
        upsertedDocumentCount,
        updatedDocumentCount,
        unchangedDocumentCount,
        totalDocumentCount: documentsById.size
      };
    },
    listDocuments(query) {
      const normalizedQuery = normalizeSearchIndexProjectionQuery(query);
      const filteredDocuments = orderSearchIndexDocuments(
        [...documentsById.values()],
        normalizedQuery.sort
      ).filter((document) => matchesSearchIndexProjectionQuery(document, normalizedQuery));
      const items = filteredDocuments
        .slice(normalizedQuery.offset, normalizedQuery.offset + normalizedQuery.limit)
        .map(cloneSearchIndexProjectionDocument);
      const nextOffset = normalizedQuery.offset + items.length;
      const hasMore = nextOffset < filteredDocuments.length;
      const page: SearchIndexProjectionPage = {
        items,
        total: filteredDocuments.length,
        limit: normalizedQuery.limit,
        offset: normalizedQuery.offset,
        hasMore,
        query: normalizedQuery,
        adapterKind: "in-memory-search-projection-wip",
        boundary: "wip-in-memory-projection",
        consistency: "api-list-compatible"
      };

      if (hasMore) {
        page.nextOffset = nextOffset;
      }

      return page;
    },
    snapshot() {
      return orderSearchIndexDocuments([...documentsById.values()]).map(
        cloneSearchIndexProjectionDocument
      );
    }
  };
}

function normalizeSearchIndexProjectionQuery(
  query: SearchIndexProjectionQuery
): SearchIndexProjectionQuery & { limit: number; offset: number; sort: SearchIndexProjectionSort } {
  const normalized: SearchIndexProjectionQuery & {
    limit: number;
    offset: number;
    sort: SearchIndexProjectionSort;
  } = {
    projectId: query.projectId,
    limit: normalizePaginationLimit(query.limit),
    offset: normalizePaginationOffset(query.offset),
    sort: query.sort ?? "title"
  };

  if (query.launchId !== undefined) {
    normalized.launchId = query.launchId;
  }
  const search = normalizeOptionalQueryText(query.search);
  if (search !== undefined) {
    normalized.search = search;
  }
  if (query.statuses !== undefined) {
    normalized.statuses = [...new Set(query.statuses)].sort();
  }
  if (query.flaky !== undefined) {
    normalized.flaky = query.flaky;
  }
  if (query.muted !== undefined) {
    normalized.muted = query.muted;
  }

  return normalized;
}

function normalizeOptionalQueryText(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

function matchesSearchIndexProjectionQuery(
  document: SearchIndexProjectionDocument,
  query: SearchIndexProjectionQuery
): boolean {
  if (document.projectId !== query.projectId) {
    return false;
  }

  if (query.launchId !== undefined && document.launchId !== query.launchId) {
    return false;
  }

  if (query.statuses !== undefined && !query.statuses.includes(document.status)) {
    return false;
  }

  if (query.flaky !== undefined && document.flaky !== query.flaky) {
    return false;
  }

  if (query.muted !== undefined && document.muted !== query.muted) {
    return false;
  }

  if (query.search === undefined) {
    return true;
  }

  const haystack = [
    document.title,
    document.resultUuid,
    document.caseKeyHash,
    document.status,
    document.durationBucket,
    ...document.labelKeys,
    ...document.visibleParameterNames,
    document.defectClusterId,
    document.defectState
  ]
    .filter((value): value is string => isNonEmptyString(value))
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.search);
}

function orderSearchIndexDocuments(
  documents: readonly SearchIndexProjectionDocument[],
  sort: SearchIndexProjectionSort = "title"
): SearchIndexProjectionDocument[] {
  return [...documents].sort((left, right) => {
    const direction = sort.startsWith("-") ? -1 : 1;
    const valueComparison =
      getSearchIndexSortValue(left, sort).localeCompare(getSearchIndexSortValue(right, sort)) *
      direction;
    if (valueComparison !== 0) {
      return valueComparison;
    }

    return left.id.localeCompare(right.id);
  });
}

function getSearchIndexSortValue(
  document: SearchIndexProjectionDocument,
  sort: SearchIndexProjectionSort
): string {
  switch (sort.replace("-", "")) {
    case "status":
      return [document.status, document.title, document.launchId, document.resultUuid].join(
        "\u001f"
      );
    case "durationBucket":
      return [document.durationBucket, document.title, document.launchId, document.resultUuid].join(
        "\u001f"
      );
    case "title":
    default:
      return [document.title, document.status, document.launchId, document.resultUuid].join(
        "\u001f"
      );
  }
}

function cloneSearchIndexProjectionDocument(
  document: SearchIndexProjectionDocument
): SearchIndexProjectionDocument {
  const cloned: SearchIndexProjectionDocument = {
    ...document,
    labelKeys: [...document.labelKeys],
    visibleParameterNames: [...document.visibleParameterNames]
  };

  return cloned;
}

function areSearchIndexDocumentsEqual(
  left: SearchIndexProjectionDocument,
  right: SearchIndexProjectionDocument
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
