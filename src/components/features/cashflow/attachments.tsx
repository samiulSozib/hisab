"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { ALLOWED_UPLOAD_TYPES } from "@/lib/constants";
import { deleteAttachmentAction } from "@/server/actions/transactions";
import { uploadAttachment } from "./cashflow-dialog";

type Att = { id: string; fileName: string; mimeType: string; size: number };

function size(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
}

export function AttachmentsPanel({ items, target }: { items: Att[]; target: { transactionId?: string; loanId?: string } }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && <p className="text-sm text-muted-foreground">No files attached.</p>}
      <ul className="flex flex-col gap-2">
        {items.map((a) => (
          <li key={a.id} className="flex items-center gap-3 rounded-lg border p-2.5">
            <span className="grid size-9 place-items-center rounded-md bg-muted text-muted-foreground">
              {a.mimeType.startsWith("image/") ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}
            </span>
            <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 hover:underline">
              <span className="block truncate text-sm font-medium">{a.fileName}</span>
              <span className="text-xs text-muted-foreground">{size(a.size)}</span>
            </a>
            <Button variant="ghost" size="icon-sm" asChild aria-label="Download">
              <a href={`/api/attachments/${a.id}?download=1`}>
                <Download />
              </a>
            </Button>
            <ConfirmAction
              title="Remove attachment?"
              description={`"${a.fileName}" will be permanently deleted.`}
              confirmLabel="Remove"
              action={() => deleteAttachmentAction(a.id)}
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label="Remove">
                  <Trash2 />
                </Button>
              }
            />
          </li>
        ))}
      </ul>
      <input
        ref={ref}
        type="file"
        hidden
        accept={ALLOWED_UPLOAD_TYPES.join(",")}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          const ok = await uploadAttachment(file, target);
          setBusy(false);
          e.target.value = "";
          if (ok) {
            toast.success("File attached");
            router.refresh();
          }
        }}
      />
      <Button variant="outline" size="sm" className="self-start" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <Upload />} Upload file
      </Button>
    </div>
  );
}
