
import Link from 'next/link'
import Image from 'next/image'
import { useI18n } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { t, lang, switchLang } = useI18n();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    router.push('/auth/login');
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="max-w-6xl mx-auto flex items-center gap-4 px-4 py-3">
          <Image src="/logo.png" alt="logo" width={36} height={36} />
          <div className="font-semibold">{t.app.title}</div>
          <nav className="ml-6 flex gap-4 text-sm">
            <Link href="/">{t.nav.dashboard}</Link>
            <Link href="/categories">{t.nav.categories}</Link>
            <Link href="/products">{t.nav.products}</Link>
            <Link href="/transactions">{t.nav.transactions}</Link>
            <Link href="/settings">{t.nav.settings}</Link>
            <Link href="/usage">{t.nav.usage}</Link>

          </nav>
          <div className="ml-auto flex items-center gap-2">
            <select value={lang} onChange={e=>switchLang(e.target.value as any)} className="input w-28">
              <option value="el">EL</option>
              <option value="en">EN</option>
            </select>
            {session && <button className="btn" onClick={logout}>{t.app.logout}</button>}
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
