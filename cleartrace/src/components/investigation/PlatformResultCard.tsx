import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import { TOOL_BY_ID } from '@/src/data/tools';
import { formatDuration, inferCategory } from '@/src/lib/api';
import { InvestigationResultItem } from '@/src/types/investigation';
import { Card } from '@/src/components/ui/Card';
import { PlatformStatusBadge } from '@/src/components/ui/StatusIndicator';
import { PlatformLogo } from '@/src/components/investigation/PlatformLogo';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const DETAIL_LABELS: Record<string, string> = {
  credentialRiskBand: 'Credential risk level',
  credentialRiskScore: 'Credential risk score',
  customerId: 'Workspace customer ID',
  email: 'Email address',
  enterpriseUser: 'Google Workspace account',
  entityType: 'Account type',
  gaiaId: 'Google profile ID',
  keywords: 'Keywords',
  lastProfileEdit: 'Profile last updated',
  linkedIdentifiers: 'Public profile identifiers',
  matchStatus: 'Match status',
  metadata: 'Public profile details',
  profile_url: 'Profile URL',
  publicAccountSignals: 'Public account details',
  reportSummary: 'MailAccess report summary',
  score: 'Posture score',
  severity: 'Severity',
  siteName: 'Site',
  tags: 'Tags',
  totalFindings: 'Findings reported',
  username: 'Username',
  usernameMatch: 'Username matched',
  identityNote: 'Identity note',
  reliabilityWarning: 'Reliability warning',
  corroborated: 'Corroboration',
  structured: 'Extended Google data',
  partialRun: 'Partial run',
  source: 'Source',
  matchContext: 'Match',
  breachDate: 'Breach date',
  dataClasses: 'Data types reported for the breach overall',
  totalAffectedAccounts: 'Total accounts in this breach (not this email’s count)',
  isVerified: 'Breach verified by HIBP',
  dataScopeNote: 'Important context',
  domain: 'Breach domain',
  description: 'Breach description',
  message: 'HIBP result',
};

