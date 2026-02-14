import { LazyStore } from "@tauri-apps/plugin-store";
import { ulid } from "ulidx";

const store = new LazyStore("pester-data.json");

// ── Identity ────────────────────────────────────────────────────────────────

export async function getOrCreateIdentity(): Promise<string> {
  const existing = await store.get<string>("ulid");
  if (existing) return existing;

  const id = ulid();
  await store.set("ulid", id);
  await store.save();
  return id;
}

// ── Contacts ────────────────────────────────────────────────────────────────

export async function loadContacts(): Promise<string[]> {
  const contacts = await store.get<string[]>("contacts");
  return contacts ?? [];
}

export async function persistContacts(contacts: string[]): Promise<void> {
  await store.set("contacts", contacts);
  await store.save();
}

// ── Recent chats (last 5) ───────────────────────────────────────────────────

export async function loadRecentChats(): Promise<string[]> {
  const recent = await store.get<string[]>("recent_chats");
  return recent ?? [];
}

export async function persistRecentChats(recent: string[]): Promise<void> {
  await store.set("recent_chats", recent);
  await store.save();
}

export function addToRecent(recents: string[], contactId: string): string[] {
  const filtered = recents.filter((r) => r !== contactId);
  return [contactId, ...filtered].slice(0, 5);
}

// ── Global shortcut preference ──────────────────────────────────────────────

export async function loadShortcut(): Promise<string | null> {
  return (await store.get<string>("shortcut")) ?? null;
}

export async function persistShortcut(shortcut: string | null): Promise<void> {
  await store.set("shortcut", shortcut);
  await store.save();
}
