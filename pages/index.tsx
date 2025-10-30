// pages/index.tsx  (Pages Router)
// Αν έχεις app router, βάλε το σε app/page.tsx και πρόσθεσε 'use client' στην πρώτη γραμμή.

import Link from 'next/link';

export default function Home() {
  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold">Iliria ERP</h1>
      <p className="text-gray-600 mt-1">Καλώς ήρθες.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div className="card">
          <div className="text-sm text-gray-500">Αποθήκη</div>
          <div className="text-lg font-medium">Προϊόντα</div>
          <Link className="btn mt-2" href="/products">Μετάβαση</Link>
        </div>

        <div className="card">
          <div className="text-sm text-gray-500">Πωλήσεις</div>
          <div className="text-lg font-medium">Προσφορές</div>
          <Link className="btn mt-2" href="/offers">Μετάβαση</Link>
        </div>
      </div>
    </main>
  );
}