function formatLabel(key: string): string {
  return DETAIL_LABELS[key] || key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatValue(value: unknown, key?: string): string {
  if (value === null || value === undefined || value === '') return 'Not available';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return new Intl.NumberFormat().format(value);
  if (typeof value !== 'string') return String(value);
  if (/^true$/i.test(value)) return 'Yes';
  if (/^false$/i.test(value)) return 'No';
  if (/^not found\.?$/i.test(value.trim())) return 'Not available';
  if (key === 'entityType') {
    return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return value;
}

function parseLegacyGoogleSignals(value: unknown): Array<[string, string]> {
  if (typeof value !== 'string') return [];
  const labels: Record<string, string> = {
    'last profile edit': 'lastProfileEdit',
    email: 'email',
    'gaia id': 'gaiaId',
    'entity type': 'entityType',
    'enterprise user': 'enterpriseUser',
    'customer id': 'customerId',
  };
  return value.split(/,\s*(?=[A-Za-z][A-Za-z ]{1,32}\s*:)/).flatMap((entry) => {
    const separator = entry.indexOf(':');
    if (separator < 0) return [];
    const field = labels[entry.slice(0, separator).trim().toLowerCase()];
    const fieldValue = entry.slice(separator + 1).trim();
    return field && fieldValue ? [[field, fieldValue]] : [];
  });
}

function FormattedDetailValue({
  value,
  depth = 0,
}: {
  value: unknown;
  depth?: number;
}): React.ReactNode {
  if (depth > 4) return 'Additional nested details omitted';
  if (Array.isArray(value)) {
    if (value.every((entry) => !isRecord(entry) && !Array.isArray(entry))) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {value.map((entry, index) => (
            <span key={`${String(entry)}-${index}`} className="rounded-full bg-white border border-slate-200 px-2 py-0.5">
              {formatValue(entry)}
            </span>
          ))}
        </div>
      );
    }
    return (
      <ul className="space-y-1.5">
        {value.map((entry, index) => (
          <li key={index} className="rounded-md bg-white border border-slate-200 px-2.5 py-2">
            <FormattedDetailValue value={entry} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }
  if (isRecord(value)) {
    return (
      <dl className="space-y-1.5">
        {Object.entries(value).map(([key, nestedValue]) => (
          <div key={key} className="flex flex-wrap justify-between gap-x-3">
            <dt className="text-slate-500">{formatLabel(key)}</dt>
            <dd className="text-right">
              <FormattedDetailValue value={nestedValue} depth={depth + 1} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return formatValue(value);
}

function safeHttpUrl(value: unknown, allowedHost?: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    if (allowedHost && url.hostname !== allowedHost && !url.hostname.endsWith(`.${allowedHost}`)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function safeProfileImageUrl(value: unknown, allowedHost?: string): string | undefined {
  const url = safeHttpUrl(value, allowedHost);
  return url?.startsWith('https://') ? url : undefined;
}

export function PlatformResultCard({
  item,
}: {
  item: InvestigationResultItem;
}) {
  const [expanded, setExpanded] = useState(false);
  const category = inferCategory(item);
  const toolName = TOOL_BY_ID[item.tool]?.name || item.tool;
  const details = item.details || {};
  const isGoogleProfile = item.tool === 'ghunt' && item.status === 'found';
  const nestedMetadata = isRecord(details.metadata) ? details.metadata : {};
  const imageValues = [
    details.profileImageUrl,
    details.profilePhotoUrl,
    details.profile_image_url,
    details.profile_photo_url,
    details.profile_picture_url,
    details.picture_url,
    details.avatarUrl,
    details.avatar_url,
    details.imageUrl,
    details.image_url,
    details.avatar,
    details.image,
    details.picture,
    details.photo,
    nestedMetadata.profileImageUrl,
    nestedMetadata.profilePhotoUrl,
    nestedMetadata.profile_image_url,
    nestedMetadata.profile_photo_url,
    nestedMetadata.profile_picture_url,
    nestedMetadata.picture_url,
    nestedMetadata.avatarUrl,
    nestedMetadata.avatar_url,
    nestedMetadata.imageUrl,
    nestedMetadata.image_url,
    nestedMetadata.avatar,
    nestedMetadata.image,
    nestedMetadata.picture,
    nestedMetadata.photo,
  ];
  const profileImageUrl = imageValues
    .map((value) => safeProfileImageUrl(value, isGoogleProfile ? 'googleusercontent.com' : undefined))
    .find((url): url is string => Boolean(url));
  const coverImageUrl = safeProfileImageUrl(
    details.coverImageUrl ?? details.coverPhotoUrl ?? details.cover_image_url,
    isGoogleProfile ? 'googleusercontent.com' : undefined,
  );
  const mapsProfileUrl =
    safeHttpUrl(details.mapsProfile, 'google.com') ||
    safeHttpUrl(item.url, 'google.com');
  const playGames = isRecord(details.playGames) ? details.playGames : undefined;
  const calendar = isRecord(details.calendar) ? details.calendar : undefined;
  const mapsStats = isRecord(details.mapsContributorStats)
    ? details.mapsContributorStats
    : undefined;
  const calendarDownloadUrl = safeHttpUrl(calendar?.downloadUrl, 'calendar.google.com');
  const calendarEvents = Array.isArray(calendar?.recentEvents)
    ? calendar.recentEvents.filter(isRecord)
    : [];
  const calendarNames = Array.isArray(calendar?.otherNames)
    ? calendar.otherNames
    : [];
  const gameAvatarUrl = safeHttpUrl(playGames?.avatarUrl, 'googleusercontent.com');
  const detailEntries = Object.entries(details).filter(
    ([key]) => ![
      'profileImageUrl',
      'profilePhotoUrl',
      'profile_image_url',
      'profile_photo_url',
      'profile_picture_url',
      'picture_url',
      'avatarUrl',
      'avatar_url',
      'imageUrl',
      'image_url',
      'avatar',
      'image',
      'picture',
      'photo',
      'coverPhotoUrl',
      'cover_image_url',
      'coverImageUrl',
      'activatedServices',
      'mapsContributorStats',
      'mapsProfile',
      'mapsStatus',
      'userTypes',
      'playGames',
      'calendar',
      'publicAccountSignals',
    ].includes(key)
  );
  const legacyGoogleSignals = parseLegacyGoogleSignals(details.publicAccountSignals);
  const googleEmail =
    typeof details.email === 'string'
      ? details.email
      : legacyGoogleSignals.find(([key]) => key === 'email')?.[1];
  const googleLastProfileEdit =
    typeof details.lastProfileEdit === 'string'
      ? details.lastProfileEdit
      : legacyGoogleSignals.find(([key]) => key === 'lastProfileEdit')?.[1];
  const googleDetailKeys = new Set(detailEntries.map(([key]) => key));
  const googleDetailEntries = [
    ...detailEntries.filter(([key]) => key !== 'email' && key !== 'lastProfileEdit'),
    ...legacyGoogleSignals.filter(
      ([key]) =>
        key !== 'email' &&
        key !== 'lastProfileEdit' &&
        !googleDetailKeys.has(key)
    ),
  ];
  const hasDetails = isGoogleProfile || detailEntries.length > 0;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="h-full"
    >
      <Card interactive className="p-5 h-full flex flex-col justify-between gap-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <PlatformLogo item={item} />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 truncate">
                  {item.platform}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {toolName} · {category}
                </p>
              </div>
            </div>
            {item.status === 'found' && item.confidence && (
              <span
                title={
                  item.confidence === 'low'
                    ? 'Matched by a guessed username — may be a different person.'
                    : item.confidence === 'medium'
                    ? 'Reported by the scanner; not independently confirmed.'
                    : 'Tied directly to the email address.'
                }
                className={`mr-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  item.confidence === 'high'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : item.confidence === 'medium'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-slate-100 text-slate-600 border-slate-300'
                }`}
              >
                {item.confidence === 'low' ? 'Possible match' : `${item.confidence} confidence`}
              </span>
            )}
            <PlatformStatusBadge status={item.status} />
          </div>

          {item.tool === 'hibp' && item.status === 'found' && (
            <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
              <p className="text-xs font-medium text-sky-900">
                This email address appears in HIBP’s record for this breach.
              </p>
              {Array.isArray(details.dataClasses) && details.dataClasses.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] text-slate-600">
                    Data types reported for the breach overall:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {details.dataClasses.map((dataClass, index) => (
                      <span key={`${String(dataClass)}-${index}`} className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[11px] text-slate-700">
                        {String(dataClass)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[11px] leading-relaxed text-slate-600">
                HIBP does not confirm that every listed data type was exposed for this specific email.
              </p>
            </div>
          )}

          {item.errorMessage ? (
            <p
              className={`text-xs rounded-lg px-3 py-2 leading-relaxed border ${
                item.status === 'error'
                  ? 'text-rose-800 bg-rose-50/70 border-rose-200'
                  : 'text-amber-800 bg-amber-50/70 border-amber-200'
              }`}
            >
              {item.errorMessage}
            </p>
          ) : expanded && isGoogleProfile ? (
            <div className="space-y-3">
              {coverImageUrl && (
                <img
                  src={coverImageUrl}
                  alt="Public Google profile cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-24 w-full rounded-lg border border-slate-200 object-cover bg-slate-50"
                />
              )}
              <div className="flex items-center gap-3">
                {profileImageUrl ? (
                  <img
                    src={profileImageUrl}
                    alt="Public Google profile picture"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-full object-cover border border-slate-200 bg-white"
                  />
                ) : (
                  <span className="w-14 h-14 rounded-full border border-slate-200 bg-emerald-50 flex items-center justify-center text-emerald-700 font-semibold">
                    G
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">Google account found</p>
                  <p className="text-[11px] text-slate-500">Public details returned by GHunt</p>
                  {googleEmail && (
                    <p className="text-xs text-slate-600 break-all">{googleEmail}</p>
                  )}
                  {googleLastProfileEdit && (
                    <p className="text-xs text-slate-500 mt-1">Profile last updated: {googleLastProfileEdit}</p>
                  )}
                </div>
              </div>
              {profileImageUrl && (
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">Profile photo URL</p>
                  <a
                    href={profileImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block break-all text-[11px] font-medium text-[#DC2626] hover:underline"
                  >
                    {profileImageUrl}
                  </a>
                </div>
              )}
              {googleDetailEntries.length > 0 && (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {googleDetailEntries.map(([key, value]) => (
                    <div key={key} className="rounded-lg bg-slate-50 px-3 py-2">
                      <dt className="text-slate-500">{formatLabel(key)}</dt>
                      <dd className="mt-0.5 font-medium text-slate-800 break-words">{formatValue(value, key)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {Array.isArray(details.activatedServices) && details.activatedServices.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-slate-600 mb-1">Activated public services</p>
                  <div className="flex flex-wrap gap-1.5">
                    {details.activatedServices.map((service) => (
                      <span key={String(service)} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-800">{String(service)}</span>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(details.userTypes) && details.userTypes.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-slate-600 mb-1">Google account types</p>
                  <div className="flex flex-wrap gap-1.5">
                    {details.userTypes.map((type) => (
                      <span key={String(type)} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-700">{String(type)}</span>
                    ))}
                  </div>
                </div>
              )}
              {typeof details.mapsStatus === 'string' && (
                <div>
                  <p className="text-[11px] font-medium text-slate-600">Google Maps</p>
                  <p className="text-xs text-slate-700 capitalize mt-1">
                    {details.mapsStatus === 'available' ? 'Public contributor activity available' : String(details.mapsStatus).replace(/_/g, ' ')}
                  </p>
                  {mapsStats && Object.keys(mapsStats).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Object.entries(mapsStats).map(([label, count]) => (
                        <span key={label} className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-700 capitalize">{label}: {String(count)}</span>
                      ))}
                    </div>
                  )}
                  {mapsProfileUrl && (
                    <a
                      href={mapsProfileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 block break-all text-[11px] font-medium text-[#DC2626] hover:underline"
                    >
                      Google Maps profile: {mapsProfileUrl}
                    </a>
                  )}
                </div>
              )}
              {playGames && (
                <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    {gameAvatarUrl && (
                      <img src={gameAvatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full object-cover" />
                    )}
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Google Play Games</p>
                      <p className="text-[11px] text-slate-500 capitalize">{formatValue(playGames.status).replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  {(typeof playGames.username === 'string' || typeof playGames.playerId === 'string') && (
                    <p className="text-xs text-slate-700 break-all">
                      {playGames.username ? String(playGames.username) : 'Player'}
                      {playGames.playerId ? ` · ID ${String(playGames.playerId)}` : ''}
                    </p>
                  )}
                  {(playGames.gamesPlayed !== undefined || playGames.achievements !== undefined) && (
                    <p className="text-[11px] text-slate-600">
                      {playGames.gamesPlayed !== undefined ? `${String(playGames.gamesPlayed)} games` : ''}
                      {playGames.gamesPlayed !== undefined && playGames.achievements !== undefined ? ' · ' : ''}
                      {playGames.achievements !== undefined ? `${String(playGames.achievements)} achievements` : ''}
                    </p>
                  )}
                  {typeof playGames.lastPlayedGame === 'string' && (
                    <p className="text-[11px] text-slate-600">Last played: {playGames.lastPlayedGame}</p>
                  )}
                </div>
              )}
              {calendar && (
                <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-800">Public Google Calendar</p>
                    <span className="text-[11px] text-slate-500 capitalize">{formatValue(calendar.status)}</span>
                  </div>
                  {typeof calendar.summary === 'string' && <p className="text-xs text-slate-700">{calendar.summary}</p>}
                  {typeof calendar.timeZone === 'string' && <p className="text-[11px] text-slate-500">{calendar.timeZone}</p>}
                  {typeof calendar.eventsDumped === 'number' && <p className="text-[11px] text-slate-600">{calendar.eventsDumped} public events reported</p>}
                  {calendarEvents.length > 0 && (
                    <ul className="space-y-1.5">
                      {calendarEvents.map((event, index) => (
                        <li key={`${String(event.dateTimeUtc)}-${index}`} className="text-[11px] text-slate-700">
                          <span className="font-medium">{String(event.name || 'Untitled event')}</span>
                          <span className="text-slate-500"> · {String(event.dateTimeUtc || '')}{event.duration ? ` · ${String(event.duration)}` : ''}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {calendarNames.length > 0 && (
                    <p className="text-[11px] text-slate-600">Other names: {calendarNames.map(String).join(', ')}</p>
                  )}
                  {calendarDownloadUrl && (
                    <a href={calendarDownloadUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-[#DC2626] hover:underline">
                      Open public calendar
                    </a>
                  )}
                </div>
              )}
            </div>
          ) : expanded && detailEntries.length > 0 ? (
            <div className="space-y-3">
              {profileImageUrl && (
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <img
                    src={profileImageUrl}
                    alt={`${item.platform} public profile`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-14 w-14 rounded-full border border-slate-200 bg-white object-cover"
                  />
                  <span className="text-xs font-medium text-slate-700">Public profile picture returned by {toolName}</span>
                </div>
              )}
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {detailEntries.map(([key, val]) => (
                  <div
                    key={key}
                    className="rounded-lg bg-slate-50 px-3 py-2 min-w-0"
                  >
                    <dt className="text-slate-500">{formatLabel(key)}</dt>
                    <dd className="mt-1 font-medium text-slate-800 break-words">
                      <FormattedDetailValue value={val} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : hasDetails ? (
            <p className="text-xs text-slate-400">
              Additional details are hidden. Choose “View details” to display them.
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              No additional public metadata returned.
            </p>
          )}
        </div>

        <div className="pt-3 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-mono text-slate-500 tabular-nums">
                {formatDuration(item.duration)}
              </span>
              {safeHttpUrl(item.url) && (
                <a
                  href={safeHttpUrl(item.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#DC2626] font-medium hover:underline truncate"
                >
                  <span>Open URL</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              )}
            </div>

            {hasDetails && !item.errorMessage && (
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
                className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900 cursor-pointer shrink-0"
              >
                <span>{expanded ? 'Hide details' : 'View details'}</span>
                {expanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
