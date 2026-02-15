import {
  Item,
  ItemContent,
  ItemTitle,
  ItemGroup,
  ItemSeparator,
} from "@/components/ui/item";
import { MessageSquare } from "lucide-react";

interface ContactsListProps {
  contacts: string[];
  onSelectContact: (contactId: string) => void;
}

export function ContactsList({
  contacts,
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

  const sorted = [...contacts].sort((a, b) => a.localeCompare(b));

  return (
    <ItemGroup className="flex-1 overflow-y-auto">
      {sorted.map((contactId, i) => (
        <div key={contactId}>
          {i > 0 && <ItemSeparator />}
          <Item
            size="sm"
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => onSelectContact(contactId)}
          >
            <ItemContent>
              <ItemTitle>{contactId}</ItemTitle>
            </ItemContent>
          </Item>
        </div>
      ))}
    </ItemGroup>
  );
}
