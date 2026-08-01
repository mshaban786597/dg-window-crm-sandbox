"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { useCRMStore } from "@/lib/store/crm-store";
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { CalendarEventFormDialog } from "@/components/calendar/calendar-event-form-dialog";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { SelectField } from "@/components/ui/select-field";
import { CALENDAR_EVENT_TYPES, CALENDAR_EVENT_TYPE_LABELS } from "@/lib/constants";
import type { ScheduleEvent, CalendarEventType } from "@/types/database";

const VIEWS = ["day", "week", "month", "crew"] as const;

// Blue-forward palette. Red is reserved for payment (money due / urgent).
const TYPE_COLORS: Record<CalendarEventType, string> = {
  measurement: "bg-blue-100 text-blue-800 border-blue-200",
  installation: "bg-brand-blue-light text-brand-blue border-blue-200",
  repair: "bg-amber-100 text-amber-800 border-amber-200",
  delivery: "bg-cyan-100 text-cyan-800 border-cyan-200",
  inspection: "bg-teal-100 text-teal-800 border-teal-200",
  follow_up: "bg-purple-100 text-purple-800 border-purple-200",
  payment: "bg-red-100 text-red-700 border-red-200",
  review: "bg-yellow-100 text-yellow-800 border-yellow-200",
  internal: "bg-slate-100 text-slate-800 border-slate-200",
};

export default function CalendarPage() {
  const [view, setView] = useState<(typeof VIEWS)[number]>("week");
  const [typeFilter, setTypeFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<ScheduleEvent | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const events = useCRMStore((s) => s.scheduleEvents);
  const crews = useCRMStore((s) => s.crews);
  const deleteCalendarEvent = useCRMStore((s) => s.deleteCalendarEvent);
  const hydrated = useCRMStore((s) => s._hasHydrated);

  const filtered = typeFilter === "all" ? events : events.filter((e) => e.type === typeFilter);

  const grouped = filtered.reduce<Record<string, ScheduleEvent[]>>((acc, evt) => {
    const day = new Date(evt.start).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    if (!acc[day]) acc[day] = [];
    acc[day].push(evt);
    return acc;
  }, {});

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading CRM data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scheduling Calendar"
        description="Measurements, installations, repairs, crew schedule & reminders"
        actions={
          <Button
            className="bg-primary hover:bg-brand-blue-dark"
            onClick={() => {
              setEditEvent(null);
              setFormOpen(true);
            }}
          >
            + Schedule Event
          </Button>
        }
      />

      <SelectField
        label="Filter by type"
        value={typeFilter}
        onChange={setTypeFilter}
        options={[
          { value: "all", label: "All Types" },
          ...CALENDAR_EVENT_TYPES.map((t) => ({
            value: t,
            label: CALENDAR_EVENT_TYPE_LABELS[t],
          })),
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border p-1">
          {VIEWS.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                view === v ? "bg-primary text-white" : "hover:bg-muted"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">Schedule by date</span>
          <Button variant="outline" size="icon">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base capitalize">{view} View — Grouped by Date</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(grouped).length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No events scheduled"
                description="Schedule a measurement, installation, or follow-up to populate the calendar."
                action={
                  <Button
                    className="bg-primary hover:bg-brand-blue-dark"
                    onClick={() => {
                      setEditEvent(null);
                      setFormOpen(true);
                    }}
                  >
                    + Schedule Event
                  </Button>
                }
              />
            ) : (
              <div className="space-y-6">
                {Object.entries(grouped).map(([day, dayEvents]) => (
                  <div key={day}>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">{day}</h3>
                    <div className="space-y-2">
                      {dayEvents.map((evt) => (
                        <div
                          key={evt.id}
                          className={`rounded-lg border p-4 ${TYPE_COLORS[evt.type] || "bg-muted"}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-medium">{evt.title}</p>
                              {evt.address && (
                                <p className="text-sm opacity-80 mt-0.5">{evt.address}</p>
                              )}
                              {evt.crew_name && (
                                <p className="text-xs mt-1">Crew: {evt.crew_name}</p>
                              )}
                            </div>
                            <div className="text-right text-sm shrink-0">
                              <p className="text-xs opacity-75">
                                {new Date(evt.start).toLocaleTimeString("en", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                                {" – "}
                                {new Date(evt.end).toLocaleTimeString("en", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </p>
                              <div className="flex gap-1 mt-2 justify-end">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    setEditEvent(evt);
                                    setFormOpen(true);
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-red-600"
                                  onClick={() => setDeleteId(evt.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crew Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {crews.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No crews added yet.
              </p>
            ) : (
              crews.map((crew) => (
                <div key={crew.id} className="rounded-lg border p-3">
                  <p className="font-medium text-sm">{crew.name}</p>
                  <p className="text-xs text-muted-foreground">{crew.lead_name}</p>
                  <p className="text-xs mt-1">
                    <span className="text-primary font-medium">{crew.active_jobs}</span> active jobs
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <CalendarEventFormDialog open={formOpen} onOpenChange={setFormOpen} event={editEvent} />
      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Delete Event"
        description="Remove this calendar event?"
        onConfirm={() => deleteId && deleteCalendarEvent(deleteId)}
      />
    </div>
  );
}
