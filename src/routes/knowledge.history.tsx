import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw, Trash2, History } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/kc/record-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { coreStats, purgeArchived, restoreArchived, snapshot } from "@/lib/kc/apply";
import { getExt, sectionLabel } from "@/lib/kc/model";
import { useCore, useVersions } from "@/lib/store";

export const Route = createFileRoute("/knowledge/history")({ component: HistoryPage });

const utc = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;

function HistoryPage() {
  const [core, setCore] = useCore();
  const [versions, setVersions] = useVersions();
  const ext = getExt(core);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card
        title="Version history"
        hint="A restore point is written before every accepted change. Restoring only affects your draft."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setVersions([snapshot(core, "Manual restore point"), ...versions].slice(0, 30));
              toast.success("Restore point saved.");
            }}
          >
            <History className="mr-1.5 h-3.5 w-3.5" /> Save restore point
          </Button>
        }
      >
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No versions yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {versions.map((v) => {
              const s = coreStats(v.core);
              return (
                <li key={v.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{v.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {utc(v.at)} · {s.facts} facts · {s.items} records · {s.faqs} FAQ · {s.extra} extra
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline">
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Restore this version?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Your current draft is saved as a new restore point first, so nothing is lost. The published
                          Presence stays unchanged until you publish again.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            setVersions([snapshot(core, "Before restore"), ...versions].slice(0, 30));
                            setCore(v.core);
                            toast.success("Version restored into your draft.");
                          }}
                        >
                          Restore
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Archive" hint="Removed records are archived, not deleted. Restore them any time.">
        {ext.archive.length === 0 ? (
          <p className="text-sm text-muted-foreground">The archive is empty.</p>
        ) : (
          <ul className="divide-y divide-border">
            {ext.archive.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{sectionLabel[a.section] ?? a.section}</Badge>
                    <span className="truncate text-sm">{a.label}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Archived {utc(a.archivedAt)}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setCore(restoreArchived(core, a.id))}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes the archived record from your workspace for good. It cannot be restored.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => setCore(purgeArchived(core, a.id))}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
