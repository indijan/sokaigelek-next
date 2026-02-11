const BREVO_API_BASE = "https://api.brevo.com/v3";
const DEFAULT_BREVO_FOLDER_NAME = process.env.BREVO_FOLDER_NAME || "sokaigelek";

type BrevoList = { id: number; name: string };
type BrevoFolder = { id: number; name: string };

let listCache: Map<string, string> | null = null;
let folderIdCache: number | null = null;

function getBrevoKey() {
  const key = process.env.BREVO_API_KEY || process.env.MAILERLITE_API_KEY || "";
  if (!key) {
    throw new Error("Missing BREVO_API_KEY");
  }
  return key;
}

async function brevoRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; allowNoContent?: boolean } = {}
): Promise<T> {
  const res = await fetch(`${BREVO_API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "api-key": getBrevoKey(),
      Accept: "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo ${res.status} ${res.statusText}: ${text}`);
  }

  if (options.allowNoContent && res.status === 204) {
    return {} as T;
  }
  if (res.status === 204) {
    return {} as T;
  }
  return (await res.json()) as T;
}

async function getOrCreateFolderId(name: string): Promise<number> {
  if (folderIdCache) return folderIdCache;

  const all = await brevoRequest<{ folders?: BrevoFolder[]; count?: number }>(
    "/contacts/folders?limit=50&offset=0&sort=desc"
  );
  const exact = (all.folders || []).find((f) => f.name === name);
  if (exact) {
    folderIdCache = exact.id;
    return exact.id;
  }

  const created = await brevoRequest<{ id: number }>("/contacts/folders", {
    method: "POST",
    body: { name },
  });
  folderIdCache = created.id;
  return created.id;
}

export async function getOrCreateGroupId(name: string): Promise<string> {
  if (!listCache) {
    listCache = new Map();
  }
  const cached = listCache.get(name);
  if (cached) return cached;

  const all = await brevoRequest<{ lists?: BrevoList[]; count?: number }>(
    "/contacts/lists?limit=50&offset=0&sort=desc"
  );
  const exact = (all.lists || []).find((l) => l.name === name);
  if (exact) {
    const id = String(exact.id);
    listCache.set(name, id);
    return id;
  }

  const folderId = await getOrCreateFolderId(DEFAULT_BREVO_FOLDER_NAME);
  const created = await brevoRequest<{ id: number }>("/contacts/lists", {
    method: "POST",
    body: {
      name,
      folderId,
    },
  });
  const id = String(created.id);
  listCache.set(name, id);
  return id;
}

export async function upsertSubscriber(email: string, groupId: string, name?: string | null) {
  const trimmedName = String(name || "").trim();
  const payload: {
    email: string;
    listIds: number[];
    updateEnabled: boolean;
    attributes?: Record<string, string>;
  } = {
    email,
    listIds: [Number(groupId)],
    updateEnabled: true,
  };
  if (trimmedName) {
    payload.attributes = { FIRSTNAME: trimmedName };
  }
  const res = await brevoRequest<{ id?: number; message?: string }>("/contacts", {
    method: "POST",
    body: payload,
  });
  return { data: { id: res.id ? String(res.id) : undefined } };
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
  const updateFormIdRaw = process.env.BREVO_UPDATE_FORM_ID || "";
  const payload = {
    name: input.name,
    subject: input.subject,
    sender: {
      name: input.fromName,
      email: input.fromEmail,
    },
    replyTo: input.replyTo || undefined,
    htmlContent: input.html,
    recipients: {
      listIds: [Number(input.groupId)],
    },
    updateFormId: updateFormIdRaw || undefined,
  };
  const created = await brevoRequest<{ id: number }>("/emailCampaigns", {
    method: "POST",
    body: payload,
  });
  return { data: { id: String(created.id), name: input.name } };
}

export async function scheduleCampaignNow(campaignId: string) {
  await brevoRequest<{}>(`/emailCampaigns/${encodeURIComponent(campaignId)}/sendNow`, {
    method: "POST",
    allowNoContent: true,
  });
  return { data: { id: campaignId } };
}
