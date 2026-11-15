import {
  InvestigationRecord,
  InvestigationResultItem,
  ResultCategory,
  StartInvestigationRequest,
  ToolAvailabilityStatus,
  ToolHealthItem,
  ToolId,
} from '@/src/types/investigation';

export class ApiClientError extends Error {
  status: number;
  isUnreachable: boolean;
  retryAfterMs?: number;

  constructor(
    message: string,
    status = 0,
    isUnreachable = false,
    retryAfterMs?: number
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.isUnreachable = isUnreachable;
    this.retryAfterMs = retryAfterMs;
  }
}

const API_BASE =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  '';

export const MAX_EMAIL_BATCH_SIZE = 10000;

export function validateEmailAddress(email: string): {
  valid: boolean;
  reason?: string;
} {
  const trimmed = email.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Enter an authorized email address.' };
  }
  if (trimmed.length > 254) {
    return {
      valid: false,
      reason: 'Email exceeds maximum 254-character RFC limit.',
    };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    return {
      valid: false,
      reason: 'Enter a valid email format (e.g. name@domain.com).',
    };
  }
  return { valid: true };
}

export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '0 ms';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatTimestamp(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function inferCategory(item: InvestigationResultItem): ResultCategory {
  if (item.category) return item.category;
  if (item.tool === 'hibp') return 'Data Breaches';
  const p = item.platform.toLowerCase();
  if (
    item.tool === 'mailaccess' ||
    p.includes('mx') ||
    p.includes('dns') ||
    p.includes('spf') ||
    p.includes('dmarc') ||
    p.includes('domain')
  ) {
    return 'Email & Domain';
  }
  if (
    p.includes('github') ||
    p.includes('gitlab') ||
    p.includes('docker') ||
    p.includes('npm') ||
    p.includes('pypi') ||
    p.includes('stack') ||
    p.includes('bitbucket')
  ) {
    return 'Developer & Technical';
  }
  if (
    p.includes('google') ||
    p.includes('notion') ||
    p.includes('atlassian') ||
    p.includes('slack') ||
    p.includes('dropbox') ||
    p.includes('adobe') ||
    p.includes('microsoft')
  ) {
    return 'Productivity & Cloud';
  }
  if (
    p.includes('spotify') ||
    p.includes('amazon') ||
    p.includes('ebay') ||
    p.includes('netflix') ||
    p.includes('steam')
  ) {
    return 'Commerce & Media';
  }
  return 'Social & Community';
}

export function normalizeInvestigationRecord(
  raw: Partial<InvestigationRecord> & {
    scanId: string;
    email: string;
    status: InvestigationRecord['status'];
  }
): InvestigationRecord {
  const results = (raw.results || []).map((r, idx) => ({
    ...r,
    id: r.id || `${r.tool}-${r.platform}-${idx}`,
    category: inferCategory(r),
    details: r.details || {},
    duration: typeof r.duration === 'number' ? r.duration : 0,
  }));

  const found =
    raw.summary?.found ?? results.filter((r) => r.status === 'found').length;
  const notFound =
    raw.summary?.notFound ??
    results.filter((r) => r.status === 'not_found').length;
  const notChecked =
    raw.summary?.notChecked ??
    results.filter((r) => r.status === 'not_checked').length;
  const errors =
    raw.summary?.errors ?? results.filter((r) => r.status === 'error').length;
  const total =
    raw.summary?.total ?? results.length;

  return {
    scanId: raw.scanId,
    email: raw.email,
    target: raw.target || raw.email,
    targetType: raw.targetType === 'phone' ? 'phone' : 'email',
    phoneCountryCode: raw.phoneCountryCode,
    status: raw.status,
    createdAt: raw.createdAt || new Date().toISOString(),
    completedAt: raw.completedAt,
    durationMs: raw.durationMs ?? 0,
    selectedTools: raw.selectedTools || [],
    matchScope:
      raw.matchScope === 'email' || raw.matchScope === 'email_and_username'
        ? raw.matchScope
        : 'email_and_username',
    summary: {
      total,
      found,
      notFound,
      notChecked,
      errors,
    },
    results,
    toolExecutions: raw.toolExecutions || [],
    authorizationConfirmedAt: raw.authorizationConfirmedAt,
    errorMessage: raw.errorMessage,
  };
}

export function getInvestigationTarget(record: InvestigationRecord): string {
  return record.target || record.email;
}

async function requestJson<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });
  } catch {
    throw new ApiClientError(
      `Investigation service (${path}) is currently unreachable. Ensure your backend API is running and try again.`,
      0,
      true
    );
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new ApiClientError(
      `Expected JSON response from ${path} (status ${response.status}).`,
      response.status,
      response.status === 404
    );
  }

  const data = await response.json();
  if (!response.ok) {
    const retryAfter = response.headers.get('retry-after');
    const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
    const retryAfterDate = retryAfter ? Date.parse(retryAfter) : NaN;
    const retryAfterMs = Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds * 1000
      : Number.isFinite(retryAfterDate)
        ? Math.max(0, retryAfterDate - Date.now())
        : undefined;
    throw new ApiClientError(
      data?.error || data?.message || `API request failed (${response.status})`,
      response.status,
      false,
      retryAfterMs
    );
  }
  return data as T;
}

