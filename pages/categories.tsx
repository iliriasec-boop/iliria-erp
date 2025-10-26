import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'
import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useState } from 'react'

type Category = { id: string; code: string; name: string; notes?: string }
function pad2(n: number){ return String(n).padStart(2,'0') }

export default function CategoriesPage(){
  const [orgId, setOrgId] = useState<string | null>(null)
  const [list, setList] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState<string|null>(null)

  const nextCode = useMemo(() => {
    const max = list.reduce((m,c)=>Math.max(m, parseInt(c.code || '0')||0), 0)
    return pad2(max+1)
  }, [list])

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null)
      const mem = await supabase.from('org_members').select('org_id').limit(1)
      const oid = mem.data?.[0]?.org_id || null
      setOrgId(oid)
      if (oid){
        const { data, error } = await supabase
          .from('categories')
          .select('id, code, name, notes')
          .eq('org_id', oid)
          .order('code')
        if (error) setErr(error.message)
        setList(data || [])
      }
      setLoading(false)
    })()
  }, [])

  async function addCategory(e: React.FormEvent){
    e.preventDefault()
    if (!orgId) return
    if (!name.trim()){ setErr('Συμπλήρωσε όνομα.'); return }
    setErr(null)
    const code = nextCode
    const { error } = await supabase.from('categories').insert([{ org_id: orgId, code, name, notes }])
    if (error){ setErr(error.message); return }
    setName(''); setNotes('')
    const { data } = await supabase
      .from('categories').select('id, code, name, notes').eq('org_id', orgId).order('code')
    setList(data || [])
  }

  return (
    <RequireAuth>
      <Layout>
        <h1 className="text-xl font-semibold mb-4">Κατηγορίες</h1>

        {!orgId && <div className="card mb-4 text-sm">
          Δεν βρέθηκε οργάνωση για τον χρήστη (org_members).
        </div>}

        <form onSubmit={addCategory} className="card mb-6 grid gap-2 max-w-xl">
          <div className="text-lg font-medium">➕ Νέα Κατηγορία</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">🏷️ Κωδικός (auto)</label>
              <input className="input" value={nextCode} readOnly />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">📁 Όνομα</label>
              <input className="input" placeholder="π.χ. Κάμερες"
                     value={name} onChange={e=>setName(e.target.value)} />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-medium mb-1">📝 Σημειώσεις</label>
              <input className="input" placeholder="προαιρετικό"
                     value={notes} onChange={e=>setNotes(e.target.value)} />
            </div>
          </div>
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <div className="flex gap-2">
            <button className="btn btn-primary" type="submit">Καταχώριση</button>
            <button className="btn" type="button" onClick={()=>{setName(''); setNotes('')}}>Καθαρισμός</button>
          </div>
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
