import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemMedia,
  ItemGroup,
  ItemSeparator,
} from "@/components/ui/item";
import { cn } from "@/lib/utils";
import { Circle, MessageSquare } from "lucide-react";

interface Contact {
  id: string;
  online: boolean;
}

interface ContactsListProps {
  contacts: string[];
  onlineUsers: Set<string>;
  onSelectContact: (contactId: string) => void;
}

export function ContactsList({
  contacts,
  onlineUsers,
  onSelectContact,
}: ContactsListProps) {
  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 text-muted-foreground p-6">
        <MessageSquare className="size-10 opacity-30" />
        <p className="text-xs text-center">
          No contacts yet. Go to settings to add friends.
        </p>
      </div>
    );
  }

  const sorted: Contact[] = contacts
    .map((id) => ({ id, online: onlineUsers.has(id) }))
    .sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

  return (
    <ItemGroup className="flex-1 overflow-y-auto">
      {sorted.map((contact, i) => (
        <div key={contact.id}>
          {i > 0 && <ItemSeparator />}
          <Item
            size="sm"
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => onSelectContact(contact.id)}
          >
            <ItemMedia variant="default">
              <Circle
                className={cn(
                  "size-2",
                  contact.online
                    ? "fill-green-500 text-green-500"
                    : "fill-muted-foreground/30 text-muted-foreground/30"
                )}
              />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{contact.id}</ItemTitle>
              <ItemDescription>
                {contact.online ? "Online" : "Offline"}
              </ItemDescription>
            </ItemContent>
          </Item>
        </div>
      ))}
    </ItemGroup>
  );
}
