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

type UiTxn = 'purchase' | 'sale' | 'adjust' // τι δείχνει το UI

// Χάρτης UI ➜ Βάση (για να περνάει το CHECK constraint)
function mapDbType(t: UiTxn): 'purchase' | 'sale' | 'adjust' {
  if (t === 'sale') return 'sale'
  if (t === 'adjust') return 'adjust'
  return 'purchase'
}

// parsing που δέχεται ΚΑΙ κόμμα (EL)
const toNum = (v: string) => parseFloat((v || '0').toString().replace(',', '.'))

export default function TransactionsPage() {
  const [orgId, setOrgId] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // ---- form ----
  const [type, setType] = useState<UiTxn>('purchase')
  const [productId, setProductId] = useState<string>('')
  const [qty, setQty] = useState<number>(1)
  const [unit, setUnit] = useState<number>(0) // κόστος ή τιμή ανά μονάδα
  const [note, setNote] = useState<string>('')

  // Επιλεγμένο προϊόν
  const sel = useMemo(() => products.find(p => p.id === productId) || null, [products, productId])

  // Φόρτωμα
  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null)

      const mem = await supabase.from('org_members').select('org_id').limit(1)
      const oid = mem.data?.[0]?.org_id || null
      setOrgId(oid)

      if (oid) {
        const { data, error } = await supabase
          .from('products')
          .select('id,code,name,category_code,price,stock,avg_cost')
          .eq('org_id', oid)
          .order('code')
        if (error) setErr(error.message)
        else setProducts(data || [])
      }

      setLoading(false)
    })()
  }, [])

  function clearForm() {
    setType('purchase'); setProductId(''); setQty(1); setUnit(0); setNote('')
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

        const { error: upErr } = await supabase.from('products').update({
          stock: newQty,
          price: unit
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
          unit_price: unit,
          note
        }])
        if (txErr) throw txErr

        setOk('Η πώληση καταχωρήθηκε.')
      }

      if (type === 'adjust') {
        const newQty = sel.stock + qty // negative/positive

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

      // refresh προϊόντα
      const { data: fresh } = await supabase
        .from('products')
        .select('id,code,name,category_code,price,stock,avg_cost')
        .eq('org_id', orgId)
        .order('code')
      setProducts(fresh || [])

      clearForm()
    } catch (e: any) {
      setErr(e.message || 'Αποτυχία καταχώρισης κίνησης.')
    }
  }

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
              <input
                className="input"
                type="number"
                value={qty}
                onChange={e => setQty(toNum(e.target.value))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {type === 'sale' ? '💶 Τιμή Μονάδας' : '💰 Κόστος Μονάδας'}
              </label>
              <input
                className="input"
                type="text"
                inputMode="decimal"
                value={unit}
                onChange={e => setUnit(toNum(e.target.value))}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">📝 Σημείωση</label>
              <input className="input" placeholder="προαιρετικό"
                     value={note} onChange={e => setNote(e.target.value)} />
            </div>
          </div>

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
          <div className="text-lg font-medium mb-2">📜 Τελευταίες Κινήσεις</div>
          <div className="text-sm text-gray-600">Δεν υπάρχουν κινήσεις ακόμα.</div>
        </div>
      </Layout>
    </RequireAuth>
  )
}
