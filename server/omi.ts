const OMI_BASE_URL = "https://api.omi.me/v1/dev";

function getOmiKey(): string | null {
  return process.env.OMI_API_KEY || null;
}

function omiHeaders(): Record<string, string> {
  const key = getOmiKey();
  if (!key) throw new Error("OMI_API_KEY not configured");
  return {
    "Authorization": `Bearer ${key}`,
    "Accept": "application/json",
  };
}

export function isOmiConfigured(): boolean {
  return !!getOmiKey();
}

export async function checkOmiConnection(): Promise<{ connected: boolean; error?: string }> {
  if (!isOmiConfigured()) return { connected: false, error: "OMI_API_KEY not set" };
  try {
    const res = await fetch(`${OMI_BASE_URL}/user/memories?limit=1`, { headers: omiHeaders() });
    if (res.ok) return { connected: true };
    const text = await res.text();
    return { connected: false, error: `API returned ${res.status}: ${text}` };
  } catch (err: any) {
    return { connected: false, error: err.message };
  }
}

export async function fetchOmiMemories(limit: number = 20, offset: number = 0): Promise<any[]> {
  const res = await fetch(`${OMI_BASE_URL}/user/memories?limit=${limit}&offset=${offset}`, { headers: omiHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Omi API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function fetchOmiActionItems(): Promise<any[]> {
  try {
    const res = await fetch(`${OMI_BASE_URL}/user/action-items`, { headers: omiHeaders() });
    if (!res.ok) {
      const memories = await fetchOmiMemories(50);
      const items: any[] = [];
      for (const mem of memories) {
        if (mem.structured?.action_items) {
          for (const item of mem.structured.action_items) {
            items.push({ ...item, memoryId: mem.id, memoryTitle: mem.structured?.title || "Untitled" });
          }
        }
      }
      return items;
    }
    return res.json();
  } catch {
    return [];
  }
}
