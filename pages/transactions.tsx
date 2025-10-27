import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'
import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useState } from 'react'

type Product = {
  id: string
  code: string
  name: string
  category_code: string
  price: number
  stock: number
  avg_cost: number
}

type UiTxn = 'purchase' | 'sale' | 'adjust'

type TxnRow = {
  id: string
  date: string
  type: 'purchase'|'sale'|'adjust'|string
  product_code: string
  product_name: string
  category_code: string
  qty: number
  unit_cost: number | null
  unit_price: number | null
  note: string | null
}

function mapDbType(t: UiTxn): 'purchase'|'sale'|'adjust' {
  if (t === 'sale') return 'sale'
  if (t === 'adjust') return 'adjust'
  return 'purchase'
}

// δέχεται και κόμμα (π.χ. "15,48")
const toNum = (v: string) => parseFloat((v || '0').toString().replace(',', '.'))

export default function TransactionsPage() {
  const [orgId, setOrgId] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [txns, setTxns] = useState<TxnRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // ---- form ----
  const [type, setType] = useState<UiTxn>('purchase')
  const [productId, setProductId] = useState<string>('')
  const [qty, setQty] = useState<number>(1)
  const [unit, setUnit] = useState<number>(0)
  const [note, setNote] = useState<string>('')
  const [updateListPrice, setUpdateListPrice] = useState<boolean>(false) // ΝΕΟ: ενημέρωση προτεινόμενης τιμής μόνο αν το θες

  const sel = useMemo(() => products.find(p => p.id === productId) || null, [products, productId])

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null)
      const mem = await supabase.from('org_members').select('org_id').limit(1)
      const oid = mem.data?.[0]?.org_id || null
      setOrgId(oid)
      if (oid) {
        await Promise.all([loadProducts(oid), loadTxns(oid)])
      }
      setLoading(false)
    })()
  }, [])

  async function loadProducts(oid: string){
    const { data, error } = await supabase
      .from('products')
      .select('id,code,name,category_code,price,stock,avg_cost')
      .eq('org_id', oid)
      .order('code')
    if (error) setErr(error.message)
    else setProducts(data || [])
  }

  async function loadTxns(oid: string){
    const { data, error } = await supabase
      .from('txns')
      .select('id,date,type,product_code,product_name,category_code,qty,unit_cost,unit_price,note')
      .eq('org_id', oid)
      .order('date', { ascending: false })
      .limit(50)
    if (error) setErr(error.message)
    else setTxns((data as TxnRow[]) || [])
  }

  function clearForm() {
    setType('purchase'); setProductId(''); setQty(1); setUnit(0); setNote(''); setUpdateListPrice(false)
    setErr(null); setOk(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId) return
    if (!sel) { setErr('Διάλεξε προϊόν.'); return }
    if (qty <= 0) { setErr('Μη έγκυρη ποσότητα.'); return }

    setErr(null); setOk(null)
    const typeDb = mapDbType(type)

    try {
      if (type === 'purchase') {
        const newQty = sel.stock + qty
        const newAvg = newQty === 0 ? sel.avg_cost : ((sel.avg_cost * sel.stock + unit * qty) / newQty)

        const { error: upErr } = await supabase.from('products').update({
          stock: newQty,
          avg_cost: newAvg,
          cost: unit
        }).eq('org_id', orgId).eq('id', sel.id)
        if (upErr) throw upErr

        const { error: txErr } = await supabase.from('txns').insert([{
          org_id: orgId,
          date: new Date().toISOString(),
          type: typeDb,
          product_code: sel.code,
          product_name: sel.name,
          category_code: sel.category_code,
          qty,
          unit_cost: unit,
          unit_price: null,
          note
        }])
        if (txErr) throw txErr

        setOk('Η αγορά καταχωρήθηκε.')
      }

      if (type === 'sale') {
        if (qty > sel.stock) { setErr('Δεν υπάρχει αρκετό απόθεμα.'); return }
        const newQty = sel.stock - qty

        // ΔΕΝ αλλάζουμε την προτεινόμενη τιμή, εκτός αν το τικάρεις
        const patch: Partial<Product> = { stock: newQty }
        if (updateListPrice) (patch as any).price = unit

        const { error: upErr } = await supabase.from('products').update(patch)
          .eq('org_id', orgId).eq('id', sel.id)
        if (upErr) throw upErr

        const { error: txErr } = await supabase.from('txns').insert([{
          org_id: orgId,
          date: new Date().toISOString(),
          type: typeDb,
          product_code: sel.code,
          product_name: sel.name,
          category_code: sel.category_code,
          qty,
          unit_cost: null,
          unit_price: unit,
          note
        }])
        if (txErr) throw txErr

        setOk('Η πώληση καταχωρήθηκε.')
      }

      if (type === 'adjust') {
        const newQty = sel.stock + qty // αρνητικό/θετικό

        const { error: upErr } = await supabase.from('products').update({
          stock: newQty < 0 ? 0 : newQty
        }).eq('org_id', orgId).eq('id', sel.id)
        if (upErr) throw upErr

        const { error: txErr } = await supabase.from('txns').insert([{
          org_id: orgId,
          date: new Date().toISOString(),
          type: typeDb,
          product_code: sel.code,
          product_name: sel.name,
          category_code: sel.category_code,
          qty,
          unit_cost: null,
          unit_price: null,
          note
        }])
        if (txErr) throw txErr

        setOk('Η διόρθωση καταχωρήθηκε.')
      }

      await loadProducts(orgId)
      await loadTxns(orgId)
      clearForm()
    } catch (e: any) {
      setErr(e.message || 'Αποτυχία καταχώρισης κίνησης.')
    }
  }

  const fmtDate = (s: string) => new Date(s).toLocaleString('el-GR')
  const labelType = (t: string) => t === 'purchase' ? 'Αγορά' : t === 'sale' ? 'Πώληση' : 'Διόρθωση'

  return (
    <RequireAuth>
      <Layout>
        <h1 className="text-xl font-semibold mb-4">Κινήσεις</h1>

        <form onSubmit={submit} className="card mb-6 grid gap-3">
          <div className="text-lg font-medium">➕ Νέα Κίνηση</div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-sm font-medium mb-1">⚙️ Τύπος</label>
              <select className="input" value={type} onChange={e => setType(e.target.value as UiTxn)}>
                <option value="purchase">Αγορά</option>
                <option value="sale">Πώληση</option>
                <option value="adjust">Διόρθωση</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">📦 Προϊόν</label>
              <select className="input" value={productId} onChange={e => setProductId(e.target.value)}>
                <option value="">— Επιλέξτε —</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">🔢 Ποσότητα</label>
              <input className="input" type="text" inputMode="decimal"
                     value={qty} onChange={e => setQty(toNum(e.target.value))}/>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {type === 'sale' ? '💶 Τιμή Μονάδας' : '💰 Κόστος Μονάδας'}
              </label>
              <input
  className="input"
  type="text"
  value={unit === 0 ? '' : unit.toString().replace('.', ',')}
  onChange={(e) => {
    const val = e.target.value.replace(/[^\d,\.]/g, '') // μόνο αριθμοί και κόμμα/τελεία
    setUnit(toNum(val))
  }}
  placeholder="π.χ. 45,23"
/>

            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">📝 Σημείωση</label>
              <input className="input" placeholder="προαιρετικό"
                     value={note} onChange={e => setNote(e.target.value)} />
            </div>
          </div>

          {type === 'sale' && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="checkbox" checked={updateListPrice}
                     onChange={e => setUpdateListPrice(e.target.checked)} />
              Ενημέρωση προτεινόμενης τιμής προϊόντος με αυτή την τιμή
            </label>
          )}

          <div className="text-sm text-gray-700">
            Τρέχον Απόθεμα: <b>{sel ? sel.stock : 0}</b>
            {' '}• Μέσο Κόστος: <b>{sel ? Number(sel.avg_cost || 0).toLocaleString() : 0}</b>
            {' '}• Τιμή: <b>{sel ? Number(sel.price || 0).toLocaleString() : 0}</b>
          </div>

          {err && <div className="text-red-600 text-sm">{err}</div>}
          {ok && <div className="text-green-700 text-sm">{ok}</div>}

          <div className="flex gap-2">
            <button className="btn btn-primary" type="submit">Καταχώριση</button>
            <button className="btn" type="button" onClick={clearForm}>Καθαρισμός</button>
          </div>
        </form>

        <div className="card">
          <div className="text-lg font-medium mb-3">📜 Τελευταίες Κινήσεις</div>

          {txns.length === 0 ? (
            <div className="text-sm text-gray-600">Δεν υπάρχουν κινήσεις ακόμα.</div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-gray-500">
                  <tr>
                    <th className="py-2 pr-4">Ημερομηνία</th>
                    <th className="py-2 pr-4">Τύπος</th>
                    <th className="py-2 pr-4">Κωδικός</th>
                    <th className="py-2 pr-4">Όνομα</th>
                    <th className="py-2 pr-4 text-right">Ποσότητα</th>
                    <th className="py-2 pr-4 text-right">Κόστος</th>
                    <th className="py-2 pr-4 text-right">Τιμή</th>
                    <th className="py-2">Σημείωση</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map(r => (
                    <tr key={r.id} className="border-t">
                      <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(r.date)}</td>
                      <td className="py-2 pr-4">{labelType(r.type)}</td>
                      <td className="py-2 pr-4">{r.product_code}</td>
                      <td className="py-2 pr-4">{r.product_name}</td>
                      <td className="py-2 pr-4 text-right">{r.qty}</td>
                      <td className="py-2 pr-4 text-right">{r.unit_cost ?? ''}</td>
                      <td className="py-2 pr-4 text-right">{r.unit_price ?? ''}</td>
                      <td className="py-2">{r.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Layout>
    </RequireAuth>
  )
}
