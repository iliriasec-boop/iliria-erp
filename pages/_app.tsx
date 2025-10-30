
import type { AppProps } from 'next/app'
import '@/styles/globals.css'

export default function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
// μέσα στο component
const [offersMonth, setOffersMonth] = useState<number>(0)
const [salesMonth, setSalesMonth] = useState<number>(0)

useEffect(()=>{ (async()=>{
  const mem = await supabase.from('org_members').select('org_id').limit(1)
  const oid = mem.data?.[0]?.org_id || null
  if (!oid) return

  // προσφορές τρέχοντος μήνα
  const start = new Date(); start.setDate(1); start.setHours(0,0,0,0)
  const { count: offCount } = await supabase
    .from('offers')
    .select('*',{count:'exact',head:true})
    .eq('org_id', oid)
    .gte('created_at', start.toISOString())
  setOffersMonth(offCount || 0)

  // σύνολο πωλήσεων (txns type='sale') τρέχοντος μήνα
  const { data: sales } = await supabase
    .from('txns')
    .select('unit_price, qty')
    .eq('org_id', oid)
    .eq('type','sale')
    .gte('date', start.toISOString())
  const total = (sales||[]).reduce((s,r)=> s + Number(r.unit_price||0)*Number(r.qty||0), 0)
  setSalesMonth(total)
})() }, [])

// και στο JSX βάλ’ τα σε 2 καρτέλες:
<div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
  <div className="card"><div className="text-sm text-gray-500">Προσφορές (μήνας)</div><div className="text-xl font-semibold">{offersMonth}</div></div>
  <div className="card"><div className="text-sm text-gray-500">Πωλήσεις (μήνας)</div><div className="text-xl font-semibold">{salesMonth.toLocaleString('el-GR',{minimumFractionDigits:2})}</div></div>
</div>
