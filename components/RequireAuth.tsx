
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/router'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const router = useRouter();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/auth/login');
      else setReady(true);
    });
  }, [router]);
  if (!ready) return null;
  return <>{children}</>;
}
