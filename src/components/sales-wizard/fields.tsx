import type { ReactNode } from "react";

export type StepProps<T> = {
  data: T;
  onChange: (value: T) => void;
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
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CheckLabel({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
