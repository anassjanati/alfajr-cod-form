import process from 'node:process';
import { Link, useLoaderData } from 'react-router';
import { authenticate } from '../shopify.server';

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  if (session.shop !== process.env.ASSISTANT_SHOP) throw new Response('Forbidden', { status: 403 });
  const page = Math.max(1, Number.parseInt(new URL(request.url).searchParams.get('page'), 10) || 1);
  const response = await fetch(`http://127.0.0.1:3101/conversations?page=${page}`, { headers: { Authorization: `Bearer ${process.env.ASSISTANT_INTERNAL_TOKEN}` }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Response('Conversations temporairement indisponibles', { status: 503 });
  return Response.json(await response.json(), { headers: { 'Cache-Control': 'no-store' } });
}

export default function Conversations() {
  const { rows, page, pages, total } = useLoaderData();
  const date = value => new Date(value).toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' });
  return <main style={{ maxWidth: 1000, margin: 'auto', padding: 24, fontFamily: 'system-ui', color: '#163d78', background: '#f3f7fc' }}>
    <p>AL FAJR · Assistant shopping</p><h1>Conversations</h1>
    <p>Questions, réponses et produits proposés · {total} conversations conservées · Heure du Maroc</p>
    <p>Les nouveaux échanges sont conservés jusqu’à 30 jours. Aucun profil client n’est collecté. Le masquage automatique des coordonnées peut être incomplet : évitez de recopier des informations personnelles.</p>
    {!rows.length && <section style={{ padding: 24, background: 'white', borderRadius: 14 }}>Les prochaines conversations apparaîtront ici. Les anciens échanges n’étaient pas enregistrés.</section>}
    {rows.map((row, index) => <details key={row.id} style={{ margin: '16px 0', padding: 18, background: 'white', borderRadius: 14, borderTop: '3px solid #f28b21' }}>
      <summary style={{ cursor: 'pointer', overflowWrap: 'anywhere' }}><strong>Conversation {(page - 1) * 20 + index + 1}</strong> · {date(row.updatedAt)} · {row.turns.length} échanges<br />{row.turns[0]?.question.slice(0, 120)}</summary>
      {row.turns.map((turn, i) => <section key={i} style={{ marginTop: 20 }}>
        <small>{date(turn.at)}</small>
        <div style={{ padding: 14, borderRadius: 12, background: '#fff1e2', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><strong>Client</strong><p>{turn.question}</p></div>
        <div style={{ padding: 14, marginTop: 8, borderRadius: 12, background: '#eaf2ff', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><strong>Assistant</strong><p>{turn.answer}</p>
          {!!turn.products.length && <ul>{turn.products.map((p, j) => <li key={j}>{/^[a-z0-9-]+$/.test(p.handle) ? <a href={`https://al-fajr.ma/products/${p.handle}`} target="_blank" rel="noopener noreferrer">{p.title}</a> : p.title}</li>)}</ul>}
        </div>
      </section>)}
      {row.turns.length === 40 && <p>Les 40 derniers échanges de cette conversation sont affichés.</p>}
    </details>)}
    <nav style={{ display: 'flex', gap: 20 }} aria-label="Pages des conversations">{page > 1 && <Link to={`?page=${page - 1}`}>← Précédent</Link>}<span>Page {page} / {pages}</span>{page < pages && <Link to={`?page=${page + 1}`}>Suivant →</Link>}</nav>
  </main>;
}
