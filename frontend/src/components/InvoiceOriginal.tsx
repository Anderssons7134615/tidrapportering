import { useEffect, useState } from 'react';
import { supplierInvoicesApi } from '../services/api';
import { Button } from './ui/design';

export function InvoiceOriginal({ invoiceId }: { invoiceId: string }) {
  const [requested, setRequested] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!requested) return;
    let active = true;
    let objectUrl = '';
    setError('');
    void supplierInvoicesApi.document(invoiceId).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => { if (active) setError('Originalet kunde inte hämtas. Försök igen eller använd Hämta original.'); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); setUrl(''); };
  }, [invoiceId, requested, attempt]);
  return <aside aria-label="Fakturans original" className="min-w-0 rounded-xl border border-graphite-200 bg-white p-4 xl:sticky xl:top-24 xl:self-start">
    <h2 className="section-title">Original</h2>
    <p className="mt-2 text-sm text-graphite-600">Jämför uppgifterna med PDF:en. På mobil kan du öppna originalet i en egen flik eller hämta filen.</p>
    <Button variant="secondary" className="mt-3" onClick={() => setRequested(!requested)}>{requested ? 'Stäng originalvisning' : 'Visa original'}</Button>
    {requested && !url && !error && <p role="status" className="mt-3">Hämtar original…</p>}
    {requested && error && <><p role="alert" className="mt-3 text-sm">{error}</p><Button variant="secondary" className="mt-3" onClick={() => setAttempt((value) => value + 1)}>Försök igen</Button></>}
    {url && <>
      <a className="text-link mt-2 flex min-h-11 items-center" href={url} target="_blank" rel="noopener noreferrer">Öppna original i ny flik</a>
      <p className="text-sm text-graphite-600">Om förhandsvisningen saknas, öppna originalet i en ny flik.</p>
      <iframe title="Fakturans PDF-original" src={url} className="mt-3 hidden h-[70vh] w-full border-0 xl:block" />
    </>}
  </aside>;
}
