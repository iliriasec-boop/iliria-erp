import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'

export default function Settings(){ 
  return <RequireAuth><Layout><h1 className="text-xl font-semibold mb-4">Ρυθμίσεις</h1>
  <p>Νόμισμα, πρόθεμα κωδικών, κ.λπ. (πίνακας <code>settings</code>).</p></Layout></RequireAuth>
}