import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'

export default function Products(){ 
  return <RequireAuth><Layout><h1 className="text-xl font-semibold mb-4">Προϊόντα</h1>
  <p>Λίστα προϊόντων, αναζήτηση, προσθήκη, επεξεργασία (πίνακας <code>products</code>).</p></Layout></RequireAuth>
}