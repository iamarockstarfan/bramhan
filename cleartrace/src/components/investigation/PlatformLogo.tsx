import React, { useState } from "react";
import { Globe } from "lucide-react";
import { InvestigationResultItem } from "@/src/types/investigation";

const DOMAIN_BY_PLATFORM: Record<string, string> = {
  google: "google.com",
  googleaccount: "google.com",
  github: "github.com",
  githubgist: "gist.github.com",
  pinterest: "pinterest.com",
  twitter: "x.com",
  x: "x.com",
  instagram: "instagram.com",
  facebook: "facebook.com",
  linkedin: "linkedin.com",
  reddit: "reddit.com",
  discord: "discord.com",
  spotify: "spotify.com",
  amazon: "amazon.com",
  microsoft: "microsoft.com",
  dropbox: "dropbox.com",
  adobe: "adobe.com",
  youtube: "youtube.com",
};

function platformDomain(item: InvestigationResultItem): string | undefined {
  if (item.url) {
    try {
      const url = new URL(item.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
      return url.hostname.replace(/^www\./i, "");
    } catch {
      return undefined;
    }
  }
  const name = item.platform.toLowerCase().replace(/[\s._-]/g, "");
  const knownDomain = DOMAIN_BY_PLATFORM[name];
  if (knownDomain) return knownDomain;
  const directDomain = item.platform.match(/(?:^|\s)([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i)?.[1];
  return directDomain?.replace(/^www\./i, "");
}

export function PlatformLogo({
  item,
  className = "w-9 h-9",
}: {
  item: InvestigationResultItem;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const domain = platformDomain(item);
  const imageUrl = domain
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
    : undefined;

  return (
    <span className={`${className} rounded-lg border border-slate-200 bg-white flex items-center justify-center shrink-0 overflow-hidden`}>
      {imageUrl && !failed ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-6 h-6 object-contain"
        />
      ) : (
        <Globe className="w-4 h-4 text-slate-400" />
      )}
    </span>
  );
}
