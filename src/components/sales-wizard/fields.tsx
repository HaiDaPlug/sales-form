import type { ReactNode } from "react";
import type { ReferenceOption } from "@/lib/pipedrive/types";
import type { ReferenceData } from "@/components/sales-wizard/useReferenceData";

export type StepProps<T> = {
  data: T;
  onChange: (value: T) => void;
  /** Pipedrive lists backing the dropdowns; fetched once by the wizard. */
  reference: ReferenceData;
};

/**
 * A field label, with the asterisk that marks a value the step cannot be
 * submitted without.
 *
 * Required-ness lives in the zod schemas; this only mirrors it, so a field is
 * marked when — and only when — its schema rejects a blank value. Fields that
 * always carry a usable value (a number input defaulting to 0, a select with a
 * default) stay unmarked even though the schema lists them: an asterisk that
 * never blocks anything teaches the seller to ignore the ones that do.
 *
 * The asterisk is hidden from screen readers; `aria-required` on the control
 * itself carries the same information without being read as punctuation.
 */
export function FieldLabel({
  label,
  required,
  htmlFor
}: {
  label: string;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor}>
      {label}
      {required && (
        <span className="required-mark" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

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
  className,
  required
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={`field ${className ?? ""}`}>
      <FieldLabel label={label} required={required} />
      <input
        type={type}
        value={value ?? ""}
        aria-required={required || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  className,
  required
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={`field ${className ?? ""}`}>
      <FieldLabel label={label} required={required} />
      <textarea
        value={value ?? ""}
        aria-required={required || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  required
}: {
  label: string;
  value: string;
  options: Array<string | { value: string; label: string }>;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div className="field">
      <FieldLabel label={label} required={required} />
      <select value={value} aria-required={required || undefined} onChange={(event) => onChange(event.target.value)}>
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
  className,
  required
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
  required?: boolean;
}) {
  const current = value === undefined || value === null ? "" : String(value);
  const fieldId = `ref-${label.replace(/\s+/g, "-").toLowerCase()}`;

  if (disabledHint) {
    return (
      <div className={`field ${className ?? ""}`}>
        <FieldLabel label={label} required={required} htmlFor={fieldId} />
        <select id={fieldId} value="" disabled>
          <option value="">{disabledHint}</option>
        </select>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`field ${className ?? ""}`}>
        <FieldLabel label={label} required={required} htmlFor={fieldId} />
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
        <FieldLabel label={label} required={required} htmlFor={fieldId} />
        <input
          id={fieldId}
          value={current}
          aria-required={required || undefined}
          onChange={(event) => onChange(event.target.value)}
          placeholder="ID"
        />
        <span className="field-hint">{error ? `Listan kunde inte hämtas — ange ID manuellt.` : "Inga val hittades — ange ID manuellt."}</span>
      </div>
    );
  }

  // A previously entered ID that is not in the list (deactivated user, other
  // pipeline) would silently vanish from a select, so it is kept as an option.
  const missingCurrent = current !== "" && !options.some((option) => String(option.id) === current);

  return (
    <div className={`field ${className ?? ""}`}>
      <FieldLabel label={label} required={required} htmlFor={fieldId} />
      <select
        id={fieldId}
        value={current}
        aria-required={required || undefined}
        onChange={(event) => onChange(event.target.value)}
      >
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
