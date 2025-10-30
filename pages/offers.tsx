import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'
import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useState } from 'react'

type Product = { id: string; code: string; name: string; price: number; image_url?: string|null; description?: string|null }
type Offer = {
  id: string; code: string; number: number; customer_name: string|null; created_at: string
  vat_percent: number; discount_percent: number; notes: string|null; customer_email: string|null
}
type Item = { position: number; product_id?: string; product_code?: string|null; name: string; qty: number; unit_price: number; image_url?: string|null; description?: string|null }

const toNum = (s: any) => {
  const n = parseFloat(String(s ?? '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

export default function OffersPage(){
  const [orgId, setOrgId] = useState<string|null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string|null>(null)
  const [ok, setOk] = useState<string|null>(null)

  // νέα προσφορά
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [vat, setVat] = useState(24)
  const [disc, setDisc] = useState(0)
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<Item[]>([{ position:1, name:'', qty:1, unit_price:0 }])

  const logoUrl = '/logo.svg' // ή βάλ’ το δικό σου δημόσιο URL

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null)
      const mem = await supabase.from('org_members').select('org_id').limit(1)
      const oid = mem.data?.[0]?.org_id || null
      setOrgId(oid)

      if (oid){
        const { data: p } = await supabase
          .from('products').select('id,code,name,price,image_url,description').eq('org_id', oid).order('code')
        setProducts(p || [])

        const { data: o } = await supabase
          .from('offers')
          .select('id,code,number,customer_name,customer_email,created_at,vat_percent,discount_percent,notes')
          .eq('org_id', oid)
          .order('created_at', { ascending: false })
          .limit(50)
        setOffers(o as Offer[] || [])
      }
      setLoading(false)
    })()
  }, [])

  const totals = useMemo(() => {
    const sub = items.reduce((s, it)=> s + (toNum(it.qty) * toNum(it.unit_price)), 0)
    const discount = sub * (toNum(disc)/100)
    const afterDisc = sub - discount
    const vatAmt = afterDisc * (toNum(vat)/100)
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
    setRow(i, {
      product_id: p.id,
      product_code: p.code,
      name: p.name,
      unit_price: p.price || 0,
      image_url: p.image_url || null,
      description: p.description || ''
    })
  }

  async function saveOffer(){
    if (!orgId) return
    if (items.length===0 || items.some(it=>!it.name || toNum(it.qty)<=0)) {
      setErr('Συμπλήρωσε τουλάχιστον μία γραμμή με ποσότητα > 0.'); return
    }
    setErr(null); setOk(null)

    const { data: seq, error: seqErr } = await supabase.rpc('next_offer_number', { p_org: orgId })
    if (seqErr) { setErr(seqErr.message); return }
    const nextNumber = seq?.[0]?.next_number || 1
    const nextCode = seq?.[0]?.next_code || 'ID-0001'

    const { data: inserted, error: insErr } = await supabase
      .from('offers')
      .insert([{
        org_id: orgId,
        number: nextNumber,
        code: nextCode,
        customer_name: customerName || null,
        customer_email: customerEmail || null,
        vat_percent: toNum(vat),
        discount_percent: toNum(disc),
        notes: notes || null
      }])
      .select('id,code')
      .single()

    if (insErr) { setErr(insErr.message); return }
    const offerId = inserted!.id

    const rows = items.map((it, idx) => ({
      org_id: orgId,
      offer_id: offerId,
      position: idx+1,
      product_code: it.product_code || null,
      name: it.name,
      qty: toNum(it.qty),
      unit_price: toNum(it.unit_price),
      total: toNum(it.qty) * toNum(it.unit_price),
      image_url: it.image_url || null,
      description: it.description || null
    }))
    const { error: itemsErr } = await supabase.from('offer_items').insert(rows)
    if (itemsErr){ setErr(itemsErr.message); return }

    const { data: o } = await supabase
      .from('offers')
      .select('id,code,number,customer_name,customer_email,created_at,vat_percent,discount_percent,notes')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50)
    setOffers(o as Offer[] || [])

    setCustomerName(''); setCustomerEmail(''); setVat(24); setDisc(0); setNotes('')
    setItems([{ position:1, name:'', qty:1, unit_price:0 }])
    setOk(`Η προσφορά ${inserted!.code} αποθηκεύτηκε.`)
  }

  async function fetchOfferFull(offerId: string){
    if (!orgId) return null
    const { data: offer } = await supabase
      .from('offers')
      .select('id,code,number,customer_name,customer_email,created_at,vat_percent,discount_percent,notes')
      .eq('org_id', orgId).eq('id', offerId).single()
    const { data: lines } = await supabase
      .from('offer_items')
      .select('position,product_code,name,qty,unit_price,total,image_url,description')
      .eq('org_id', orgId).eq('offer_id', offerId)
      .order('position')
    if (!offer || !lines) return null
    const sub = (lines as any[]).reduce((s,r)=> s + Number(r.total||0), 0)
    const discount = sub * (Number(offer.discount_percent||0)/100)
    const afterDisc = sub - discount
    const vatAmt = afterDisc * (Number(offer.vat_percent||0)/100)
    const grand = afterDisc + vatAmt
    return { offer, lines, sub, discount, afterDisc, vatAmt, grand }
  }

  async function printOffer(offerId: string){
  const data = await fetchOfferFull(offerId); if (!data) return
  const { offer, lines, sub, discount, afterDisc, vatAmt, grand } = data

  // HTML με πιο «πλούσιο» layout
  const html = `
<!DOCTYPE html><html lang="el"><head>
<meta charset="utf-8"/>
<title>Προσφορά ${offer.code}</title>
<style>
  @page { size: A4; margin: 14mm; }
  *{ box-sizing:border-box }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial; color:#111; }
  .head { display:flex; align-items:center; gap:14px; margin-bottom:14px; }
  .logo { height: 42px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { font-size: 12px; color:#555; }
  .box { border:1px solid #e6e6e6; border-radius:10px; padding:12px; }
  .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap:10px }
  table { width:100%; border-collapse: collapse; font-size: 12px; margin-top:10px; }
  th, td { padding: 8px; vertical-align: top; }
  thead th { background:#fafafa; color:#555; border-bottom:1px solid #eee; text-align:left; }
  tbody tr { border-bottom:1px solid #f1f1f1; }
  .right { text-align:right; white-space:nowrap; }
  .img { width: 64px; height: 64px; object-fit: cover; border-radius: 8px; border: 1px solid #eee; background:#fff; }
  .desc { color:#444; margin-top:4px }
  .totals { width: 320px; }
  .totals td { padding:4px 0; }
  footer { margin-top: 12px; font-size: 11px; color:#666 }
</style>
</head><body>
  <div class="head">
    ${logoUrl ? `<img class="logo" src="${logoUrl}" />` : ''}
    <div>
      <h1>Προσφορά ${offer.code}</h1>
      <div class="meta">Ημ/νία: ${new Date(offer.created_at).toLocaleDateString('el-GR')} · Πελάτης: ${offer.customer_name || '-'}</div>
    </div>
  </div>

  <div class="grid2">
    <div class="box">
      <div style="font-size:12px;color:#666;margin-bottom:6px">Στοιχεία Πελάτη</div>
      <div style="font-size:13px"><b>${offer.customer_name || '-'}</b><br/>${offer.customer_email || ''}</div>
    </div>
    <div class="box">
      <div style="font-size:12px;color:#666;margin-bottom:6px">Όροι</div>
      <div style="font-size:12px">Ισχύς προσφοράς: 30 ημέρες · Παράδοση: 3–7 εργάσιμες · Πληρωμή: 50% προκαταβολή</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Εικόνα</th>
        <th style="width:30%">Κωδικός / Τίτλος</th>
        <th>Περιγραφή</th>
        <th class="right">Ποσ.</th>
        <th class="right">Τιμή</th>
        <th class="right">Σύνολο</th>
      </tr>
    </thead>
    <tbody>
      ${(lines as any[]).map((r:any)=>`
        <tr>
          <td>${r.position}</td>
          <td>${r.image_url ? `<img class="img" src="${r.image_url}"/>` : ''}</td>
          <td>
            ${r.product_code ? `<div style="font-family:monospace">${r.product_code}</div>` : ''}
            <div><b>${r.name}</b></div>
          </td>
          <td>
            ${r.description ? `<div class="desc">${r.description}</div>` : '<span style="color:#aaa">—</span>'}
          </td>
          <td class="right">${Number(r.qty).toLocaleString('el-GR')}</td>
          <td class="right">${Number(r.unit_price).toLocaleString('el-GR', {minimumFractionDigits:2})}</td>
          <td class="right">${Number(r.total).toLocaleString('el-GR', {minimumFractionDigits:2})}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div style="margin-top:10px; display:flex; justify-content:flex-end;">
    <table class="totals">
      <tr><td>Υποσύνολο</td><td class="right">${sub.toLocaleString('el-GR',{minimumFractionDigits:2})}</td></tr>
      <tr><td>Έκπτωση (${offer.discount_percent || 0}%)</td><td class="right">-${discount.toLocaleString('el-GR',{minimumFractionDigits:2})}</td></tr>
      <tr><td>Μερικό</td><td class="right">${afterDisc.toLocaleString('el-GR',{minimumFractionDigits:2})}</td></tr>
      <tr><td>ΦΠΑ (${offer.vat_percent || 0}%)</td><td class="right">${vatAmt.toLocaleString('el-GR',{minimumFractionDigits:2})}</td></tr>
      <tr><td><b>Πληρωτέο</b></td><td class="right"><b>${grand.toLocaleString('el-GR',{minimumFractionDigits:2})}</b></td></tr>
    </table>
  </div>

  ${offer.notes ? `<div style="margin-top:10px" class="box"><b>Σημειώσεις:</b><div style="margin-top:6px;font-size:12px">${offer.notes}</div></div>` : ''}

  <footer>Iliria Digisat · Τηλ. · Email · ΑΦΜ/ΔΟΥ · IBAN</footer>

  <script>
    // Περίμενε να φορτώσουν ΟΛΕΣ οι εικόνες πριν το print (αλλιώς δε φαίνονται)
    function imagesReady() {
      const imgs = Array.from(document.images);
      if (imgs.length === 0) return Promise.resolve();
      return Promise.all(imgs.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(res => { img.addEventListener('load', res); img.addEventListener('error', res); });
      }));
    }
    imagesReady().then(()=> setTimeout(()=>window.print(), 150));
  </script>
