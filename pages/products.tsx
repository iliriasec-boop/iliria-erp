import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'
import { supabase } from '@/lib/supabase'
import { useEffect, useMemo, useRef, useState } from 'react'

type Category = { id?: string; code: string; name: string }
type Product = {
  id: string
  org_id: string
  code: string
  category_code: string
  name: string
  price: number
  stock: number
  low_stock?: number | null
  image_url?: string | null
  description?: string | null
  product_index?: number           // <-- ΝΕΟ
  created_at?: string
}


type FormState = {
  id?: string
  category_code: string
  code: string
  name: string
  description: string
  price: string
  stock: string
  image_url: string | null
}

const toNum = (v: string) => {
  if (!v) return 0
  const n = parseFloat(v.replace(',', '.'))
  return isNaN(n) ? 0 : n
}

export default function ProductsPage() {
  const [orgId, setOrgId] = useState<string | null>(null)
  const [cats, setCats] = useState<Category[]>([])
  const [rows, setRows] = useState<Product[]>([])
  const [q, setQ] = useState('')

  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [editing, setEditing] = useState<boolean>(false)
  const [form, setForm] = useState<FormState>({
    category_code: '',
    code: '',
    name: '',
    description: '',
    price: '0',
    stock: '0',
    image_url: null
  })

  const fileRef = useRef<HTMLInputElement | null>(null)

  // ------------ Load org + data -------------
  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null)
      const mem = await supabase.from('org_members').select('org_id').limit(1)
      const oid = mem.data?.[0]?.org_id || null
      setOrgId(oid)
      if (oid) {
        await Promise.all([loadCats(oid), loadProducts(oid)])
      }
      setLoading(false)
    })()
  }, [])

  async function loadCats(oid: string) {
    // Προσάρμοσε εάν το table σου λέγεται αλλιώς (π.χ. categories)
    const { data, error } = await supabase
      .from('categories')
      .select('code,name')
      .eq('org_id', oid)
      .order('code')
    if (!error) setCats((data || []) as any)
  }

  async function loadProducts(oid: string) {
    const { data, error } = await supabase
      .from('products')
      .select('id,org_id,code,category_code,name,price,stock,avg_cost,image_url,description,created_at')
      .eq('org_id', oid)
      .order('code')
    if (error) setErr(error.message)
    else setRows((data || []) as Product[])
  }

  // ------------ Helpers -------------
  const filtered = useMemo(() => {
    const x = q.trim().toLowerCase()
    if (!x) return rows
    return rows.filter(r =>
      r.code?.toLowerCase().includes(x) ||
      r.name?.toLowerCase().includes(x) ||
      r.category_code?.toLowerCase().includes(x)
    )
  }, [rows, q])

  function resetForm() {
    setEditing(false)
    setForm({
      category_code: '',
      code: '',
      name: '',
      description: '',
      price: '0',
      stock: '0',
      image_url: null
    })
    if (fileRef.current) fileRef.current.value = ''
    setErr(null); setOk(null)
  }

 // Διαβάζει το index από τον κωδικό για κατηγορία cc ('01', '02' κτλ)
// Υποστηρίζει ΚΑΙ τα δύο format: "01-0001" (παλιό), "IS010001" (νέο)
function getIndexFromCode(code: string, cc: string): number {
  if (!code) return 0

  // Παλιό: 01-0001
  const oldRe = new RegExp(`^${cc}-([0-9]{4})$`)
  const m1 = code.match(oldRe)
  if (m1) return parseInt(m1[1], 10)

  // Νέο: IS010001
  const newRe = new RegExp(`^IS${cc}([0-9]{4})$`)
  const m2 = code.match(newRe)
  if (m2) return parseInt(m2[1], 10)

  return 0
}

function nextIndexForCategory(category_code: string) {
  const cc = category_code.padStart(2, '0').slice(-2)
  const nums = rows
    .filter(r => (r.category_code || '').padStart(2,'0').slice(-2) === cc)
    .map(r => getIndexFromCode(r.code || '', cc))
    .filter(n => n > 0)
  const max = nums.length ? Math.max(...nums) : 0
  return max + 1
}

