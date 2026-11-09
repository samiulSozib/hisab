import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page";
import { CategoryManager, DataTools, ThemePicker } from "@/components/features/settings/settings-panels";
import { requireUser } from "@/server/auth";
import { listCategories } from "@/server/services/categories";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Settings" };

const ACTION_STYLE = {
  CREATE: "bg-positive/10 text-positive",
  UPDATE: "bg-primary/10 text-primary",
  DELETE: "bg-negative/10 text-negative",
} as const;

export default async function SettingsPage() {
  const user = await requireUser();
  const [categories, audit] = await Promise.all([
    listCategories(user.id, undefined, true),
    db.auditLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Categories, appearance, data integrity and your audit trail." />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="card-elevated lg:col-span-2">
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>Used for income sources and expense reports. The number shows how many entries use each.</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryManager categories={categories} />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Choose a light or dark theme.</CardDescription>
            </CardHeader>
            <CardContent>
              <ThemePicker />
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Currency</CardTitle>
              <CardDescription>All amounts are stored as exact decimals.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              Bangladeshi Taka <span className="font-semibold">(BDT · ৳)</span> with lakh/crore grouping, e.g. ৳1,25,000.00
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Data integrity</CardTitle>
              <CardDescription>Re-derive every balance from the ledger, or post due recurring entries now.</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTools />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
          <CardDescription>The 50 most recent changes to your financial records.</CardDescription>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="divide-y">
              {audit.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <Badge variant="outline" className={`w-16 justify-center border-transparent ${ACTION_STYLE[a.action]}`}>
                    {a.action.toLowerCase()}
                  </Badge>
                  <span className="min-w-0 flex-1">{a.summary}</span>
                  <span className="text-xs text-muted-foreground">{a.entityType}</span>
                  <span className="num text-xs text-muted-foreground">{formatDateTime(a.createdAt, user.timezone)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
