import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth";
import { DomainError } from "@/server/errors";
import { addAttachment } from "@/server/services/attachments";

/** Upload a receipt / document (multipart/form-data: file, transactionId | loanId). */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid upload" }, { status: 400 });
  }
  const file = form.get("file");
  const transactionId = form.get("transactionId");
  const loanId = form.get("loanId");
  if (!(file instanceof File)) return Response.json({ error: "No file provided" }, { status: 400 });

  try {
    const att = await addAttachment(
      user.id,
      {
        transactionId: typeof transactionId === "string" && transactionId ? transactionId : undefined,
        loanId: typeof loanId === "string" && loanId ? loanId : undefined,
      },
      file,
    );
    revalidatePath("/", "layout");
    return Response.json({ attachment: att }, { status: 201 });
  } catch (e) {
    if (e instanceof DomainError) return Response.json({ error: e.message }, { status: 400 });
    console.error("[upload]", e);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