// Χτίζει ΝΕΟ κωδικό στο format "IS010001"
function buildCode(category_code: string, nextIdx: number) {
  const cc = category_code.padStart(2, '0').slice(-2)
  return `IS${cc}${String(nextIdx).padStart(4, '0')}`
}

  async function handleCategoryChange(newCat: string) {
    const cc = newCat.padStart(2, '0').slice(-2)
    const next = nextIndexForCategory(cc)
    setForm(f => ({ ...f, category_code: cc, code: buildCode(cc, next) }))
  }

  // ------------ Image upload -------------
  async function uploadImageIfAny(): Promise<string | null> {
    const file = fileRef.current?.files?.[0]
    if (!file) return form.image_url || null
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const stamp = Date.now()
    const path = `${orgId}/products/${form.code || 'no-code'}-${stamp}.${ext}`

    // Βεβαιώσου ότι έχεις public bucket 'product-images'
    const { error: upErr } = await supabase.storage.from('product-images').upload(path, file, { upsert: true })
    if (upErr) { setErr(upErr.message); return form.image_url || null }

    const { data } = supabase.storage.from('product-images').getPublicUrl(path)
    return data.publicUrl || null
  }

 async function save(e: React.FormEvent) {
  e.preventDefault()
  if (!orgId) return
  if (!form.name.trim()) { setErr('Γράψε όνομα.'); return }
  if (!form.category_code) { setErr('Διάλεξε κατηγορία.'); return }

  setErr(null); setOk(null)
  const img = await uploadImageIfAny()

  if (!editing) {
    // Υπολογίζουμε index + κωδικό ΓΙΑ ΝΕΟ προϊόν
    const idx = nextIndexForCategory(form.category_code)
    const newCode = buildCode(form.category_code, idx)

    const payload = {
      org_id: orgId,
      code: newCode,
      category_code: form.category_code,
      name: form.name.trim(),
      description: form.description?.trim() || null,
      price: toNum(form.price),
      stock: toNum(form.stock),
      low_stock: toNum((form as any).low ?? '2'), // αν έχεις πεδίο "low"
      image_url: img,
      product_index: idx        // <<< ΣΗΜΑΝΤΙΚΟ: περνάμε το index γιατί στη DB είναι NOT NULL
    }

    const { error } = await supabase.from('products').insert([payload])
    if (error) { setErr(error.message); return }
    setOk('Καταχωρήθηκε.')
  } else {
    // Στο UPDATE δεν αλλάζουμε code / product_index
    const payload = {
      category_code: form.category_code,
      name: form.name.trim(),
      description: form.description?.trim() || null,
      price: toNum(form.price),
      stock: toNum(form.stock),
      low_stock: toNum((form as any).low ?? '2'),
      image_url: img
    }
    const { error } = await supabase
      .from('products')
      .update(payload)
      .eq('org_id', orgId)
      .eq('id', (form as any).id)
    if (error) { setErr(error.message); return }
    setOk('Ενημερώθηκε.')
  }

  await loadProducts(orgId)
  resetForm()
}



  function editRow(p: Product) {
    setEditing(true)
    setForm({
      id: p.id,
      category_code: p.category_code || '',
      code: p.code || '',
      name: p.name || '',
      description: p.description || '',
      price: String(p.price ?? 0),
      stock: String(p.stock ?? 0),
      image_url: p.image_url || null
    })
    setErr(null); setOk(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function delRow(p: Product) {
    if (!orgId) return
    if (!confirm(`Διαγραφή προϊόντος ${p.code} – ${p.name};`)) return
    const { error } = await supabase.from('products').delete().eq('org_id', orgId).eq('id', p.id)
    if (error) setErr(error.message)
    else {
      setOk('Διαγράφηκε.')
      await loadProducts(orgId)
    }
  }

  // ------------ UI -------------
  return (
    <RequireAuth>
      <Layout>
        <h1 className="text-xl font-semibold mb-4">Προϊόντα</h1>

        {/* Φόρμα Δημιουργίας/Επεξεργασίας */}
        <form onSubmit={save} className="card mb-6 grid gap-3">
          <div className="text-lg font-medium">{editing ? '✏️ Επεξεργασία Προϊόντος' : '➕ Νέο Προϊόν'}</div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            {/* Κατηγορία */}
            <div>
              <label className="block text-sm font-medium mb-1">🗂️ Κατηγορία</label>
              <select
                className="input"
                value={form.category_code}
                onChange={(e) => handleCategoryChange(e.target.value)}
              >
                <option value="">— Επιλέξτε —</option>
                {cats.map(c => (
                  <option key={c.code} value={c.code}>{c.code.padStart(2,'0')} — {c.name}</option>
                ))}
              </select>
            </div>

            {/* Κωδικός (readonly αν θες) */}
            <div>
              <label className="block text-sm font-medium mb-1">🏷️ Κωδικός</label>
              <input
                className="input"
                value={form.code}
                onChange={(e)=> setForm({...form, code: e.target.value.trim()})}
                placeholder="π.χ. 01-0001"
              />
            </div>

            {/* Όνομα */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">📦 Όνομα</label>
              <input
                className="input"
                value={form.name}
                onChange={(e)=> setForm({...form, name: e.target.value})}
                placeholder="π.χ. Κάμερα 8MP"
              />
            </div>

            {/* Τιμή */}
            <div>
              <label className="block text-sm font-medium mb-1">💶 Τιμή</label>
              <input
                className="input"
                type="text"
                inputMode="decimal"
                value={form.price}
                onChange={(e)=> setForm({...form, price: e.target.value.replace(/[^\d,.\-]/g,'') })}
                placeholder="π.χ. 120,00"
              />
            </div>

            {/* Απόθεμα */}
            <div>
              <label className="block text-sm font-medium mb-1">🔢 Απόθεμα</label>
              <input
                className="input"
                type="text"
                inputMode="decimal"
                value={form.stock}
                onChange={(e)=> setForm({...form, stock: e.target.value.replace(/[^\d,.\-]/g,'') })}
                placeholder="π.χ. 5"
              />
            </div>

            {/* Περιγραφή */}
            <div className="md:col-span-6">
              <label className="block text-sm font-medium mb-1">📝 Περιγραφή (μικρή)</label>
              <textarea
                className="input"
                rows={3}
                placeholder="π.χ. Κάμερα 8MP, φακός 2.8mm, IR 30m, IP67"
                value={form.description}
                onChange={(e)=> setForm({...form, description: e.target.value})}
              />
            </div>

            {/* Εικόνα */}
            <div className="md:col-span-6">
              <label className="block text-sm font-medium mb-1">🖼️ Εικόνα προϊόντος</label>
              <div className="flex items-center gap-3">
                <input ref={fileRef} className="input" type="file" accept="image/*" />
                {form.image_url
                  ? <img src={form.image_url} alt="" style={{width:64,height:64,objectFit:'cover',border:'1px solid #eee',borderRadius:8}}/>
                  : <span className="text-xs text-gray-500">— Καμία εικόνα</span>}
              </div>
              <div className="text-xs text-gray-500 mt-1">Αν δεν επιλέξεις αρχείο, θα μείνει η υπάρχουσα εικόνα (αν υπάρχει).</div>
            </div>
          </div>

          {err && <div className="text-red-600 text-sm">{err}</div>}
          {ok  && <div className="text-green-700 text-sm">{ok}</div>}

          <div className="flex gap-2">
            <button className="btn btn-primary" type="submit">{editing ? 'Αποθήκευση αλλαγών' : 'Αποθήκευση'}</button>
            <button className="btn" type="button" onClick={resetForm}>Καθαρισμός</button>
          </div>
        </form>

        {/* ΛΙΣΤΑ */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-medium">📃 Λίστα Προϊόντων</div>
            <input className="input w-60" placeholder="Αναζήτηση…" value={q} onChange={e=>setQ(e.target.value)} />
          </div>

          {loading ? (
            <div>Φόρτωση…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-gray-600">Δεν βρέθηκαν προϊόντα.</div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-gray-500">
                  <tr>
                    <th className="py-2 pr-4">Κωδικός</th>
                    <th className="py-2 pr-4">Κατηγορία</th>
                    <th className="py-2 pr-4">Όνομα</th>
                    <th className="py-2 pr-4">Περιγραφή</th>
                    <th className="py-2 pr-4 text-right">Τιμή</th>
                    <th className="py-2 pr-4 text-right">Απόθεμα</th>
                    <th className="py-2">Ενέργειες</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} className="border-t align-top">
                      <td className="py-2 pr-4 font-mono whitespace-nowrap">{p.code}</td>
                      <td className="py-2 pr-4">{p.category_code}</td>
                      <td className="py-2 pr-4">{p.name}</td>
                      <td className="py-2 pr-4">
                        <div className="line-clamp-2 max-w-[420px]">{p.description || <span className="text-gray-400">—</span>}</div>
                        {p.image_url && <img src={p.image_url} alt="" style={{width:48,height:48,objectFit:'cover',border:'1px solid #eee',borderRadius:6,marginTop:6}}/>}
                      </td>
                      <td className="py-2 pr-4 text-right">{Number(p.price||0).toLocaleString('el-GR',{minimumFractionDigits:2})}</td>
                      <td className="py-2 pr-4 text-right">{Number(p.stock||0).toLocaleString('el-GR')}</td>
                      <td className="py-2">
                        <div className="flex gap-2">
                          <button className="btn" onClick={()=>editRow(p)}>✏️</button>
                          <button className="btn" onClick={()=>delRow(p)}>🗑️</button>
                        </div>
                      </td>
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
