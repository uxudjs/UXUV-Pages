import Link from "next/link";

export function ContentNavigation({ premium = false }: Readonly<{ premium?: boolean }>) {
  return (
    <nav className="content-nav" aria-label="主导航">
      <Link className="content-brand" href={premium ? "/premium" : "/"} prefetch={false}>UXUVideo</Link>
      <div className="content-nav-links">
        {premium ? <Link href="/" prefetch={false}>普通模式</Link> : <Link href="/premium" prefetch={false}>Premium</Link>}
        <Link href="/iptv" prefetch={false}>IPTV</Link>
        <Link href={premium ? "/premium/favorites" : "/favorites"} prefetch={false}>收藏</Link>
        <Link href={premium ? "/premium/settings" : "/settings"} prefetch={false}>设置</Link>
      </div>
    </nav>
  );
}
