import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'
import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useState } from 'react'

type Category = { code: string; name: string }
type Product = {
  id: string
  code: string
  name: string
  category_code: string
  price: number
  stock: number
  image_url?: string | null
  avg_cost?: number
  description?: string | null   // <-- ΝΕΟ
}
type Settings = { currency: string; prefix_enabled: boolean; prefix_text: string; prefix_compact: boolean }

function pad(n: number, w: number){ return String(n).padStart(w,'0') }
function fileExt(name: string){ const i=name.lastIndexOf('.'); return i>=0?name.slice(i+1).toLowerCase():'jpg' }

export default function ProductsPage(){
  const [orgId, setOrgId] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [cats, setCats] = useState<Category[]>([])
  const [list, setList] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string|null>(null)
  const [ok, setOk] = useState<string|null>(null)

  // -------- CREATE FORM --------
  const [name, setName] = useState('')
  const [cat, setCat] = useState('')
  const [price, setPrice] = useState<number>(0)
  const [stock, setStock] = useState<number>(0)
  const [low, setLow] = useState<number>(2)
  const [nextIndex, setNextIndex] = useState<number>(1)
  const [imgFile, setImgFile] = useState<File | null>(null)
  const [imgPreview, setImgPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // -------- EDIT MODAL --------
  const [showEdit, setShowEdit] = useState(false)
  const [editOrig, setEditOrig] = useState<Product | null>(null)
  const [eName, setEName] = useState(''); const [eCat, setECat] = useState('')
  const [ePrice, setEPrice] = useState<number>(0); const [eStock, setEStock] = useState<number>(0)
  const [eLow, setELow] = useState<number>(0)
  const [eImgFile, setEImgFile] = useState<File | null>(null)
  const [eImgPreview, setEImgPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const codePreview = useMemo(() => {
    if (!cat) return '—'
    const idx = pad(nextIndex, 4)
    if (!settings) return `${cat}-${idx}`
    if (settings.prefix_enabled && settings.prefix_compact) return `${settings.prefix_text}${cat}${idx.slice(0,3)}`
    if (settings.prefix_enabled) return `${settings.prefix_text}${cat}${idx}`
    return `${cat}-${idx}`
  }, [cat, nextIndex, settings])

  function clearCreate(){
    setName(''); setCat(''); setPrice(0); setStock(0); setLow(2); setNextIndex(1)
    setImgFile(null); setImgPreview(null); setErr(null); setOk(null)
  }

  // ---------- LOAD ----------
  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null)
      const mem = await supabase.from('org_members').select('org_id').limit(1)
      const oid = mem.data?.[0]?.org_id || null
      setOrgId(oid)

      if (oid){
        const { data: set } = await supabase.from('settings')
          .select('currency,prefix_enabled,prefix_text,prefix_compact').eq('org_id', oid).single()
        setSettings(set as any)

        const { data: c } = await supabase.from('categories')
          .select('code,name').eq('org_id', oid).order('code')
        setCats(c || [])

        const { data: p } = await supabase.from('products')
          .select('id,code,name,category_code,price,stock,low_stock,image_url')
          .eq('org_id', oid).order('code')
        setList(p || [])
      }
      setLoading(false)
    })()
  }, [])

  // επόμενο αύξοντα όταν αλλάζει κατηγορία
  useEffect(() => {
    (async () => {
      if (!orgId || !cat){ setNextIndex(1); return }
      const { count } = await supabase.from('products')
        .select('*',{count:'exact',head:true})
        .eq('org_id', orgId).eq('category_code', cat)
      setNextIndex((count||0)+1)
    })()
  }, [orgId, cat])

  // ---------- CREATE ----------
  function onPickImage(e: React.ChangeEvent<HTMLInputElement>){
    const f = e.target.files?.[0] || null
    if (!f){ setImgFile(null); setImgPreview(null); return }
    if (!/^image\//.test(f.type)){ setErr('Επίλεξε εικόνα (jpg/png/webp).'); return }
    if (f.size > 2*1024*1024){ setErr('Μέγιστο μέγεθος 2MB.'); return }
    setErr(null); setImgFile(f); setImgPreview(URL.createObjectURL(f))
  }
  async function uploadImage(org: string, code: string, file: File){
    setUploading(true)
    try{
      const ext = fileExt(file.name)
      const path = `${org}/${code}-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('product-images')
        .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type })
      if (error) throw error
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      return data.publicUrl || null
    } finally { setUploading(false) }
  }
  async function addProduct(e: React.FormEvent){
    e.preventDefault()
    if (!orgId) return
    if (!cat || !name.trim()){ setErr('Συμπλήρωσε Όνομα και Κατηγορία.'); return }
    setErr(null); setOk(null)

    const idx = pad(nextIndex, 4)
    let code = `${cat}-${idx}`
    if (settings){
      if (settings.prefix_enabled && settings.prefix_compact) code = `${settings.prefix_text}${cat}${idx.slice(0,3)}`
      else if (settings.prefix_enabled) code = `${settings.prefix_text}${cat}${idx}`
    }

    let uploadedUrl: string | null = null
    if (imgFile) uploadedUrl = await uploadImage(orgId, code, imgFile)

    const { error } = await supabase.from('products').insert([{
      org_id: orgId, code, category_code: cat, product_index: nextIndex,
      name, description: '', supplier: '',
      image_url: uploadedUrl || '',
      cost: 0, avg_cost: 0,
      price: Number(price)||0, stock: Number(stock)||0, low_stock: Number(low)||0,
      active: true
    }])
    if (error){ setErr(error.message); return }

    const { data: p } = await supabase.from('products')
      .select('id,code,name,category_code,price,stock,low_stock,image_url')
      .eq('org_id', orgId).order('code')
    setList(p || [])
    clearCreate(); setOk('Το προϊόν καταχωρήθηκε.')
  }

  // ---------- EDIT ----------
  function openEdit(p: Product){
    setEditOrig(p)
    setEName(p.name); setECat(p.category_code)
    setEPrice(p.price); setEStock(p.stock); setELow(p.low_stock)
    setEImgFile(null); setEImgPreview(p.image_url || null)
    setShowEdit(true); setErr(null); setOk(null)
  }
  function onPickImageEdit(e: React.ChangeEvent<HTMLInputElement>){
    const f = e.target.files?.[0] || null
    if (!f){ setEImgFile(null); setEImgPreview(editOrig?.image_url || null); return }
    if (!/^image\//.test(f.type)){ setErr('Επίλεξε εικόνα (jpg/png/webp).'); return }
    if (f.size > 2*1024*1024){ setErr('Μέγιστο μέγεθος 2MB.'); return }
    setEImgFile(f); setEImgPreview(URL.createObjectURL(f))
  }
  async function saveEdit(){
    if (!orgId || !editOrig) return
    setSaving(true); setErr(null); setOk(null)
    try{
      let newUrl = editOrig.image_url
      if (eImgFile){
        newUrl = await uploadImage(orgId, editOrig.code, eImgFile)
      }
      const { error } = await supabase.from('products').update({
        name: eName,
        category_code: eCat,
        price: Number(ePrice)||0,
        stock: Number(eStock)||0,
        low_stock: Number(eLow)||0,
        image_url: newUrl || ''
      }).eq('org_id', orgId).eq('code', editOrig.code)
      if (error) throw error

      const { data: p } = await supabase.from('products')
        .select('id,code,name,category_code,price,stock,low_stock,image_url')
        .eq('org_id', orgId).order('code')
      setList(p || [])
      setShowEdit(false); setOk('Το προϊόν ενημερώθηκε.')
    } catch(e:any){
      setErr(e.message || 'Αποτυχία ενημέρωσης προϊόντος')
    } finally {
      setSaving(false)
    }
  }
  async function deleteProduct(p: Product){
    if (!orgId) return
    if (!confirm(`Διαγραφή προϊόντος ${p.code};`)) return
    const { error } = await supabase.from('products').delete()
      .eq('org_id', orgId).eq('code', p.code)
    if (error){ setErr(error.message); return }
    const { data: nd } = await supabase.from('products')
      .select('id,code,name,category_code,price,stock,low_stock,image_url')
      .eq('org_id', orgId).order('code')
    setList(nd || [])
  }

  return (
    <RequireAuth>
      <Layout>
        <h1 className="text-xl font-semibold mb-4">Προϊόντα</h1>

        {!orgId && <div className="card mb-4 text-sm">Δεν βρέθηκε οργάνωση (org_members).</div>}

        {/* CREATE */}
        <form onSubmit={addProduct} className="card mb-6 grid gap-3">
          <div className="text-lg font-medium">➕ Νέο Προϊόν</div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">🛒 Όνομα</label>
              <input className="input" placeholder="π.χ. Κάμερα IP 4MP"
                     value={name} onChange={e=>setName(e.target.value)} />
            </div>
            <div>
<label className="block text-sm font-medium mb-1">📝 Περιγραφή (μικρή)</label>
<textarea
  className="input"
  rows={3}
  placeholder="π.χ. Κάμερα 8MP, φακός 2.8mm, IR 30m, IP67"
  value={form.description || ''}
  onChange={(e)=> setForm({...form, description: e.target.value})}
/>
   </div>


            <div>
              <label className="block text-sm font-medium mb-1">📁 Κατηγορία</label>
              <select className="input" value={cat} onChange={e=>setCat(e.target.value)}>
                <option value="">— Επιλέξτε —</option>
                {cats.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">🏷️ Κωδικός (auto)</label>
              <input className="input" value={codePreview} readOnly />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">💶 Τιμή Πώλησης (€)</label>
              <input className="input" type="number" step="0.01" placeholder="π.χ. 45.00"
                     value={price} onChange={e=>setPrice(parseFloat(e.target.value||'0'))} />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">📦 Απόθεμα</label>
              <input className="input" type="number" placeholder="π.χ. 10"
                     value={stock} onChange={e=>setStock(parseInt(e.target.value||'0'))} />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">⚠️ Όριο Χαμηλού Αποθέματος</label>
              <input className="input" type="number" placeholder="π.χ. 2"
                     value={low} onChange={e=>setLow(parseInt(e.target.value||'0'))} />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">📷 Εικόνα Προϊόντος</label>
              <input className="input" type="file" accept="image/*" onChange={onPickImage} />
              {imgPreview && (
                <div className="mt-2">
                  <img src={imgPreview} alt="preview"
                       style={{width:120,height:120,objectFit:'cover',borderRadius:8,border:'1px solid #ddd'}}/>
                </div>
              )}
              {uploading && <div className="text-xs text-gray-500 mt-1">Ανέβασμα εικόνας…</div>}
            </div>
          </div>

          {err && <div className="text-red-600 text-sm">{err}</div>}
          {ok && <div className="text-green-700 text-sm">{ok}</div>}

          <div className="flex gap-2">
            <button className="btn btn-primary" type="submit" disabled={uploading}>Καταχώριση</button>
            <button className="btn" type="button" onClick={clearCreate}>Καθαρισμός</button>
          </div>
        </form>

        {/* LIST */}
        {loading ? <div>Φόρτωση…</div> :
          (list.length === 0
            ? <div className="text-sm text-gray-600">Δεν υπάρχουν προϊόντα ακόμα.</div>
            : <div className="grid gap-2">
                {list.map(p => (
                  <div key={p.id} className="card grid grid-cols-7 gap-3 items-center">
                    <div className="flex items-center gap-3 col-span-2">
                      {p.image_url
                        ? <img src={p.image_url} alt={p.name}
                               style={{width:48,height:48,objectFit:'cover',borderRadius:6}}/>
                        : <div style={{width:48,height:48,background:'#f1f1f1',borderRadius:6,
                                       display:'flex',alignItems:'center',justifyContent:'center',
                                       fontSize:12,color:'#888'}}>no img</div>}
                      <div>
                        <div className="font-mono text-sm">{p.code}</div>
                        <div className="text-sm">{p.name}</div>
                      </div>
                    </div>
                    <div className="text-sm">{p.category_code}</div>
                    <div className="text-sm">Τιμή: {Number(p.price||0).toLocaleString()}</div>
                    <div className="text-sm">Στοκ: {p.stock} (Low {p.low_stock})</div>
                    <div className="flex gap-2 justify-end">
                      <button className="btn" onClick={()=>openEdit(p)}>✏️ Επεξεργασία</button>
                      <button className="btn" onClick={()=>deleteProduct(p)}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
          )
        }

        {/* EDIT MODAL */}
        {showEdit && editOrig && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.35)'}} onClick={()=>!saving&&setShowEdit(false)}>
            <div className="card" style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',width:'min(720px,92vw)'}} onClick={e=>e.stopPropagation()}>
              <div className="text-lg font-medium mb-2">✏️ Επεξεργασία: <span className="font-mono">{editOrig.code}</span></div>

              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end mb-3">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">🛒 Όνομα</label>
                  <input className="input" value={eName} onChange={e=>setEName(e.target.value)} />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">📁 Κατηγορία</label>
                  <select className="input" value={eCat} onChange={e=>setECat(e.target.value)}>
                    {cats.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">💶 Τιμή Πώλησης (€)</label>
                  <input className="input" type="number" step="0.01" value={ePrice}
                         onChange={e=>setEPrice(parseFloat(e.target.value||'0'))} />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">📦 Απόθεμα</label>
                  <input className="input" type="number" value={eStock}
                         onChange={e=>setEStock(parseInt(e.target.value||'0'))} />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">⚠️ Όριο Χαμηλού Αποθέματος</label>
                  <input className="input" type="number" value={eLow}
                         onChange={e=>setELow(parseInt(e.target.value||'0'))} />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">📷 Εικόνα</label>
                  <input className="input" type="file" accept="image/*" onChange={onPickImageEdit} />
                  {eImgPreview && (
                    <div className="mt-2">
                      <img src={eImgPreview} alt="preview" style={{width:120,height:120,objectFit:'cover',borderRadius:8,border:'1px solid #ddd'}}/>
                    </div>
                  )}
                </div>
              </div>

              {err && <div className="text-red-600 text-sm">{err}</div>}
              {ok && <div className="text-green-700 text-sm">{ok}</div>}

              <div className="flex gap-2 justify-end">
                <button className="btn" onClick={()=>!saving&&setShowEdit(false)}>Κλείσιμο</button>
                <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving?'Αποθήκευση…':'Αποθήκευση'}</button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </RequireAuth>
  )
}
