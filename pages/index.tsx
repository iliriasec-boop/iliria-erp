
import Layout from '@/components/Layout'
import RequireAuth from '@/components/RequireAuth'
import { useI18n } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type KPI = { productsCount: number; stockValue: number; lowStock: number }

export default function Home() {
  const { t } = useI18n();
  const [kpi, setKpi] = useState<KPI>({ productsCount: 0, stockValue: 0, lowStock: 0 });

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('products').select('id, stock, price');
      const productsCount = data?.length || 0;
      const stockValue = (data||[]).reduce((s,p)=> s + (p.stock||0)*(p.price||0), 0);
      const lowStock = (data||[]).filter(p => (p.stock||0) <=  (p as any).low_stock || 0).length;
      setKpi({ productsCount, stockValue, lowStock });
    }
    load();
  }, []);

  return (
    <RequireAuth>
      <Layout>
        <h1 className="text-2xl font-semibold mb-6">{t.dash.welcome}</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card"><div className="text-sm text-gray-600">{t.dash.productsCount}</div><div className="text-2xl font-semibold">{kpi.productsCount}</div></div>
          <div className="card"><div className="text-sm text-gray-600">{t.dash.stockValue}</div><div className="text-2xl font-semibold">{kpi.stockValue.toLocaleString()}</div></div>
          <div className="card"><div className="text-sm text-gray-600">{t.dash.lowStock}</div><div className="text-2xl font-semibold">{kpi.lowStock}</div></div>
        </div>
      </Layout>
    </RequireAuth>
  )
}
