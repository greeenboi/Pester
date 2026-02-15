import { useState, useRef, useEffect } from "react";
import * as v from "valibot";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from "@/components/ui/input-group";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
} from "@/components/ui/item";
import { cn } from "@/lib/utils";
import { ArrowLeft, Send, Check, Circle, Copy, Minus, X } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Channel, ChatMessage } from "@/lib/types";

const MessageSchema = v.pipe(
  v.string(),
  v.trim(),
  v.nonEmpty("Message cannot be empty"),
  v.maxLength(300, "Message must be 300 characters or less"),
);

interface MessageViewProps {
  channel: Channel;
  userId: string;
  typingUsers: Map<string, number>;
  onSendMessage: (channelId: string, text: string) => void;
  onSendTyping: (channelId: string) => void;
  onBack: () => void;
}

export function MessageView({
  channel,
  userId,
  typingUsers,
  onSendMessage,
  onSendTyping,
  onBack,
}: MessageViewProps) {
  const [text, setText] = useState("");
  const [sentConfirm, setSentConfirm] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingThrottle = useRef<number>(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  });

  const validationError = (() => {
    if (!text.trim()) return null;
    const result = v.safeParse(MessageSchema, text);
    if (result.success) return null;
    return result.issues[0]?.message ?? "Invalid message";
  })();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = v.safeParse(MessageSchema, text);
    if (!result.success) return;

    onSendMessage(channel.channelId, result.output);
    setText("");

    // Show sent confirmation
    const confirmId = `${Date.now()}`;
    setSentConfirm(confirmId);
    setTimeout(() => setSentConfirm((prev) => (prev === confirmId ? null : prev)), 2000);
  };

  const handleInput = (value: string) => {
    setText(value);
    const now = Date.now();
    if (now - typingThrottle.current > 1000) {
      typingThrottle.current = now;
      onSendTyping(channel.channelId);
    }
  };

  const handleCopyMessage = async (msg: ChatMessage) => {
    try {
      await writeText(msg.text);
    } catch {
      // clipboard not available
    }
  };

  const friendTyping = typingUsers.has(channel.friendId);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div data-tauri-drag-region className="flex items-center gap-2 px-2 h-8 border-b bg-card shrink-0">
        <Button variant="ghost" size="icon-xs" onClick={onBack}>
          <ArrowLeft className="size-3.5" />
        </Button>
        <Circle
          className={cn(
            "size-2",
            channel.friendOnline
              ? "fill-green-500 text-green-500"
              : "fill-muted-foreground/30 text-muted-foreground/30"
          )}
        />
        <div className="flex flex-col min-w-0 flex-1 pointer-events-none">
          <span className="text-xs font-medium truncate">{channel.friendId}</span>
          <span className="text-[10px] text-muted-foreground leading-none">
            {channel.friendOnline ? "online" : "offline"}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-xs" onClick={() => getCurrentWindow().minimize()} className="hover:bg-muted">
            <Minus className="size-3" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={() => getCurrentWindow().hide()} className="hover:bg-destructive hover:text-white">
            <X className="size-3" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {channel.messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-muted-foreground">
              Send a message to start chatting
            </p>
          </div>
        ) : (
          <ItemGroup className="py-1">
            {channel.messages.map((msg, i) => {
              const isMe = msg.fromUserId === userId;
              return (
                <div key={msg.id}>
                  {i > 0 && <ItemSeparator />}
                  <Item
                    size="sm"
                    variant="default"
                    className={cn(
                      "group/msg",
                      isMe && "bg-primary/5"
                    )}
                  >
                    <ItemContent>
                      <ItemTitle
                        className={cn(
                          "text-xs",
                          isMe ? "text-primary" : "text-foreground"
                        )}
                      >
                        {isMe ? "You" : msg.fromUserId}
                        <span className="text-[10px] text-muted-foreground font-normal ml-1">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </ItemTitle>
                      <ItemDescription className="text-xs line-clamp-none!">
                        {msg.text}
                      </ItemDescription>
                    </ItemContent>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="opacity-0 group-hover/msg:opacity-100 transition-opacity shrink-0"
                      onClick={() => handleCopyMessage(msg)}
                    >
                      <Copy className="size-3" />
                    </Button>
                  </Item>
                </div>
              );
            })}
          </ItemGroup>
        )}

        {/* Typing indicator */}
        {friendTyping && (
          <div className="px-3 py-1">
            <span className="text-[10px] text-muted-foreground italic">
              {channel.friendId} is typing…
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Sent confirmation */}
      {sentConfirm && (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 border-t border-green-500/20">
          <Check className="size-3 text-green-500" />
          <span className="text-[10px] text-green-600 dark:text-green-400">
            Message sent
          </span>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="shrink-0 border-t bg-card p-2">
        <InputGroup>
          <InputGroupInput
            placeholder="Type a message…"
            value={text}
            type="text"
            onChange={(e) => handleInput(e.target.value)}
            maxLength={300}
            className="text-xs h-8"
            autoFocus
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="submit"
              size="icon-xs"
              variant="ghost"
              disabled={!text.trim() || !!validationError}
            >
              <Send className="size-3.5" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {validationError && (
          <p className="text-[10px] text-destructive mt-1 px-1">{validationError}</p>
        )}
        {text.trim().length > 0 && (
          <p className={cn(
            "text-[10px] mt-0.5 px-1",
            text.trim().length > 280 ? "text-destructive" : "text-muted-foreground"
          )}>
            {text.trim().length}/300
          </p>
        )}
      </form>
    </div>
  );
}
