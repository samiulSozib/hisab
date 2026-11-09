import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-700 text-[15px] font-bold text-white shadow-sm shadow-teal-900/20",
        className,
      )}
      aria-hidden
    >
      ৳
    </span>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight">Hisab</span>
        <span className="mt-0.5 text-[11px] text-muted-foreground">Personal finance</span>
      </span>
    </span>
  );
}
