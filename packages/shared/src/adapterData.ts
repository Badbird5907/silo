export interface UploadSessionAdapterData {
  id: string;
  storageKey: string;
  multipartUploadId?: string | null;
  updatedAt?: string | null;
}

export interface AdapterData {
  version?: number;
  provider?: string;
  uploadSession?: UploadSessionAdapterData;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function getUploadSessionAdapterData(
  adapterData: unknown,
): UploadSessionAdapterData | null {
  const root = asObject(adapterData);
  if (!root) return null;

  const uploadSession = asObject(root.uploadSession);
  if (!uploadSession) return null;

  const id = uploadSession.id;
  const storageKey = uploadSession.storageKey;
  const multipartUploadId = uploadSession.multipartUploadId;
  const updatedAt = uploadSession.updatedAt;

  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof storageKey !== "string" || storageKey.length === 0) return null;

  return {
    id,
    storageKey,
    multipartUploadId:
      typeof multipartUploadId === "string" ? multipartUploadId : null,
    updatedAt: typeof updatedAt === "string" ? updatedAt : null,
  };
}

export function setUploadSessionAdapterData(
  adapterData: unknown,
  uploadSession: UploadSessionAdapterData,
  options?: { provider?: string; version?: number },
): AdapterData {
  const base = asObject(adapterData);
  const next: AdapterData = base ? { ...(base as AdapterData) } : {};

  next.version = options?.version ?? next.version ?? 1;
  next.provider = options?.provider ?? next.provider ?? "r2";
  next.uploadSession = {
    id: uploadSession.id,
    storageKey: uploadSession.storageKey,
    multipartUploadId: uploadSession.multipartUploadId ?? null,
    updatedAt: uploadSession.updatedAt ?? new Date().toISOString(),
  };

  return next;
}

export function clearUploadSessionAdapterData(
  adapterData: unknown,
): AdapterData {
  const base = asObject(adapterData);
  const next: AdapterData = base ? { ...(base as AdapterData) } : {};
  delete next.uploadSession;
  return next;
}
