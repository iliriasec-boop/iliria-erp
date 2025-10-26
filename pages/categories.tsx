import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'

type Category = { id: string; code: string; name: string; notes?: string }

export default function CategoriesPage(){
  const [orgId, setOrgId] = useState<string | null>(null)
  const [list, setList] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState<string|null>(null)

  useEffect(() => {
    (async () => {
      setLoading(true)
      setErr(null)
      // 1) Βρες σε ποια οργάνωση ανήκει ο χρήστης (παίρνουμε την 1η)
      const mem = await supabase.from('org_members').select('org_id').limit(1)
      const oid = mem.data?.[0]?.org_id || null
      setOrgId(oid)

      // 2) Φέρε τις κατηγορίες
      if (oid) {
        const { data, error } = await supabase
          .from('categories')
          .select('id, code, name, notes')
          .eq('org_id', oid)
          .order('code', { ascending: true })
        if (error) setErr(error.message)
        setList(data || [])
      }
      setLoading(false)
    })()
  }, [])

  async function addCategory(e: React.FormEvent){
    e.preventDefault()
    if (!orgId) return
    setErr(null)
    if (!code || !name) { setErr('Συμπλήρωσε Κωδικό & Όνομα.'); return }
    const { error } = await supabase.from('categories').insert([{ org_id: orgId, code, name, notes }])
    if (error) { setErr(error.message); return }
    setCode(''); setName(''); setNotes('')
    // refresh
    const { data } = await supabase.from('categories').select('id, code, name, notes').eq('org_id', orgId).order('code')
    setList(data || [])
  }

  return (
    <RequireAuth>
      <Layout>
        <h1 className="text-xl font-semibold mb-4">Κατηγορίες</h1>

        {!orgId && <div className="card mb-4 text-sm">Δεν βρέθηκε οργάνωση για τον χρήστη σου. Βεβαιώσου ότι έχεις προσθέσει εγγραφή στο <code>org_members</code> με ρόλο <b>admin</b>.</div>}

        <form onSubmit={addCategory} className="card mb-6 grid gap-2 max-w-xl">
          <div className="text-lg font-medium">➕ Νέα Κατηγορία</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input className="input" placeholder="Κωδικός (π.χ. 001)" value={code} onChange={e=>setCode(e.target.value)} />
            <input className="input" placeholder="Όνομα (π.χ. Κάμερες)" value={name} onChange={e=>setName(e.target.value)} />
            <input className="input" placeholder="Σημειώσεις (προαιρετικό)" value={notes} onChange={e=>setNotes(e.target.value)} />
          </div>
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <div><button className="btn btn-primary" type="submit">Καταχώριση</button></div>
        </form>

        <div className="grid gap-2">
          {loading ? <div>Φόρτωση…</div> :
            (list.length === 0 ? <div className="text-sm text-gray-600">Δεν υπάρχουν κατηγορίες ακόμα.</div> :
              list.map(c => (
                <div key={c.id} className="card flex items-center justify-between">
                  <div className="font-mono text-sm">{c.code}</div>
                  <div className="flex-1 px-4">{c.name}</div>
                  <div className="text-sm text-gray-500">{c.notes}</div>
                </div>
              ))
            )
          }
        </div>
      </Layout>
    </RequireAuth>
  )
}
