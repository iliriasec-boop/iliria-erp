import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'

export default function Categories(){ 
  return <RequireAuth><Layout><h1 className="text-xl font-semibold mb-4">Κατηγορίες</h1>
  <p>Προσθέστε/δείτε κατηγορίες από τη βάση Supabase (πίνακας <code>categories</code>).</p></Layout></RequireAuth>
}