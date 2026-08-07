interface PublicPageProps {
  title: string;
  description: string;
}

export function PublicPage({ title, description }: PublicPageProps) {
  return (
    <main className="public-shell">
      <section className="public-notice" aria-labelledby="public-page-title">
        <p className="public-kicker">UXUVideo Public Pages</p>
        <h1 className="public-title" id="public-page-title">
          {title}
        </h1>
        <p className="public-description">{description}</p>
        <p className="public-guidance">请从你的 UXUVideo Worker 域名访问完整应用。</p>
      </section>
    </main>
  );
}
