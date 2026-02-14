import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemActions,
  ItemGroup,
  ItemSeparator,
} from "@/components/ui/item";
import { ArrowLeft, Plus, Trash2, Minus, X, Copy, Check, Keyboard } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  register as registerShortcut,
  unregister as unregisterShortcut,
  isRegistered,
} from "@tauri-apps/plugin-global-shortcut";
import { loadShortcut, persistShortcut } from "@/lib/use-identity";

const SHORTCUT_PRESETS = [
  { label: "Ctrl+Shift+P", value: "CommandOrControl+Shift+P" },
  { label: "Ctrl+Alt+P", value: "CommandOrControl+Alt+P" },
  { label: "Ctrl+Shift+M", value: "CommandOrControl+Shift+M" },
  { label: "Ctrl+`", value: "CommandOrControl+`" },
];

interface SettingsPageProps {
  identity: string | null;
  contacts: string[];
  onAddContact: (id: string) => void;
  onRemoveContact: (id: string) => void;
  onBack: () => void;
}

export function SettingsPage({
  identity,
  contacts,
  onAddContact,
  onRemoveContact,
  onBack,
}: SettingsPageProps) {
  const [newContact, setNewContact] = useState("");
  const [autostart, setAutostart] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [currentShortcut, setCurrentShortcut] = useState<string | null>(null);
  const [shortcutLoading, setShortcutLoading] = useState(false);

  useEffect(() => {
    isEnabled().then(setAutostart).catch(() => {});
    loadShortcut().then(setCurrentShortcut).catch(() => {});
  }, []);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newContact.trim();
    if (trimmed && !contacts.includes(trimmed)) {
      onAddContact(trimmed);
      setNewContact("");
    }
  };

  const handleCopyId = async () => {
    if (!identity) return;
    try {
      await writeText(identity);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  const handleAutostartToggle = async (checked: boolean) => {
    try {
      if (checked) {
        await enable();
      } else {
        await disable();
      }
      setAutostart(checked);
    } catch {
      // autostart not available
    }
  };

  const handleSetShortcut = useCallback(async (shortcut: string) => {
    setShortcutLoading(true);
    try {
      // Unregister old shortcut if any
      if (currentShortcut) {
        try {
          const registered = await isRegistered(currentShortcut);
          if (registered) await unregisterShortcut(currentShortcut);
        } catch {
          // ignore
        }
      }

      // Register new one
      await registerShortcut(shortcut, async () => {
        const win = getCurrentWindow();
        await win.show();
        await win.setFocus();
      });

      setCurrentShortcut(shortcut);
      await persistShortcut(shortcut);
    } catch {
      // registration failed
    } finally {
      setShortcutLoading(false);
    }
  }, [currentShortcut]);

  const handleClearShortcut = useCallback(async () => {
    if (!currentShortcut) return;
    setShortcutLoading(true);
    try {
      const registered = await isRegistered(currentShortcut);
      if (registered) await unregisterShortcut(currentShortcut);
      setCurrentShortcut(null);
      await persistShortcut(null);
    } catch {
      // ignore
    } finally {
      setShortcutLoading(false);
    }
  }, [currentShortcut]);

  /** Convert "CommandOrControl+Shift+P" to renderable key parts */
  const renderShortcutKeys = (shortcut: string) => {
    const keys = shortcut
      .replace("CommandOrControl", "Ctrl")
      .split("+");
    return (
      <KbdGroup>
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </KbdGroup>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div data-tauri-drag-region className="flex items-center gap-2 px-2 h-8 border-b bg-card shrink-0">
        <Button variant="ghost" size="icon-xs" onClick={onBack}>
          <ArrowLeft className="size-3.5" />
        </Button>
        <span className="text-xs font-semibold flex-1 pointer-events-none">Settings</span>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-xs" onClick={() => getCurrentWindow().minimize()} className="hover:bg-muted">
            <Minus className="size-3" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={() => getCurrentWindow().hide()} className="hover:bg-destructive hover:text-white">
            <X className="size-3" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Your ID */}
        {identity && (
          <>
            <div className="p-3">
              <Label className="text-xs mb-2">Your ID</Label>
              <div className="flex items-center gap-2 mt-1.5">
                <code className="text-[10px] bg-muted px-2 py-1 rounded flex-1 truncate select-all font-mono">
                  {identity}
                </code>
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={handleCopyId}
                >
                  {copiedId ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Share this ID with friends so they can add you.
              </p>
            </div>
            <Separator />
          </>
        )}

        {/* Add contact */}
        <div className="p-3">
          <Label htmlFor="add-contact" className="text-xs mb-2">
            Add Contact
          </Label>
          <form onSubmit={handleAdd} className="flex gap-2 mt-1.5">
            <Input
              id="add-contact"
              placeholder="Paste a ULID…"
              value={newContact}
              onChange={(e) => setNewContact(e.target.value)}
              className="h-7 text-xs flex-1"
            />
            <Button
              type="submit"
              size="icon-xs"
              variant="outline"
              disabled={!newContact.trim()}
            >
              <Plus className="size-3" />
            </Button>
          </form>
        </div>

        <Separator />

        {/* Contact list */}
        <div className="p-3">
          <Label className="text-xs">Contacts ({contacts.length})</Label>
        </div>

        {contacts.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center px-3 pb-3">
            No contacts added yet.
          </p>
        ) : (
          <ItemGroup>
            {contacts.map((id, i) => (
              <div key={id}>
                {i > 0 && <ItemSeparator />}
                <Item size="sm">
                  <ItemContent>
                    <ItemTitle className="text-xs font-mono truncate">{id}</ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onRemoveContact(id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </ItemActions>
                </Item>
              </div>
            ))}
          </ItemGroup>
        )}

        <Separator className="my-2" />

        {/* Global shortcut */}
        <div className="px-3 py-2">
          <Label className="text-xs mb-2 flex items-center gap-1.5">
            <Keyboard className="size-3" />
            Global Shortcut
          </Label>

          {currentShortcut ? (
            <div className="flex items-center justify-between mt-2">
              {renderShortcutKeys(currentShortcut)}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleClearShortcut}
                disabled={shortcutLoading}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground mt-1 mb-2">
              Choose a shortcut to quickly open Pester
            </p>
          )}

          <div className="flex flex-wrap gap-1.5 mt-2">
            {SHORTCUT_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                variant={currentShortcut === preset.value ? "default" : "outline"}
                size="sm"
                className="text-[10px] h-6 px-2"
                onClick={() => handleSetShortcut(preset.value)}
                disabled={shortcutLoading || currentShortcut === preset.value}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        <Separator className="my-2" />

        {/* Autostart toggle */}
        <div className="px-3 py-2">
          <Item size="sm" variant="default">
            <ItemContent>
              <ItemTitle className="text-xs">Launch at startup</ItemTitle>
            </ItemContent>
            <ItemActions>
              <Switch
                size="sm"
                checked={autostart}
                onCheckedChange={handleAutostartToggle}
              />
            </ItemActions>
          </Item>
        </div>
      </div>
    </div>
  );
}
