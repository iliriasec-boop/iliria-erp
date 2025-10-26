import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'
import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useState } from 'react'

type Category = { code: string; name: string }
type Product = { id: string; code: string; name: string; category_code: string; price: number; stock: number; low_stock: number }

export default function ProductsPage(){
  const [orgId, setOrgId] = useState<string | null>(null)
  const [cats, setCats] = useState<Category[]>([])
  const [list, setList] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string|null>(null)

  // πεδία φόρμας
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [cat, setCat] = useState('')
  const [price, setPrice] = useState<number>(0)
  const [stock, setStock] = useState<number>(0)
  const [low, setLow] = useState<number>(0)

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null)
      // org
      const mem = await supabase.from('org_members').select('org_id').limit(1)
      const oid = mem.data?.[0]?.org_id || null
      setOrgId(oid)

      if (oid){
        // categories
        const { data: c } = await supabase.from('categories').select('code,name').eq('org_id', oid).order('code')
        setCats(c || [])
        // products
        const { data: p } = await supabase.from('products').select('id,code,name,category_code,price,stock,low_stock').eq('org_id', oid).order('code')
        setList(p || [])
      }
      setLoading(false)
    })()
  }, [])

  const canSave = useMemo(() => code && name && cat, [code, name, cat])

  async function addProduct(e: React.FormEvent){
    e.preventDefault()
    if (!orgId) return
    if (!canSave) { setErr('Συμπλήρωσε Κωδικό, Όνομα και Κατηγορία.'); return }
    setErr(null)

    // απλό product_index: πόσα προϊόντα έχει ήδη η κατηγορία
    const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('category_code', cat)
    const nextIndex = (count || 0) + 1

    const { error } = await supabase.from('products').insert([{
      org_id: orgId,
      code,
      category_code: cat,
      product_index: nextIndex,
      name,
      description: '',
      supplier: '',
      image_url: '',
      cost: 0,
      avg_cost: 0,
      price: Number(price) || 0,
      stock: Number(stock) || 0,
      low_stock: Number(low) || 0,
      active: true
    }])
    if (error) { setErr(error.message); return }

    // refresh
    const { data: p } = await supabase.from('products').select('id,code,name,category_code,price,stock,low_stock').eq('org_id', orgId).order('code')
    setList(p || [])
    setCode(''); setName(''); setCat(''); setPrice(0); setStock(0); setLow(0)
  }

  return (
    <RequireAuth>
      <Layout>
        <h1 className="text-xl font-semibold mb-4">Προϊόντα</h1>

        {!orgId && <div className="card mb-4 text-sm">Δεν βρέθηκε οργάνωση για τον χρήστη. Βεβαιώσου ότι είσαι μέλος στον πίνακα <code>org_members</code>.</div>}

        <form onSubmit={addProduct} className="card mb-6 grid gap-2">
          <div className="text-lg font-medium">➕ Νέο Προϊόν</div>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <input className="input" placeholder="Κωδικός (π.χ. IS0010001)" value={code} onChange={e=>setCode(e.target.value)} />
            <input className="input md:col-span-2" placeholder="Όνομα" value={name} onChange={e=>setName(e.target.value)} />
            <select className="input" value={cat} onChange={e=>setCat(e.target.value)}>
              <option value="">— Κατηγορία —</option>
              {cats.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
            <input className="input" type="number" step="0.01" placeholder="Τιμή" value={price} onChange={e=>setPrice(parseFloat(e.target.value))} />
            <input className="input" type="number" placeholder="Απόθεμα" value={stock} onChange={e=>setStock(parseInt(e.target.value||'0'))} />
            <input className="input" type="number" placeholder="Όριο Low" value={low} onChange={e=>setLow(parseInt(e.target.value||'0'))} />
          </div>
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <div><button className="btn btn-primary" type="submit" disabled={!canSave}>Καταχώριση</button></div>
        </form>

        {loading ? <div>Φόρτωση…</div> :
          (list.length === 0
            ? <div className="text-sm text-gray-600">Δεν υπάρχουν προϊόντα ακόμα.</div>
            : <div className="grid gap-2">
                {list.map(p => (
                  <div key={p.id} className="card grid grid-cols-6 gap-3 items-center">
                    <div className="font-mono text-sm">{p.code}</div>
                    <div className="col-span-2">{p.name}</div>
                    <div className="text-sm">{p.category_code}</div>
                    <div className="text-sm">Τιμή: {Number(p.price||0).toLocaleString()}</div>
                    <div className="text-sm">Στοκ: {p.stock} (Low {p.low_stock})</div>
                  </div>
                ))}
              </div>
          )
        }
      </Layout>
    </RequireAuth>
  )
}
