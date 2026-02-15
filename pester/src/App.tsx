import { useState, useCallback, useEffect, useRef } from "react";
import "./App.css";
import { usePubSub } from "@/lib/use-pubsub";
import { Titlebar } from "@/components/titlebar";
import { ContactsList } from "@/components/contacts-list";
import { MessageView } from "@/components/message-view";
import { SettingsPage } from "@/components/settings-page";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings } from "lucide-react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  getOrCreateIdentity,
  loadContacts,
  persistContacts,
  loadRecentChats,
  persistRecentChats,
  addToRecent,
  loadShortcut,
} from "@/lib/use-identity";
import {
  register as registerShortcut,
} from "@tauri-apps/plugin-global-shortcut";
import { getCurrentWindow } from "@tauri-apps/api/window";

type Page = "contacts" | "chat" | "settings";

function App() {
  const {
    status,
    userId,
    conversations,
    activeFriendId,
    setActiveFriendId,
    typingUsers,
    error,
    register,
    ensureConversation,
    sendMessage,
    sendTyping,
  } = usePubSub();

  const [page, setPage] = useState<Page>("contacts");
  const [contacts, setContacts] = useState<string[]>([]);
  const [recentChats, setRecentChats] = useState<string[]>([]);
  const [identity, setIdentity] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  // ── Bootstrap: load identity + contacts + register ─────────────────────
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    (async () => {
      try {
        const [id, saved, recent, shortcut] = await Promise.all([
          getOrCreateIdentity(),
          loadContacts(),
          loadRecentChats(),
          loadShortcut(),
        ]);

        setIdentity(id);
        setContacts(saved);
        setRecentChats(recent);

        // Update tray with recent chats
        await invoke("update_tray_menu", { recentUsers: recent }).catch(() => {});

        // Register global shortcut if saved
        if (shortcut) {
          try {
            await registerShortcut(shortcut, async () => {
              const win = getCurrentWindow();
              await win.show();
              await win.setFocus();
            });
          } catch {
            // shortcut registration failed, ignore
          }
        }

        // Auto-connect with ULID
        await register(id);
      } catch {
        // store unavailable, generate ephemeral id
        const { ulid } = await import("ulidx");
        const id = ulid();
        setIdentity(id);
        await register(id);
      } finally {
        setLoading(false);
      }
    })();
  }, [register]);

  // ── Persist contacts to store ──────────────────────────────────────────
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;
  useEffect(() => {
    if (!loading) {
      persistContacts(contacts).catch(() => {});
    }
  }, [contacts, loading]);

  // ── Persist recent chats + update tray ─────────────────────────────────
  useEffect(() => {
    if (!loading) {
      persistRecentChats(recentChats).catch(() => {});
      invoke("update_tray_menu", { recentUsers: recentChats }).catch(() => {});
    }
  }, [recentChats, loading]);

  // ── Listen for tray menu actions ───────────────────────────────────────
  useEffect(() => {
    const unlisten = listen<string>("tray-action", (event) => {
      const action = event.payload;
      if (action === "new_contact") {
        setPage("settings");
      } else if (action.startsWith("chat:")) {
        const contactId = action.slice(5);
        // Auto-add as contact if not present
        setContacts((prev) => {
          if (prev.includes(contactId)) return prev;
          return [...prev, contactId];
        });
        ensureConversation(contactId);
        setActiveFriendId(contactId);
        setPage("chat");
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [ensureConversation, setActiveFriendId]);

  // ── Notification for incoming messages ──────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    const notify = async (fromUser: string, text: string) => {
      let granted = await isPermissionGranted();
      if (!granted) {
        const perm = await requestPermission();
        granted = perm === "granted";
      }
      if (granted) {
        sendNotification({ title: fromUser, body: text });
      }
    };

    for (const conv of conversations.values()) {
      const msgs = conv.messages;
      if (msgs.length > 0) {
        const last = msgs[msgs.length - 1];
        if (
          last.fromUserId !== userId &&
          conv.friendId !== activeFriendId &&
          Date.now() - last.timestamp < 2000
        ) {
          notify(last.fromUserId, last.text);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, userId, activeFriendId]);

  // ── Contact actions ─────────────────────────────────────────────────────
  const addContact = useCallback((id: string) => {
    setContacts((prev) => {
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
  }, []);

  const removeContact = useCallback((id: string) => {
    setContacts((prev) => prev.filter((c) => c !== id));
  }, []);

  // ── Select contact → navigate to chat ──────────────────────────────────
  const handleSelectContact = useCallback(
    (contactId: string) => {
      ensureConversation(contactId);
      setActiveFriendId(contactId);
      setRecentChats((prev) => addToRecent(prev, contactId));
      setPage("chat");
    },
    [ensureConversation, setActiveFriendId]
  );

  // ── Loading state with skeleton ───────────────────────────────────────
  if (loading || status === "connecting" || status === "connected") {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
        <Titlebar />
        <div className="flex flex-col flex-1 p-3 gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <div className="flex items-center justify-center flex-1">
            <Spinner className="size-5" />
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (error && status !== "registered") {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
        <Titlebar />
        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6">
          <p className="text-xs text-destructive text-center">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => identity && register(identity)}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const activeConversation = activeFriendId
    ? conversations.get(activeFriendId)
    : undefined;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      {page !== "settings" && page !== "chat" && (
        <Titlebar>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setPage("settings")}
            className="hover:bg-muted"
          >
            <Settings className="size-3" />
          </Button>
        </Titlebar>
      )}

      {page === "contacts" && (
        <ContactsList
          contacts={contacts}
          onSelectContact={handleSelectContact}
        />
      )}

      {page === "chat" && activeFriendId && (
        <MessageView
          friendId={activeFriendId}
          messages={activeConversation?.messages ?? []}
          userId={userId ?? ""}
          typingUsers={typingUsers}
          onSendMessage={sendMessage}
          onSendTyping={sendTyping}
          onBack={() => {
            setActiveFriendId(null);
            setPage("contacts");
          }}
        />
      )}

      {page === "chat" && !activeFriendId && (
        <div className="flex items-center justify-center h-full">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage("contacts")}
          >
            Back to contacts
          </Button>
        </div>
      )}

      {page === "settings" && (
        <SettingsPage
          identity={identity}
          contacts={contacts}
          onAddContact={addContact}
          onRemoveContact={removeContact}
          onBack={() => setPage("contacts")}
        />
      )}
    </div>
  );
}

export default App;
