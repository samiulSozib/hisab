import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page";
import { ChangePasswordForm, ProfileForm, SessionActions } from "@/components/features/settings/profile-forms";
import { requireUser } from "@/server/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const meta = await db.user.findUnique({ where: { id: user.id }, select: { createdAt: true, emailVerified: true } });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Profile" description="Your personal details and account security." />
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-1.5">
            {user.email}
            {meta?.emailVerified && (
              <span className="inline-flex items-center gap-1 text-positive">
                <BadgeCheck className="size-3.5" /> verified
              </span>
            )}
            {meta && <span>· member since {formatDate(meta.createdAt.toISOString().slice(0, 10))}</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm name={user.name} timezone={user.timezone} />
        </CardContent>
      </Card>
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Passwords are hashed with bcrypt and never stored in plain text.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>Sessions last 7 days. Ending all sessions signs you out on every browser and device.</CardDescription>
        </CardHeader>
        <CardContent>
          <SessionActions />
        </CardContent>
      </Card>
    </div>
  );
}
