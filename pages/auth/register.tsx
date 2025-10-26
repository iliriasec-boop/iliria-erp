
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/router'
import { useI18n } from '@/lib/i18n'

export default function Register() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) { setErr(error.message); return; }
    router.replace('/auth/login');
  }

  return (
    <div className="max-w-md mx-auto mt-24 card">
      <h1 className="text-xl font-semibold mb-4">{t.auth.register}</h1>
      <form onSubmit={onSubmit} className="grid gap-3">
        <label className="label">{t.auth.email}</label>
        <input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/>

        <label className="label">{t.auth.password}</label>
        <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} required/>

        {err && <div className="text-red-600 text-sm">{err}</div>}
        <button className="btn btn-primary mt-2" type="submit">{t.auth.register}</button>
      </form>
    </div>
  )
}
