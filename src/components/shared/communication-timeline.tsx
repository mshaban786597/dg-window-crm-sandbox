import { Phone, MessageSquare, Mail, StickyNote, Calendar, FileText, Hammer, Star, PackageOpen } from "lucide-react";
import type { Communication } from "@/types/database";
import { formatDateTime } from "@/lib/utils";

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  text: MessageSquare,
  email: Mail,
  note: StickyNote,
  appointment: Calendar,
  quote: FileText,
  job: Hammer,
  review: Star,
  order: PackageOpen,
};

interface CommunicationTimelineProps {
  communications: Communication[];
}

export function CommunicationTimeline({ communications }: CommunicationTimelineProps) {
  if (communications.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No communications yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {communications.map((comm) => {
        const Icon = TYPE_ICONS[comm.type] || StickyNote;
        return (
          <div key={comm.id} className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{comm.subject}</p>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDateTime(comm.created_at)}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{comm.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">by {comm.created_by}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
