import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'

type Usage = {
  db_total_bytes: number
  products_rows: number
  categories_rows: number
  txns_rows: number
  storage_total_bytes: number
  storage_files: number
}

function fmtBytes(b: number){
  if (b < 1024) return `${b} B`
  const u = ['KB','MB','GB','TB']
  let i = -1
  do { b = b / 1024; i++ } while (b >= 1024 && i < u.length-1)
  return `${b.toFixed(2)} ${u[i]}`
}

function Bar({value, max}:{value:number; max:number}){
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="w-full h-3 rounded bg-gray-200 overflow-hidden">
      <div className={`h-3 ${pct>85?'bg-red-500':pct>65?'bg-yellow-500':'bg-emerald-500'}`} style={{width:`${pct}%`}} />
    </div>
  )
}

export default function UsagePage(){
  const [data, setData] = useState<Usage | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Όρια Free plan (ενδεικτικά)
  const DB_FREE = 500 * 1024 * 1024;   // 500 MB
  const STORAGE_FREE = 1 * 1024 * 1024 * 1024; // 1 GB

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null)
      const { data, error } = await supabase.rpc('fn_usage_metrics')
      if (error){ setErr(error.message) }
      else { setData(data?.[0] || null) }
      setLoading(false)
    })()
  }, [])

  return (
    <RequireAuth>
      <Layout>
        <h1 className="text-xl font-semibold mb-4">Χρήση Πόρων</h1>

        {loading && <div>Φόρτωση…</div>}
        {err && <div className="text-red-600 text-sm">{err}</div>}

        {data && (
          <div className="grid gap-4 max-w-2xl">
            {/* Database */}
            <div className="card">
              <div className="text-lg font-medium mb-2">🗄️ Βάση Δεδομένων (Postgres)</div>
              <div className="flex items-center justify-between mb-1 text-sm">
                <div>Χώρος που χρησιμοποιείται</div>
                <div className="font-mono">{fmtBytes(data.db_total_bytes)} / {fmtBytes(DB_FREE)}</div>
              </div>
              <Bar value={data.db_total_bytes} max={DB_FREE} />
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div className="card">
                  <div className="text-gray-500">Προϊόντα</div>
                  <div className="font-mono">{data.products_rows.toLocaleString()}</div>
                </div>
                <div className="card">
                  <div className="text-gray-500">Κατηγορίες</div>
                  <div className="font-mono">{data.categories_rows.toLocaleString()}</div>
                </div>
                <div className="card">
                  <div className="text-gray-500">Κινήσεις</div>
                  <div className="font-mono">{data.txns_rows.toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* Storage */}
            <div className="card">
              <div className="text-lg font-medium mb-2">🖼️ Storage (Εικόνες προϊόντων)</div>
              <div className="flex items-center justify-between mb-1 text-sm">
                <div>Χώρος στον bucket <code>product-images</code></div>
                <div className="font-mono">{fmtBytes(data.storage_total_bytes)} / {fmtBytes(STORAGE_FREE)}</div>
              </div>
              <Bar value={data.storage_total_bytes} max={STORAGE_FREE} />
              <div className="mt-3 text-sm text-gray-600">
                Αρχεία: <span className="font-mono">{data.storage_files.toLocaleString()}</span>
              </div>
            </div>

            <div className="text-xs text-gray-500">
              * Τα όρια είναι ενδεικτικά για Free plan. Για μεγαλύτερα όρια, αναβάθμισε σε Pro.
            </div>
          </div>
        )}
      </Layout>
    </RequireAuth>
  )
}
