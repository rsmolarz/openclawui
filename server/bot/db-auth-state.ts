import { proto } from "@whiskeysockets/baileys";
import { initAuthCreds, BufferJSON } from "@whiskeysockets/baileys";
import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from "@whiskeysockets/baileys";
import { db } from "../db";
import { waAuthState } from "@shared/schema";
import { eq } from "drizzle-orm";

async function dbGet(key: string): Promise<any | null> {
  try {
    const rows = await db.select().from(waAuthState).where(eq(waAuthState.key, key));
    if (rows.length === 0) return null;
    return JSON.parse(rows[0].value, BufferJSON.reviver);
  } catch (err) {
    console.error(`[WhatsApp Auth] Failed to read key "${key}":`, err);
    return null;
  }
}

async function dbSet(key: string, value: any): Promise<void> {
  try {
    const serialized = JSON.stringify(value, BufferJSON.replacer);
    await db
      .insert(waAuthState)
      .values({ key, value: serialized, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: waAuthState.key,
        set: { value: serialized, updatedAt: new Date() },
      });
  } catch (err) {
    console.error(`[WhatsApp Auth] Failed to write key "${key}":`, err);
    throw err;
  }
}

async function dbDelete(key: string): Promise<void> {
  try {
    await db.delete(waAuthState).where(eq(waAuthState.key, key));
  } catch (err) {
    console.error(`[WhatsApp Auth] Failed to delete key "${key}":`, err);
  }
}

export async function useDbAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clearAll: () => Promise<void>;
}> {
  const existingCreds = await dbGet("creds");
  const creds: AuthenticationCreds = existingCreds || initAuthCreds();
  const isNewSession = !existingCreds;

  if (isNewSession) {
    console.log("[WhatsApp Auth] No existing credentials found, initialized new session");
  } else {
    console.log("[WhatsApp Auth] Loaded existing credentials from database");
  }

  let saveCount = 0;

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          for (const id of ids) {
            const value = await dbGet(`${type}-${id}`);
            if (value) {
              if (type === "app-state-sync-key" && value) {
                data[id] = proto.Message.AppStateSyncKeyData.fromObject(value) as any;
              } else {
                data[id] = value;
              }
            }
          }
          return data;
        },
        set: async (data: any) => {
          const ops: Promise<void>[] = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) {
                ops.push(dbSet(key, value));
              } else {
                ops.push(dbDelete(key));
              }
            }
          }
          await Promise.all(ops);
        },
      },
    },
    saveCreds: async () => {
      saveCount++;
      try {
        await dbSet("creds", creds);
        if (saveCount <= 3 || saveCount % 10 === 0) {
          console.log(`[WhatsApp Auth] Credentials saved to database (save #${saveCount})`);
        }
      } catch (err) {
        console.error(`[WhatsApp Auth] CRITICAL: Failed to save credentials (save #${saveCount}):`, err);
      }
    },
    clearAll: async () => {
      await db.delete(waAuthState);
      console.log("[WhatsApp Auth] All auth state cleared from database");
    },
  };
}

export async function hasDbAuthState(): Promise<boolean> {
  try {
    const rows = await db.select().from(waAuthState).where(eq(waAuthState.key, "creds"));
    return rows.length > 0;
  } catch (err) {
    console.error("[WhatsApp Auth] Failed to check auth state:", err);
    return false;
  }
}

export async function clearAllDbAuthState(): Promise<void> {
  await db.delete(waAuthState);
  console.log("[WhatsApp Auth] All auth state cleared from database");
}
