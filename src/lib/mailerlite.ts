const MAILERLITE_API_BASE = "https://connect.mailerlite.com/api";

type MailerLiteResponse<T> = { data: T };

let groupCache: Map<string, string> | null = null;

function getMailerLiteKey() {
  const key = process.env.MAILERLITE_API_KEY || "";
  if (!key) {
    throw new Error("Missing MAILERLITE_API_KEY");
  }
  return key;
}

async function mailerliteRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`${MAILERLITE_API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getMailerLiteKey()}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MailerLite ${res.status} ${res.statusText}: ${text}`);
  }

  return (await res.json()) as T;
}

export async function getOrCreateGroupId(name: string): Promise<string> {
  if (!groupCache) {
    groupCache = new Map();
  }
  const cached = groupCache.get(name);
  if (cached) return cached;

  const search = await mailerliteRequest<MailerLiteResponse<Array<{ id: string; name: string }>>>(
    `/groups?filter[name]=${encodeURIComponent(name)}`
  );
  const exact = (search.data || []).find((g) => g.name === name);
  if (exact) {
    groupCache.set(name, exact.id);
    return exact.id;
  }

  const created = await mailerliteRequest<MailerLiteResponse<{ id: string; name: string }>>(
    "/groups",
    { method: "POST", body: { name } }
  );
  groupCache.set(name, created.data.id);
  return created.data.id;
}

export async function upsertSubscriber(email: string, groupId: string) {
  const body = { email, groups: [groupId] };
  return mailerliteRequest<MailerLiteResponse<{ id: string; email: string; status: string }>>(
    "/subscribers",
    { method: "POST", body }
  );
}

export async function createCampaign(input: {
  name: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  html: string;
  groupId: string;
}) {
  const body = {
    name: input.name,
    type: "regular",
    emails: [
      {
        subject: input.subject,
        from_name: input.fromName,
        from: input.fromEmail,
        reply_to: input.replyTo,
        content: input.html,
      },
    ],
    groups: [input.groupId],
  };
  return mailerliteRequest<MailerLiteResponse<{ id: string; name: string }>>("/campaigns", {
    method: "POST",
    body,
  });
}

export async function scheduleCampaignNow(campaignId: string) {
  const body = { delivery: "instant" };
  return mailerliteRequest<MailerLiteResponse<{ id: string }>>(
    `/campaigns/${encodeURIComponent(campaignId)}/schedule`,
    { method: "POST", body }
  );
}
