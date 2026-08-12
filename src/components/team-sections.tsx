import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, Mail, Send, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  teamInviteFn,
  teamOverviewFn,
  teamRevokeFn,
  teamSendReportNowFn,
  teamSetReportsFn,
  type TeamState,
} from "@/lib/team.functions";
import type { TeamMember } from "@/lib/mcp/team.server";

const REASONS: Record<string, string> = {
  plan: "Team access is part of the Business plan.",
  limit: "This Presence already has 20 active team codes.",
  "invalid-email": "Please enter a valid email address.",
  "no-recipient": "Add a report recipient first.",
  "email-not-configured": "Report delivery is not switched on yet — the report was generated but not emailed.",
  unavailable: "Crawler is temporarily unavailable, so nothing was changed.",
};

/**
 * Team access and report emails for a published Presence. Both stay
 * accountless: team members hold their own one-time code, and report
 * recipients are plain email addresses, never Crawler users.
 */
export function TeamAndReportsSection({ code, plan }: { code: string; plan: string }) {
  const [state, setState] = useState<TeamState | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [issued, setIssued] = useState<{ label: string; code: string } | null>(null);

  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState<"off" | "weekly" | "monthly">("weekly");

  const load = useServerFn(teamOverviewFn);
  const invite = useServerFn(teamInviteFn);
  const revoke = useServerFn(teamRevokeFn);
  const saveReports = useServerFn(teamSetReportsFn);
  const sendNow = useServerFn(teamSendReportNowFn);

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await load({ data: { code } });
      if (!active) return;
      if (result.ok) {
        setState(result);
        setEmail(result.reports.email ?? "");
        setFrequency(result.reports.frequency);
      }
    })();
    return () => {
      active = false;
    };
  }, [code, load]);

  if (!state) return null;

  async function refresh() {
    const result = await load({ data: { code } });
    if (result.ok) setState(result);
  }

  async function addMember() {
    if (!label.trim()) return;
    setBusy(true);
    try {
      const result = await invite({ data: { code, label: label.trim(), role } });
      if (!result.ok) {
        toast.error(REASONS[result.reason] ?? "Could not create that team code.");
        return;
      }
      setIssued({ label: result.member.label, code: result.code });
      setLabel("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: TeamMember) {
    setBusy(true);
    try {
      const result = await revoke({ data: { code, memberId: member.id } });
      if (!result.ok) {
        toast.error(REASONS[result.reason] ?? "Could not revoke that code.");
        return;
      }
      toast.success(`“${member.label}” can no longer open this Presence.`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveReportSettings() {
    setBusy(true);
    try {
      const result = await saveReports({ data: { code, email, frequency } });
      if (!result.ok) {
        toast.error(REASONS[result.reason] ?? "Could not save the report settings.");
        return;
      }
      toast.success("Report settings saved.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function sendReportNow() {
    setBusy(true);
    try {
      const result = await sendNow({ data: { code } });
      if (result.ok) toast.success("Report sent.");
      else toast.error(REASONS[result.reason ?? ""] ?? "The report could not be emailed yet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-sm font-medium">Team access</div>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Business
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Issue a personal team code for a colleague. Viewers see measured analytics, editors can additionally take the
          Presence offline or back online. Team codes never grant billing access, secret rotation or team management,
          and they can be revoked at any time. Team members open{" "}
          <a className="underline underline-offset-4" href="/team">
            /team
          </a>
          .
        </p>

        {!state.allowedOnPlan ? (
          <p className="mt-4 rounded-lg border border-dashed border-border bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
            Your {plan} plan does not include team access. Upgrade to Business to share this Presence.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Name or role, e.g. “Marketing”"
                className="h-10 max-w-xs flex-1"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "viewer" | "editor")}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                aria-label="Team role"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <Button onClick={() => void addMember()} disabled={busy || !label.trim()}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                Create team code
              </Button>
            </div>

            {issued ? (
              <div className="mt-4 rounded-xl border border-border bg-secondary/60 p-4">
                <div className="text-xs text-muted-foreground">
                  Team code for “{issued.label}” — shown once. Copy it now and pass it on privately.
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
                    {issued.code}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard.writeText(issued.code);
                      toast.success("Team code copied.");
                    }}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="mt-5 divide-y divide-border">
              {state.members.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">No team codes issued yet.</p>
              ) : (
                state.members.map((member) => (
                  <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm">{member.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {member.role} · created {new Date(member.createdAt).toLocaleDateString()} ·{" "}
                        {member.lastUsedAt ? `last used ${new Date(member.lastUsedAt).toLocaleDateString()}` : "never used"}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => void removeMember(member)} disabled={busy}>
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Revoke
                    </Button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Mail className="h-4 w-4 text-muted-foreground" />
          Report emails
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          A scheduled plain-text report with the measured numbers for this Presence: Crawler conversations, mentions,
          public reads, outbound clicks and the most read files. No private assistant conversations — Crawler cannot see
          them.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="reports@example.com"
            className="h-10 max-w-xs flex-1"
            autoComplete="email"
          />
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as "off" | "weekly" | "monthly")}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            aria-label="Report frequency"
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="off">Off</option>
          </select>
          <Button variant="outline" onClick={() => void saveReportSettings()} disabled={busy}>
            Save
          </Button>
          <Button variant="outline" onClick={() => void sendReportNow()} disabled={busy || !state.reports.email}>
            <Send className="mr-1.5 h-3.5 w-3.5" />
            Send now
          </Button>
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          {state.reports.lastSentAt
            ? `Last report sent ${new Date(state.reports.lastSentAt).toLocaleString()}.`
            : "No report sent yet."}{" "}
          {state.reports.deliveryReady
            ? ""
            : "Email delivery is not switched on for this project yet, so reports are prepared but not sent."}
        </p>
      </div>
    </>
  );
}
