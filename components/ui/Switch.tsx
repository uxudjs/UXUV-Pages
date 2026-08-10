"use client";

export function Switch({ checked, onChange, ariaLabel, disabled = false }: Readonly<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}>) {
  return <label className="settings-switch">
    <input type="checkbox" checked={checked} disabled={disabled} aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.checked)} />
    <span aria-hidden="true" />
  </label>;
}
