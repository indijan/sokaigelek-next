import crypto from "crypto";

type ArticleSocialPayload = {
  slug: string;
  title?: string | null;
  excerpt?: string | null;
  cover_image_url?: string | null;
};

export type ArticleSocialResult = {
  status: "ok" | "skipped" | "error";
  reason?: string;
  id?: string | null;
};

function encodeOauth(input: string) {
  return encodeURIComponent(input).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildOAuthHeader({
  method,
  url,
  consumerKey,
  consumerSecret,
  token,
  tokenSecret,
}: {
  method: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
}) {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: "1.0",
  };

  const baseUrl = url.split("?")[0];
  const paramString = Object.keys(oauthParams)
    .sort()
    .map((key) => `${encodeOauth(key)}=${encodeOauth(oauthParams[key])}`)
    .join("&");
  const baseString = [method.toUpperCase(), encodeOauth(baseUrl), encodeOauth(paramString)].join("&");
  const signingKey = `${encodeOauth(consumerSecret)}&${encodeOauth(tokenSecret)}`;
  oauthParams.oauth_signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  return `OAuth ${Object.keys(oauthParams)
    .sort()
    .map((key) => `${encodeOauth(key)}="${encodeOauth(oauthParams[key])}"`)
    .join(", ")}`;
}

async function postToFacebook(article: ArticleSocialPayload) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !accessToken) return { skipped: true, reason: "missing_env" };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sokaigelek.hu";
  const link = `${siteUrl.replace(/\/$/, "")}/cikkek/${article.slug}`;
  const message = [article.title, article.excerpt].filter(Boolean).join("\n\n");
  const body = new URLSearchParams({
    message,
    link,
    access_token: accessToken,
  });

  const response = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
    method: "POST",
    body,
  });
  const data = await response.json();
  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || "facebook_error");
  }

  return { ok: true, post_id: data?.id || null };
}

async function postToX(article: ArticleSocialPayload) {
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  const consumerKey = process.env.X_CONSUMER_KEY;
  const consumerSecret = process.env.X_CONSUMER_SECRET;
  if (!accessToken || !accessTokenSecret || !consumerKey || !consumerSecret) {
    return { skipped: true, reason: "missing_env" };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sokaigelek.hu";
  const link = `${siteUrl.replace(/\/$/, "")}/cikkek/${article.slug}`;
  const body = [String(article.title || "").trim(), String(article.excerpt || "").trim()]
    .filter(Boolean)
    .join("\n\n");
  const suffix = body ? `\n\n${link}` : link;
  const maxLen = 280;
  const allowedBodyLen = Math.max(0, maxLen - suffix.length);
  const trimmedBody =
    allowedBodyLen > 0 && body.length > allowedBodyLen
      ? body.slice(0, allowedBodyLen).replace(/\s+\S*$/, "").trim()
      : body;
  const text = trimmedBody ? `${trimmedBody}\n\n${link}` : link;

  const url = "https://api.x.com/2/tweets";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: buildOAuthHeader({
        method: "POST",
        url,
        consumerKey,
        consumerSecret,
        token: accessToken,
        tokenSecret: accessTokenSecret,
      }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  const data = await response.json();
  if (!response.ok || data?.errors) {
    const errorMessage =
      data?.errors?.[0]?.message ||
      data?.error?.message ||
      (typeof data?.detail === "string" ? data.detail : null) ||
      (typeof data?.title === "string" ? data.title : null) ||
      null;
    const extra = typeof data === "string" ? data : JSON.stringify(data).slice(0, 600);
    throw new Error(errorMessage ? `${errorMessage} | ${extra}` : `x_error | ${extra}`);
  }

  return { ok: true, tweet_id: data?.data?.id || null };
}

export async function postArticleToSocial(article: ArticleSocialPayload): Promise<Record<string, ArticleSocialResult>> {
  const results: Record<string, ArticleSocialResult> = {};

  try {
    const fbRes = await postToFacebook(article);
    results.facebook = fbRes?.skipped
      ? { status: "skipped", reason: fbRes.reason }
      : { status: "ok", id: fbRes.post_id };
  } catch (err: unknown) {
    results.facebook = {
      status: "error",
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    const xRes = await postToX(article);
    results.x = xRes?.skipped ? { status: "skipped", reason: xRes.reason } : { status: "ok", id: xRes.tweet_id };
  } catch (err: unknown) {
    results.x = {
      status: "error",
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  return results;
}
