import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'

export default function Transactions(){ 
  return <RequireAuth><Layout><h1 className="text-xl font-semibold mb-4">Κινήσεις</h1>
  <p>Αγορές, Πωλήσεις, Διορθώσεις (πίνακας <code>txns</code>).</p></Layout></RequireAuth>
}