import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'
import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useState } from 'react'

type Product = { id: string; code: string; name: string; price: number }
type Offer = {
  id: string; code: string; number: number; customer_name: string|null; created_at: string
  vat_percent: number; discount_percent: number; notes: string|null
}
type Item = { position: number; product_code?: string|null; name: string; qty: number; unit_price: number }

const toNum = (s: string) => {
  if (s == null) return 0
  const n = parseFloat(s.toString().replace(',', '.'))
  return isNaN(n) ? 0 : n
}

export default function OffersPage(){
  const [orgId, setOrgId] = useState<string|null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string|null>(null)
  const [ok, setOk] = useState<string|null>(null)

  // Φόρμα νέας προσφοράς
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [vat, setVat] = useState(24)        // %
  const [disc, setDisc] = useState(0)       // %
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<Item[]>([{ position:1, name:'', qty:1, unit_price:0 }])

  // logo προαιρετικά (για PDF)
  const logoUrl = '/logo.svg' // αν έχεις στο public/ ή βάλ’ το δικό σου URL

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null)
      const mem = await supabase.from('org_members').select('org_id').limit(1)
      const oid = mem.data?.[0]?.org_id || null
      setOrgId(oid)

      if (oid){
        const { data: p } = await supabase
          .from('products').select('id,code,name,price').eq('org_id', oid).order('code')
        setProducts(p || [])

        const { data: o } = await supabase
          .from('offers')
          .select('id,code,number,customer_name,created_at,vat_percent,discount_percent,notes')
          .eq('org_id', oid)
          .order('created_at', { ascending: false })
          .limit(50)
        setOffers(o as Offer[] || [])
      }
      setLoading(false)
    })()
  }, [])

  const totals = useMemo(() => {
    const sub = items.reduce((s, it)=> s + (toNum(it.qty as any) * toNum(it.unit_price as any)), 0)
    const discount = sub * (toNum(disc as any)/100)
    const afterDisc = sub - discount
    const vatAmt = afterDisc * (toNum(vat as any)/100)
    const grand = afterDisc + vatAmt
    return { sub, discount, afterDisc, vatAmt, grand }
  }, [items, vat, disc])

  function addRow(){
    setItems(prev => [...prev, { position: prev.length+1, name:'', qty:1, unit_price:0 }])
  }
  function removeRow(i:number){
    setItems(prev => prev.filter((_,idx)=>idx!==i).map((r,idx)=>({...r, position: idx+1})))
  }
  function setRow(i:number, patch: Partial<Item>){
    setItems(prev => prev.map((r,idx)=> idx===i ? {...r, ...patch} : r))
  }

  async function pickProduct(i:number, productId:string){
    const p = products.find(x=>x.id===productId)
    if (!p) return
    setRow(i, { product_code: p.code, name: p.name, unit_price: p.price || 0 })
  }

  async function saveOffer(){
    if (!orgId) return
    if (items.length===0 || items.some(it=>!it.name || toNum(it.qty as any)<=0)) {
      setErr('Συμπλήρωσε τουλάχιστον μία γραμμή με ποσότητα.'); return
    }
    setErr(null); setOk(null)

    // πάρε επόμενο number + code από function
    const { data: seq, error: seqErr } = await supabase.rpc('next_offer_number', { p_org: orgId })
    if (seqErr) { setErr(seqErr.message); return }
    const nextNumber = seq?.[0]?.next_number || 1
    const nextCode = seq?.[0]?.next_code || 'ID-0001'

    // insert προσφορά
    const { data: inserted, error: insErr } = await supabase
      .from('offers')
      .insert([{
        org_id: orgId,
        number: nextNumber,
        code: nextCode,
        customer_name: customerName || null,
        customer_email: customerEmail || null,
        vat_percent: toNum(vat as any),
        discount_percent: toNum(disc as any),
        notes: notes || null
      }])
      .select('id,code')
      .single()

    if (insErr) { setErr(insErr.message); return }
    const offerId = inserted!.id

    // items
    const rows = items.map((it, idx) => ({
      org_id: orgId,
      offer_id: offerId,
      position: idx+1,
      product_code: it.product_code || null,
      name: it.name,
      qty: toNum(it.qty as any),
      unit_price: toNum(it.unit_price as any),
      total: toNum(it.qty as any)*toNum(it.unit_price as any)
    }))
    const { error: itemsErr } = await supabase.from('offer_items').insert(rows)
    if (itemsErr){ setErr(itemsErr.message); return }

    // refresh list
    const { data: o } = await supabase
      .from('offers')
      .select('id,code,number,customer_name,created_at,vat_percent,discount_percent,notes')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50)
    setOffers(o as Offer[] || [])

    // καθάρισμα
    setCustomerName(''); setCustomerEmail(''); setVat(24); setDisc(0); setNotes('')
    setItems([{ position:1, name:'', qty:1, unit_price:0 }])
    setOk(`Η προσφορά ${inserted!.code} αποθηκεύτηκε.`)
  }

  async function printOffer(offerId: string){
    if (!orgId) return
    // φέρε full data
    const { data: offer } = await supabase
      .from('offers')
      .select('id,code,number,customer_name,customer_email,created_at,vat_percent,discount_percent,notes')
      .eq('org_id', orgId).eq('id', offerId).single()

    const { data: lines } = await supabase
      .from('offer_items')
      .select('position,product_code,name,qty,unit_price,total')
      .eq('org_id', orgId).eq('offer_id', offerId)
      .order('position')

    if (!offer || !lines) return

    const sub = lines.reduce((s:any, r:any)=> s + Number(r.total||0), 0)
    const discount = sub * (Number(offer.discount_percent||0)/100)
    const afterDisc = sub - discount
    const vatAmt = afterDisc * (Number(offer.vat_percent||0)/100)
    const grand = afterDisc + vatAmt

    const win = window.open('', '_blank', 'width=900,height=1200')
    if (!win) return
    win.document.write(`
<!DOCTYPE html><html lang="el"><head>
<meta charset="utf-8"/>
<title>Προσφορά ${offer.code}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#111; }
  h1 { font-size: 18px; margin: 0 0 6px; }
  .meta { font-size: 12px; color:#555; margin-bottom: 12px; }
  table { width:100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 8px; border-bottom: 1px solid #eee; }
  th { text-align:left; color:#555; }
  .right { text-align:right; white-space:nowrap; }
  .totals td { border:none; padding:4px 0; }
  .logo { height: 42px; }
</style>
</head><body>
  <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
    ${logoUrl ? `<img class="logo" src="${logoUrl}" />` : ''}
    <div>
      <h1>Προσφορά ${offer.code}</h1>
      <div class="meta">Ημ/νία: ${new Date(offer.created_at).toLocaleDateString('el-GR')} · Πελάτης: ${offer.customer_name || '-'}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Κωδικός</th>
        <th>Περιγραφή</th>
        <th class="right">Ποσ.</th>
        <th class="right">Τιμή</th>
        <th class="right">Σύνολο</th>
      </tr>
    </thead>
    <tbody>
      ${lines.map((r:any)=>`
        <tr>
          <td>${r.position}</td>
          <td>${r.product_code || ''}</td>
          <td>${r.name}</td>
          <td class="right">${Number(r.qty).toLocaleString('el-GR')}</td>
          <td class="right">${Number(r.unit_price).toLocaleString('el-GR', {minimumFractionDigits:2})}</td>
          <td class="right">${Number(r.total).toLocaleString('el-GR', {minimumFractionDigits:2})}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div style="margin-top:10px; display:flex; justify-content:flex-end;">
    <table style="width: 320px;">
      <tr class="totals"><td>Υποσύνολο</td><td class="right">${sub.toLocaleString('el-GR',{minimumFractionDigits:2})}</td></tr>
      <tr class="totals"><td>Έκπτωση (${offer.discount_percent || 0}%)</td><td class="right">-${discount.toLocaleString('el-GR',{minimumFractionDigits:2})}</td></tr>
      <tr class="totals"><td>Μερικό</td><td class="right">${afterDisc.toLocaleString('el-GR',{minimumFractionDigits:2})}</td></tr>
      <tr class="totals"><td>ΦΠΑ (${offer.vat_percent || 0}%)</td><td class="right">${vatAmt.toLocaleString('el-GR',{minimumFractionDigits:2})}</td></tr>
      <tr class="totals"><td><b>Πληρωτέο</b></td><td class="right"><b>${grand.toLocaleString('el-GR',{minimumFractionDigits:2})}</b></td></tr>
    </table>
  </div>

  ${offer.notes ? `<div style="margin-top:14px; font-size:12px; color:#444;"><b>Σημειώσεις:</b> ${offer.notes}</div>` : ''}

  <script>window.print();</script>
</body></html>
    `)
    win.document.close()
  }

  return (
    <RequireAuth>
      <Layout>
        <h1 className="text-xl font-semibold mb-4">Προσφορές</h1>

        {/* ΝΕΑ ΠΡΟΣΦΟΡΑ */}
        <div className="card mb-6 grid gap-3">
          <div className="text-lg font-medium">➕ Νέα Προσφορά</div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">👤 Πελάτης</label>
              <input className="input" value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="Ονοματεπώνυμο / Επωνυμία" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">✉️ Email</label>
              <input className="input" value={customerEmail} onChange={e=>setCustomerEmail(e.target.value)} placeholder="προαιρετικό" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">🧾 ΦΠΑ %</label>
              <input className="input" type="number" step="0.01" value={vat} onChange={e=>setVat(toNum(e.target.value))} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">🎯 Έκπτωση %</label>
              <input className="input" type="number" step="0.01" value={disc} onChange={e=>setDisc(toNum(e.target.value))} />
            </div>
          </div>

          {/* Γραμμές */}
          <div className="mt-2">
            {items.map((it, i)=>(
              <div key={i} className="grid grid-cols-12 gap-2 items-end mb-2">
                <div className="col-span-3">
                  <label className="block text-xs text-gray-600 mb-1">📦 Προϊόν</label>
                  <select className="input" onChange={e=>pickProduct(i, e.target.value)}>
                    <option value="">— Επιλέξτε από αποθήκη (προαιρετικό) —</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                  </select>
                </div>
                <div className="col-span-4">
                  <label className="block text-xs text-gray-600 mb-1">Περιγραφή</label>
                  <input className="input" value={it.name} onChange={e=>setRow(i, {name: e.target.value})} placeholder="Περιγραφή γραμμής" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-600 mb-1">Ποσότητα</label>
                  <input className="input" type="text" inputMode="decimal"
                         value={String(it.qty).replace('.', ',')}
                         onChange={e=>setRow(i, {qty: toNum(e.target.value)})}/>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-600 mb-1">Τιμή Μονάδας</label>
                  <input className="input" type="text" inputMode="decimal"
                         value={String(it.unit_price).replace('.', ',')}
                         onChange={e=>setRow(i, {unit_price: toNum(e.target.value)})}/>
                </div>
                <div className="col-span-1">
                  <button className="btn" type="button" onClick={()=>removeRow(i)}>🗑️</button>
                </div>
              </div>
            ))}
            <button className="btn" type="button" onClick={addRow}>+ Γραμμή</button>
          </div>

          {/* Σύνολα */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <div className="md:col-start-3 card">
              <div className="flex items-center justify-between text-sm"><div>Υποσύνολο</div><div className="font-mono">{totals.sub.toLocaleString('el-GR',{minimumFractionDigits:2})}</div></div>
              <div className="flex items-center justify-between text-sm"><div>Έκπτωση ({disc}%)</div><div className="font-mono">-{totals.discount.toLocaleString('el-GR',{minimumFractionDigits:2})}</div></div>
              <div className="flex items-center justify-between text-sm"><div>Μερικό</div><div className="font-mono">{totals.afterDisc.toLocaleString('el-GR',{minimumFractionDigits:2})}</div></div>
              <div className="flex items-center justify-between text-sm"><div>ΦΠΑ ({vat}%)</div><div className="font-mono">{totals.vatAmt.toLocaleString('el-GR',{minimumFractionDigits:2})}</div></div>
              <div className="flex items-center justify-between font-medium"><div>Πληρωτέο</div><div className="font-mono">{totals.grand.toLocaleString('el-GR',{minimumFractionDigits:2})}</div></div>
            </div>
          </div>

          {err && <div className="text-red-600 text-sm">{err}</div>}
          {ok && <div className="text-green-700 text-sm">{ok}</div>}

          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={saveOffer} type="button">Αποθήκευση Προσφοράς</button>
          </div>
        </div>

        {/* ΛΙΣΤΑ ΠΡΟΣΦΟΡΩΝ */}
        <div className="card">
          <div className="text-lg font-medium mb-2">📄 Πρόσφατες Προσφορές</div>
          {loading ? <div>Φόρτωση…</div> :
            (offers.length === 0
              ? <div className="text-sm text-gray-600">Δεν υπάρχουν προσφορές ακόμα.</div>
              : <div className="grid gap-2">
                  {offers.map(o=>(
                    <div key={o.id} className="card flex items-center justify-between">
                      <div>
                        <div className="font-mono">{o.code}</div>
                        <div className="text-sm text-gray-600">{o.customer_name || '—'} · {new Date(o.created_at).toLocaleDateString('el-GR')}</div>
                      </div>
                      <div className="flex gap-2">
                        <button className="btn" onClick={()=>printOffer(o.id)}>🖨️ PDF/Εκτύπωση</button>
                        {/* Προαιρετικά: Διόρθωση/Διαγραφή */}
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
