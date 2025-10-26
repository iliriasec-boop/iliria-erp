import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'
import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useState } from 'react'

type Product = {
  code: string
  name: string
  category_code: string
  price: number
  stock: number
  avg_cost: number
}

type Txn = {
  id: string
  ts: string
  type: 'purchase' | 'sale' | 'adjust'
  product_code: string
  product_name: string
  qty: number
  unit_cost: number | null
  unit_price: number | null
  note: string | null
}

export default function TransactionsPage(){
  const [orgId, setOrgId] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // form state
  const [type, setType] = useState<'purchase'|'sale'|'adjust'>('purchase')
  const [code, setCode] = useState('')
  const [qty, setQty] = useState<number>(1)
  const [unitCost, setUnitCost] = useState<number>(0)
  const [unitPrice, setUnitPrice] = useState<number>(0)
  const [note, setNote] = useState<string>('')

  const selected = useMemo(() => products.find(p => p.code === code) || null, [products, code])

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null)
      const mem = await supabase.from('org_members').select('org_id').limit(1)
      const oid = mem.data?.[0]?.org_id || null
      setOrgId(oid)

      if (oid){
        const { data: p } = await supabase
          .from('products')
          .select('code,name,category_code,price,stock,avg_cost')
          .eq('org_id', oid)
          .order('code')
        setProducts(p || [])

        const { data: t } = await supabase
          .from('txns')
          .select('id, ts, type, product_code, product_name, qty, unit_cost, unit_price, note')
          .eq('org_id', oid)
          .order('ts', { ascending: false })
          .limit(50)
        setTxns(t || [])
      }
      setLoading(false)
    })()
  }, [])

  // reset τιμών όταν αλλάζει τύπος
  useEffect(() => {
    setOk(null); setErr(null)
    if (type === 'purchase'){ setUnitCost(0) }
    if (type === 'sale'){ setUnitPrice(selected?.price || 0) }
    if (type === 'adjust'){ /* qty = delta (+/-) */ }
  }, [type, selected?.price])

  async function submit(e: React.FormEvent){
    e.preventDefault()
    if (!orgId) return
    setErr(null); setOk(null)

    if (!code){ setErr('Διάλεξε προϊόν.'); return }
    if (type !== 'adjust' && qty <= 0){ setErr('Η ποσότητα πρέπει να είναι > 0.'); return }
    if (type === 'sale' && selected && qty > selected.stock){
      setErr('Δεν υπάρχει αρκετό απόθεμα.'); return
    }

    const { error, data } = await supabase.rpc('fn_apply_txn', {
      _org_id: orgId,
      _type: type,
      _product_code: code,
      _qty: qty,
      _unit_cost: type === 'purchase' ? unitCost : null,
      _unit_price: type === 'sale' ? unitPrice : null,
      _note: note || null
    })

    if (error){
      setErr(error.message)
      return
    }

    // refresh λίστες
    const { data: p } = await supabase
      .from('products')
      .select('code,name,category_code,price,stock,avg_cost')
      .eq('org_id', orgId).order('code')
    setProducts(p || [])

    const { data: t } = await supabase
      .from('txns')
      .select('id, ts, type, product_code, product_name, qty, unit_cost, unit_price, note')
      .eq('org_id', orgId)
      .order('ts', { ascending: false })
      .limit(50)
    setTxns(t || [])

    setOk('Η κίνηση καταχωρήθηκε.')
    // καθάρισε ευγενικά (κρατάμε επιλεγμένο προϊόν/τύπο)
    setQty(1)
    if (type === 'purchase') setUnitCost(0)
    if (type === 'sale') setUnitPrice(selected?.price || 0)
    setNote('')
  }

  return (
    <RequireAuth>
      <Layout>
        <h1 className="text-xl font-semibold mb-4">Κινήσεις</h1>

        {!orgId && <div className="card mb-4 text-sm">
          Δεν βρέθηκε οργάνωση (org_members).
        </div>}

        <form onSubmit={submit} className="card mb-6 grid gap-3">
          <div className="text-lg font-medium">➕ Νέα Κίνηση</div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-sm font-medium mb-1">⚙️ Τύπος</label>
              <select className="input" value={type} onChange={e=>setType(e.target.value as any)}>
                <option value="purchase">Αγορά</option>
                <option value="sale">Πώληση</option>
                <option value="adjust">Διόρθωση (+/-)</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">📦 Προϊόν</label>
              <select className="input" value={code} onChange={e=>setCode(e.target.value)}>
                <option value="">— Επιλέξτε —</option>
                {products.map(p => (
                  <option key={p.code} value={p.code}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {type === 'adjust' ? '🔁 Μεταβολή Ποσότητας (±)' : '🔢 Ποσότητα'}
              </label>
              <input className="input" type="number"
                     value={qty}
                     onChange={e=>setQty(parseFloat(e.target.value||'0'))}
                     placeholder={type==='adjust' ? 'π.χ. -2 ή 5' : 'π.χ. 3'} />
            </div>

            {type === 'purchase' && (
              <div>
                <label className="block text-sm font-medium mb-1">💶 Κόστος Μονάδας</label>
                <input className="input" type="number" step="0.01"
                       value={unitCost}
                       onChange={e=>setUnitCost(parseFloat(e.target.value||'0'))}
                       placeholder="π.χ. 12.50" />
              </div>
            )}

            {type === 'sale' && (
              <div>
                <label className="block text-sm font-medium mb-1">💵 Τιμή Μονάδας</label>
                <input className="input" type="number" step="0.01"
                       value={unitPrice}
                       onChange={e=>setUnitPrice(parseFloat(e.target.value||'0'))}
                       placeholder="π.χ. 29.90" />
              </div>
            )}

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">📝 Σημείωση</label>
              <input className="input" placeholder="προαιρετικό" value={note} onChange={e=>setNote(e.target.value)} />
            </div>
          </div>

          {selected && (
            <div className="text-sm text-gray-600">
              Τρέχον Απόθεμα: <b>{selected.stock}</b> • Μέσο Κόστος: <b>{Number(selected.avg_cost||0).toLocaleString()}</b> • Τιμή: <b>{Number(selected.price||0).toLocaleString()}</b>
            </div>
          )}

          {err && <div className="text-red-600 text-sm">{err}</div>}
          {ok && <div className="text-green-700 text-sm">{ok}</div>}

          <div className="flex gap-2">
            <button className="btn btn-primary" type="submit">Καταχώριση</button>
            <button className="btn" type="button" onClick={() => { setQty(1); setUnitCost(0); setUnitPrice(selected?.price||0); setNote(''); setOk(null); setErr(null) }}>
              Καθαρισμός
            </button>
          </div>
        </form>

        <div className="card">
          <div className="text-lg font-medium mb-2">📜 Τελευταίες Κινήσεις</div>
          {loading ? <div>Φόρτωση…</div> :
            (txns.length === 0
              ? <div className="text-sm text-gray-600">Δεν υπάρχουν κινήσεις ακόμα.</div>
              : <div className="grid gap-2">
                  {txns.map(t => (
                    <div key={t.id} className="grid grid-cols-8 items-center gap-2 text-sm">
                      <div className="text-gray-500 col-span-2">{new Date(t.ts).toLocaleString()}</div>
                      <div className="font-mono">{t.product_code}</div>
                      <div className="truncate col-span-2">{t.product_name}</div>
                      <div className="capitalize">
                        {t.type === 'purchase' ? 'Αγορά' : t.type === 'sale' ? 'Πώληση' : 'Διόρθωση'}
                      </div>
                      <div>Ποσ.: {t.qty}</div>
                      <div>
                        {t.type === 'purchase' && <>Κόστος: {Number(t.unit_cost||0).toLocaleString()}</>}
                        {t.type === 'sale' && <>Τιμή: {Number(t.unit_price||0).toLocaleString()}</>}
                      </div>
                    </div>
                  ))}
                </div>
            )
          }
        </div>
      </Layout>
    </RequireAuth>
  )
}