export async function fetchToolsHealth(): Promise<
  Record<ToolId, ToolAvailabilityStatus>
> {
  const data = await requestJson<{ tools: ToolHealthItem[] }>(
    '/api/tools/health'
  );
  const map: Partial<Record<ToolId, ToolAvailabilityStatus>> = {};
  (data.tools || []).forEach((item) => {
    map[item.tool] = item.availability;
  });
  return map as Record<ToolId, ToolAvailabilityStatus>;
}

export async function fetchInvestigations(): Promise<InvestigationRecord[]> {
  const data = await requestJson<{ investigations: InvestigationRecord[] } | InvestigationRecord[]>(
    '/api/investigations'
  );
  const list = Array.isArray(data) ? data : data.investigations || [];
  return list.map(normalizeInvestigationRecord);
}

export async function startInvestigation(
  payload: StartInvestigationRequest
): Promise<InvestigationRecord> {
  const data = await requestJson<InvestigationRecord>('/api/investigations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return normalizeInvestigationRecord(data);
}

export async function fetchInvestigationById(
  scanId: string,
  signal?: AbortSignal
): Promise<InvestigationRecord> {
  const data = await requestJson<InvestigationRecord>(
    `/api/investigations/${encodeURIComponent(scanId)}`,
    { signal }
  );
  return normalizeInvestigationRecord(data);
}

export async function cancelInvestigation(
  scanId: string
): Promise<{ cancelled: boolean; status?: InvestigationRecord['status'] }> {
  return requestJson(`/api/investigations/${encodeURIComponent(scanId)}/cancel`, {
    method: 'POST',
  });
}

export async function generateInvestigationOverview(
  scanId: string,
  consent: { authorizedConfirmed: boolean; privacyAcknowledged: boolean }
): Promise<{ overview: string; model: string; cached: boolean }> {
  return requestJson(
    `/api/investigations/${encodeURIComponent(scanId)}/overview`,
    {
      method: 'POST',
      body: JSON.stringify(consent),
    }
  );
}

export function toApiContractJson(record: InvestigationRecord) {
  return {
    scanId: record.scanId,
    email: record.email,
    target: getInvestigationTarget(record),
    targetType: record.targetType ?? 'email',
    status: record.status,
    summary: {
      total: record.summary.total,
      found: record.summary.found,
      notFound: record.summary.notFound,
      notChecked: record.summary.notChecked,
      errors: record.summary.errors,
    },
    results: record.results.map((r) => ({
      tool: r.tool,
      platform: r.platform,
      category: inferCategory(r),
      status: r.status,
      ...(r.confidence ? { confidence: r.confidence } : {}),
      ...(r.url ? { url: r.url } : {}),
      details: r.details,
      duration: r.duration,
      ...(r.checkedAt ? { checkedAt: r.checkedAt } : {}),
      ...(r.errorMessage ? { errorMessage: r.errorMessage } : {}),
    })),
  };
}
