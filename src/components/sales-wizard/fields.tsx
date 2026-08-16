import type { ReactNode } from "react";
import type { ReferenceOption } from "@/lib/pipedrive/types";
import type { ReferenceData } from "@/components/sales-wizard/useReferenceData";

export type StepProps<T> = {
  data: T;
  onChange: (value: T) => void;
  /** Pipedrive lists backing the dropdowns; fetched once by the wizard. */
  reference: ReferenceData;
};

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2 className="section-title">{title}</h2>
      <div className="grid">{children}</div>
    </section>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  className
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <div className={`field ${className ?? ""}`}>
      <label>{label}</label>
      <input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  className
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`field ${className ?? ""}`}>
      <label>{label}</label>
      <textarea value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: Array<string | { value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const label = typeof option === "string" ? option : option.label;

          return (
            <option key={value} value={value}>
              {label}
            </option>
          );
        })}
      </select>
    </div>
  );
}

/**
 * Dropdown backed by a Pipedrive reference list.
 *
 * Falls back to a plain text input when the list is unavailable (bad token,
 * Pipedrive down, or an empty list). Losing the convenience of a dropdown must
 * not block a seller from entering an ID they already know — the previous
 * free-text behaviour stays reachable rather than becoming a dead field.
 */
export function ReferenceSelect({
  label,
  value,
  options,
  onChange,
  loading,
  error,
  placeholder = "Välj...",
  disabledHint,
  className
}: {
  label: string;
  value?: string | number;
  options: ReferenceOption[];
  onChange: (value: string) => void;
  loading?: boolean;
  error?: string;
  placeholder?: string;
  /** Shown instead of the list when a prerequisite is missing (e.g. no pipeline). */
  disabledHint?: string;
  className?: string;
}) {
  const current = value === undefined || value === null ? "" : String(value);
  const fieldId = `ref-${label.replace(/\s+/g, "-").toLowerCase()}`;

  if (disabledHint) {
    return (
      <div className={`field ${className ?? ""}`}>
        <label htmlFor={fieldId}>{label}</label>
        <select id={fieldId} value="" disabled>
          <option value="">{disabledHint}</option>
        </select>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`field ${className ?? ""}`}>
        <label htmlFor={fieldId}>{label}</label>
        <select id={fieldId} value="" disabled>
          <option value="">Hämtar...</option>
        </select>
      </div>
    );
  }

  // No list to choose from — keep the field usable as free text.
  if (error || options.length === 0) {
    return (
      <div className={`field ${className ?? ""}`}>
        <label htmlFor={fieldId}>{label}</label>
        <input id={fieldId} value={current} onChange={(event) => onChange(event.target.value)} placeholder="ID" />
        <span className="field-hint">{error ? `Listan kunde inte hämtas — ange ID manuellt.` : "Inga val hittades — ange ID manuellt."}</span>
      </div>
    );
  }

  // A previously entered ID that is not in the list (deactivated user, other
  // pipeline) would silently vanish from a select, so it is kept as an option.
  const missingCurrent = current !== "" && !options.some((option) => String(option.id) === current);

  return (
    <div className={`field ${className ?? ""}`}>
      <label htmlFor={fieldId}>{label}</label>
      <select id={fieldId} value={current} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {missingCurrent && <option value={current}>{`Okänt ID ${current}`}</option>}
        {options.map((option) => (
          <option key={String(option.id)} value={String(option.id)}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CheckLabel({
  label,
  checked,
  onChange,
  disabled = false
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
