type SearchConsoleConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  siteUrl: string;
};

export type SearchAnalyticsRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

function getConfig(): SearchConsoleConfig {
  const config = {
    clientId: process.env.GSC_CLIENT_ID || "",
    clientSecret: process.env.GSC_CLIENT_SECRET || "",
    refreshToken: process.env.GSC_REFRESH_TOKEN || "",
    siteUrl: process.env.GSC_SITE_URL || "https://www.sokaigelek.hu/",
  };
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new Error("Missing GSC_CLIENT_ID, GSC_CLIENT_SECRET or GSC_REFRESH_TOKEN");
  }
  return config;
}

async function getAccessToken(config: SearchConsoleConfig): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`Google OAuth token refresh failed (${response.status})`);
  }
  return String(payload.access_token);
}

async function gscFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = getConfig();
  const token = await getAccessToken(config);
  const response = await fetch(`https://www.googleapis.com/webmasters/v3${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Search Console API failed (${response.status}): ${JSON.stringify(payload).slice(0, 500)}`);
  }
  return payload as T;
}

function sitePath(...parts: string[]): string {
  const siteUrl = getConfig().siteUrl;
  return parts.map(encodeURIComponent).join("/").replace(/^/, `/sites/${encodeURIComponent(siteUrl)}/`);
}

export async function querySearchAnalytics(
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit = 1000,
): Promise<SearchAnalyticsRow[]> {
  const result = await gscFetch<{ rows?: SearchAnalyticsRow[] }>(sitePath("searchAnalytics", "query"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions,
      type: "web",
      dataState: "final",
      rowLimit: Math.min(Math.max(rowLimit, 1), 25000),
    }),
  });
  return result.rows || [];
}

export async function listSitemaps(): Promise<unknown> {
  return gscFetch(sitePath("sitemaps"));
}

export async function inspectUrl(url: string): Promise<unknown> {
  const config = getConfig();
  const token = await getAccessToken(config);
  const response = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: config.siteUrl, languageCode: "hu-HU" }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`URL Inspection failed (${response.status}): ${JSON.stringify(payload).slice(0, 500)}`);
  }
  return payload;
}

export function getSearchConsoleSiteUrl(): string {
  return getConfig().siteUrl;
}
