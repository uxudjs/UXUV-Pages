interface SettingsSectionProps {
  id: string;
  title: string;
  description?: string;
  summary?: React.ReactNode;
  children: React.ReactNode;
}

export function SettingsSection({ id, title, description, summary, children }: Readonly<SettingsSectionProps>) {
  return <section className="settings-section kvideo-settings-section" aria-labelledby={`${id}-title`} data-settings-section={id}>
    <div className="section-heading"><h2 id={`${id}-title`}>{title}</h2>{summary}</div>
    {description && <p className="section-description">{description}</p>}
    {children}
  </section>;
}
