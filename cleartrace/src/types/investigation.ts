export type ToolId =
  | 'mailaccess'
  | 'holehe'
  | 'maigret'
  | 'ghunt'
  | 'blackbird'
  | 'sherlock'
  | 'hibp'
  | 'phoneinfoga'
  | 'ignorant'
  | 'detectdee';

export type InvestigationTargetType = 'email' | 'phone';

export type ToolAvailabilityStatus = 'ready' | 'optional' | 'unavailable';

export type ToolRunStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'completed'
  | 'warning'
  | 'error'
  | 'skipped';

export type PlatformResultStatus =
  | 'found'
  | 'not_found'
  | 'not_checked'
  | 'error';

export type ResultCategory =
  | 'Social & Community'
  | 'Developer & Technical'
  | 'Productivity & Cloud'
  | 'Commerce & Media'
  | 'Email & Domain'
  | 'Data Breaches';

export type ResultConfidence = 'high' | 'medium' | 'low';

export type MatchScope = 'email' | 'email_and_username';

export type ScanOverallStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled';

export interface ToolDefinition {
  id: ToolId;
  name: string;
  inputTypes: InvestigationTargetType[];
  tier: 'core' | 'optional';
  defaultAvailability: ToolAvailabilityStatus;
  scope: string;
  description: string;
  cliBinary: string;
  typicalDurationSec: string;
  capabilities: string[];
  limitations: string;
  accentBg: string;
  accentText: string;
  accentBorder: string;
}

export interface ToolHealthItem {
  tool: ToolId;
  availability: ToolAvailabilityStatus;
  version?: string;
  detail?: string;
}

export interface ToolExecutionState {
  tool: ToolId;
  status: ToolRunStatus;
  progress: number; // 0 to 100
  startedAt?: string;
  partial?: boolean;
  durationMs: number;
  platformsChecked: number;
  foundCount: number;
  errorCount: number;
  message?: string;
}

export interface InvestigationResultItem {
  id?: string;
  tool: ToolId;
  platform: string;
  category?: ResultCategory;
  status: PlatformResultStatus;
  /** How strongly this hit is tied to the email's owner (vs. a lookalike username). */
  confidence?: ResultConfidence;
  url?: string;
  details: Record<string, unknown>;
  duration: number; // ms
  checkedAt?: string;
  errorMessage?: string;
}

const USERNAME_DERIVED_TOOLS = new Set<ToolId>(['maigret', 'sherlock']);
const USERNAME_DERIVED_MAILACCESS_MODULES = new Set([
  'username_platforms',
  'username_pivot',
  'pivot',
  'social_links',
  'hackernews',
  'permutation_discovery',
  'fediverse_discovery',
  'twitter_profile',
  'marketplace_profile',
  'linkedin_serp',
]);

export function isEmailLinkedResult(item: InvestigationResultItem, matchScope?: MatchScope): boolean {
  if (matchScope !== 'email') return true;
  if (USERNAME_DERIVED_TOOLS.has(item.tool)) return false;
  if (item.tool !== 'mailaccess') return true;
  if (item.details.usernameMatch === true) return false;

  const metadata =
    typeof item.details.metadata === 'object' && item.details.metadata !== null
      ? item.details.metadata as Record<string, unknown>
      : {};
  const sourceNames = [
    item.details.module,
    item.details.module_name,
    item.details.source,
    item.details.source_module,
    metadata.module,
    metadata.source,
  ];
  return !sourceNames.some(
    (source) =>
      typeof source === 'string' &&
      USERNAME_DERIVED_MAILACCESS_MODULES.has(source.toLowerCase()),
  );
}

export interface InvestigationSummary {
  total: number;
  found: number;
  notFound: number;
  notChecked: number;
  errors: number;
}

export interface InvestigationRecord {
  scanId: string;
  email: string;
  target?: string;
  targetType?: InvestigationTargetType;
  phoneCountryCode?: string;
  status: ScanOverallStatus;
  createdAt: string;
  completedAt?: string;
  durationMs: number;
  selectedTools: ToolId[];
  matchScope?: MatchScope;
  summary: InvestigationSummary;
  results: InvestigationResultItem[];
  toolExecutions: ToolExecutionState[];
  authorizationConfirmedAt?: string;
  errorMessage?: string;
}

export interface StartInvestigationRequest {
  email?: string;
  target?: string;
  targetType?: InvestigationTargetType;
  phoneCountryCode?: string;
  tools: ToolId[];
  matchScope?: MatchScope;
  authorizedConfirmed: boolean;
}

export interface DailyActivityPoint {
  date: string;
  scans: number;
}

export type AppRoute =
  | 'landing'
  | 'dashboard'
  | 'investigate'
  | 'results'
  | 'tools'
  | 'how-it-works'
  | 'privacy-faq';
