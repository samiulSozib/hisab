"use client";

import type { ReactNode } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Forms whose Zod schema transforms values (string → number etc.) have a different output type;
// fields only care about the input shape, so the transformed type is left open here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FormControl<T extends FieldValues> = Control<T, any, any>;

type BaseProps<T extends FieldValues> = {
  control: FormControl<T>;
  name: FieldPath<T>;
  label: string;
  description?: ReactNode;
  className?: string;
  disabled?: boolean;
};

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  disabled,
  type = "text",
  placeholder,
  autoComplete,
}: BaseProps<T> & { type?: string; placeholder?: string; autoComplete?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Input
            {...field}
            value={field.value ?? ""}
            id={name}
            type={type}
            placeholder={placeholder}
            autoComplete={autoComplete}
            disabled={disabled}
            aria-invalid={fieldState.invalid}
          />
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

export function MoneyField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  disabled,
  placeholder = "0.00",
  allowNegative,
}: BaseProps<T> & { placeholder?: string; allowNegative?: boolean }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">৳</span>
            <Input
              {...field}
              value={field.value ?? ""}
              onChange={(e) => {
                const v = e.target.value.replace(allowNegative ? /[^\d.,\-]/g : /[^\d.,]/g, "");
                field.onChange(v);
              }}
              id={name}
              inputMode="decimal"
              placeholder={placeholder}
              disabled={disabled}
              className="num pl-7"
              aria-invalid={fieldState.invalid}
            />
          </div>
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

export function DateField<T extends FieldValues>({ control, name, label, description, className, disabled }: BaseProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Input {...field} value={field.value ?? ""} id={name} type="date" disabled={disabled} className="num" aria-invalid={fieldState.invalid} />
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

export type Option = { value: string; label: string; hint?: string };

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  disabled,
  options,
  groups,
  placeholder = "Select…",
  footer,
}: BaseProps<T> & {
  options?: Option[];
  groups?: { label: string; options: Option[] }[];
  placeholder?: string;
  footer?: ReactNode;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Select value={field.value ?? ""} onValueChange={field.onChange} disabled={disabled}>
            <SelectTrigger id={name} className="w-full" aria-invalid={fieldState.invalid} onBlur={field.onBlur}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options?.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="num ml-auto pl-3 text-xs text-muted-foreground">{o.hint}</span>}
                </SelectItem>
              ))}
              {groups?.map((g) => (
                <SelectGroup key={g.label}>
                  <SelectLabel>{g.label}</SelectLabel>
                  {g.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
              {footer}
            </SelectContent>
          </Select>
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  disabled,
  placeholder,
  rows = 3,
}: BaseProps<T> & { placeholder?: string; rows?: number }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Textarea {...field} value={field.value ?? ""} id={name} rows={rows} placeholder={placeholder} disabled={disabled} aria-invalid={fieldState.invalid} />
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

export function SwitchField<T extends FieldValues>({ control, name, label, description, className, disabled }: BaseProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field orientation="horizontal" className={cn("rounded-lg border bg-muted/30 p-3", className)}>
          <div className="flex flex-1 flex-col gap-0.5">
            <FieldLabel htmlFor={name} className="font-medium">
              {label}
            </FieldLabel>
            {description && <FieldDescription className="text-xs">{description}</FieldDescription>}
          </div>
          <Switch id={name} checked={Boolean(field.value)} onCheckedChange={field.onChange} disabled={disabled} />
        </Field>
      )}
    />
  );
}