</body></html>`

  // Άνοιγμα & render
  const win = window.open('', '_blank', 'width=900,height=1200'); if (!win) return
  win.document.write(html)
  win.document.close()
}


  async function emailOffer(offerId: string){
    const data = await fetchOfferFull(offerId); if (!data) return
    const { offer, lines, sub, discount, afterDisc, vatAmt, grand } = data
    if (!offer.customer_email){ alert('Δεν υπάρχει email πελάτη στη συγκεκριμένη προσφορά.'); return }

    // Απλό HTML email μέσω serverless route (δες /pages/api/send-offer.ts)
    const res = await fetch('/api/send-offer', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ offer, lines, totals: { sub, discount, afterDisc, vatAmt, grand }, logoUrl })
    })
    if (!res.ok){
      const t = await res.text()
      alert('Αποτυχία αποστολής email: ' + t)
      return
    }
    alert('Το email στάλθηκε στον πελάτη.')
  }

  async function convertToSale(offerId: string){
    if (!orgId) return
    const data = await fetchOfferFull(offerId); if (!data) return
    const { offer, lines } = data

    // για κάθε γραμμή, γράψε πώληση στο txns και μείωσε stock
    for (const r of lines as any[]){
      // βρες το product από τον κωδικό (αν υπάρχει)
      const { data: prod } = await supabase.from('products')
        .select('id,stock,category_code,code,name').eq('org_id', orgId).eq('code', r.product_code).single()

      // κίνηση
      await supabase.from('txns').insert([{
        org_id: orgId,
        date: new Date().toISOString(),
        type: 'sale',
        product_code: r.product_code || null,
        product_name: r.name,
        category_code: prod?.category_code || null,
        qty: Number(r.qty),
        unit_cost: null,
        unit_price: Number(r.unit_price),
        note: `Από προσφορά ${offer.code}`
      }])

      // stock
      if (prod){
        await supabase.from('products').update({
          stock: Math.max(0, Number(prod.stock||0) - Number(r.qty||0))
        }).eq('org_id', orgId).eq('id', prod.id)
      }
    }
    alert('Η προσφορά μετατράπηκε σε πώληση και ενημερώθηκε το απόθεμα.')
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
            <div className="md:col-span-6">
              <label className="block text-sm font-medium mb-1">📝 Σημειώσεις</label>
              <textarea className="input" rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="προαιρετικό" />
            </div>
          </div>

          {/* Γραμμές */}
          <div className="mt-2">
            {items.map((it, i)=>(
              <div key={i} className="grid grid-cols-12 gap-2 items-end mb-3">
                <div className="col-span-3">
                  <label className="block text-xs text-gray-600 mb-1">📦 Προϊόν (από αποθήκη)</label>
                  <select className="input" onChange={e=>pickProduct(i, e.target.value)}>
                    <option value="">— Επιλέξτε (προαιρετικό) —</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs text-gray-600 mb-1">Κωδικός</label>
                  <input className="input" value={it.product_code || ''} onChange={e=>setRow(i,{product_code:e.target.value})}/>
                </div>

                <div className="col-span-4">
                  <label className="block text-xs text-gray-600 mb-1">Τίτλος / Περιγραφή γραμμής</label>
                  <input className="input" value={it.name} onChange={e=>setRow(i, {name: e.target.value})} placeholder="Περιγραφή"/>
                  <textarea className="input mt-1" rows={2} placeholder="Μικρή περιγραφή προϊόντος"
                            value={it.description || ''} onChange={e=>setRow(i,{description:e.target.value})}/>
                </div>

                <div className="col-span-1">
                  <label className="block text-xs text-gray-600 mb-1">Ποσ.</label>
                  <input className="input" type="text" inputMode="decimal"
                         value={String(it.qty).replace('.', ',')}
                         onChange={e=>setRow(i, {qty: toNum(e.target.value)})}/>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs text-gray-600 mb-1">Τιμή Μον.</label>
                  <input className="input" type="text" inputMode="decimal"
                         value={String(it.unit_price).replace('.', ',')}
                         onChange={e=>setRow(i, {unit_price: toNum(e.target.value)})}/>
                </div>

                <div className="col-span-12 flex items-center gap-2">
                  {it.image_url
                    ? <img src={it.image_url} alt="" style={{width:64,height:64,objectFit:'cover',borderRadius:6,border:'1px solid #eee'}}/>
                    : <div className="text-xs text-gray-500">— Χωρίς εικόνα</div>}
                  <div className="ml-auto">
                    <button className="btn" type="button" onClick={()=>removeRow(i)}>🗑️</button>
                  </div>
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
                        <button className="btn" onClick={()=>emailOffer(o.id)}>✉️ Email</button>
                        <button className="btn" onClick={()=>convertToSale(o.id)}>🔁 Μετατροπή σε Πώληση</button>
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
