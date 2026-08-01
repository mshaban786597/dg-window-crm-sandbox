"use client";

import { useState } from "react";
import { Pencil, Star, Send, CheckCircle, Clock, Copy } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ReviewRequestFormDialog } from "@/components/reviews/review-request-form-dialog";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCRMStore } from "@/lib/store/crm-store";
import { useSettingsStore } from "@/lib/settings/settings-store";
import { JOB_COMPLETE_STAGES } from "@/lib/constants";
import type { Review } from "@/types/database";

export default function ReviewsPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editReview, setEditReview] = useState<Review | null>(null);
  const jobs = useCRMStore((s) => s.jobs);
  const reviews = useCRMStore((s) => s.reviews);
  const showToast = useCRMStore((s) => s.showToast);
  const hydrated = useCRMStore((s) => s._hasHydrated);

  const reviewLink = useSettingsStore((s) => s.review_link);
  const linkConfigured = reviewLink.trim().length > 0;

  const completed = jobs.filter((j) =>
    (JOB_COMPLETE_STAGES as readonly string[]).includes(j.stage)
  ).length;
  const requested = reviews.filter((r) => r.status === "requested").length;
  const received = reviews.filter((r) => r.status === "received").length;
  const pending = reviews.filter((r) => r.status === "sent" || r.status === "opened").length;
  const conversionRate = completed > 0 ? Math.round((received / completed) * 100) : 0;

  const handleCopyLink = async () => {
    if (!linkConfigured) return;
    try {
      await navigator.clipboard.writeText(reviewLink);
      showToast("success", "Review link copied");
    } catch {
      showToast("error", "Could not copy review link");
    }
  };

  if (!hydrated) {
    return <div className="py-20 text-center text-muted-foreground">Loading reviews...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review Management"
        description="Request and track reviews from happy window customers"
        actions={
          <Button className="bg-primary hover:bg-brand-blue-dark" onClick={() => { setEditReview(null); setFormOpen(true); }}>
            <Send className="h-4 w-4 mr-1" /> Request Review
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Jobs Completed" value={completed} icon={CheckCircle} />
        <StatCard title="Reviews Requested" value={requested + received} icon={Send} />
        <StatCard title="Reviews Received" value={received} icon={Star} />
        <StatCard title="Conversion Rate" value={`${conversionRate}%`} icon={Clock} subtitle={`${pending} pending`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Review Records</CardTitle></CardHeader>
          <CardContent>
            {reviews.length === 0 ? (
              <EmptyState
                icon={Star}
                title="No reviews requested"
                description="Request a review from a completed job to start building your reputation."
                action={
                  <Button className="bg-primary hover:bg-brand-blue-dark" onClick={() => { setEditReview(null); setFormOpen(true); }}>
                    Request First Review
                  </Button>
                }
              />
            ) : (
              <div className="space-y-3">
                {reviews.map((review) => (
                  <div key={review.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium text-sm">{review.customer_name}</p>
                      <div className="mt-1">
                        <StatusBadge status={review.status} type="review" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {review.rating ? (
                        <div className="flex items-center gap-0.5 text-amber-500">
                          {Array.from({ length: review.rating }).map((_, i) => (
                            <Star key={i} className="h-4 w-4 fill-current" />
                          ))}
                        </div>
                      ) : null}
                      <Button size="icon" variant="ghost" onClick={() => { setEditReview(review); setFormOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Review Link</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share your review link with customers after a completed installation. The message uses your
              configurable template from Settings.
            </p>
            {linkConfigured ? (
              <div className="rounded-lg bg-muted p-3 text-sm break-all">{reviewLink}</div>
            ) : (
              <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Add a review link in Settings
              </div>
            )}
            <div className="flex gap-2">
              <Button
                className="flex-1"
                variant="outline"
                disabled={!linkConfigured}
                onClick={handleCopyLink}
              >
                <Copy className="h-4 w-4 mr-1" /> Copy Review Link
              </Button>
              <Button
                className="flex-1 bg-primary hover:bg-brand-blue-dark"
                disabled={!linkConfigured}
                onClick={() => { setEditReview(null); setFormOpen(true); }}
              >
                <Send className="h-4 w-4 mr-1" /> Send
              </Button>
            </div>
            {!linkConfigured && (
              <p className="text-xs text-muted-foreground">Add a review link in Settings</p>
            )}
          </CardContent>
        </Card>
      </div>

      <ReviewRequestFormDialog open={formOpen} onOpenChange={setFormOpen} review={editReview} />
    </div>
  );
}
