import { proto } from "@whiskeysockets/baileys";
import { initAuthCreds, BufferJSON } from "@whiskeysockets/baileys";
import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from "@whiskeysockets/baileys";
import { db } from "../db";
import { waAuthState } from "@shared/schema";
import { eq } from "drizzle-orm";

async function dbGet(key: string): Promise<any | null> {
  const rows = await db.select().from(waAuthState).where(eq(waAuthState.key, key));
  if (rows.length === 0) return null;
  return JSON.parse(rows[0].value, BufferJSON.reviver);
}

async function dbSet(key: string, value: any): Promise<void> {
  const serialized = JSON.stringify(value, BufferJSON.replacer);
  await db
    .insert(waAuthState)
    .values({ key, value: serialized, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: waAuthState.key,
      set: { value: serialized, updatedAt: new Date() },
    });
}

async function dbDelete(key: string): Promise<void> {
  await db.delete(waAuthState).where(eq(waAuthState.key, key));
}

export async function useDbAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clearAll: () => Promise<void>;
}> {
  const creds: AuthenticationCreds = (await dbGet("creds")) || initAuthCreds();

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
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) {
                await dbSet(key, value);
              } else {
                await dbDelete(key);
              }
            }
          }
        },
      },
    },
    saveCreds: async () => {
      await dbSet("creds", creds);
    },
    clearAll: async () => {
      await db.delete(waAuthState);
    },
  };
}

export async function hasDbAuthState(): Promise<boolean> {
  const rows = await db.select().from(waAuthState).where(eq(waAuthState.key, "creds"));
  return rows.length > 0;
}

export async function clearAllDbAuthState(): Promise<void> {
  await db.delete(waAuthState);
  console.log("[WhatsApp] All auth state cleared from database");
}
