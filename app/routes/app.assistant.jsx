import process from 'node:process';
import { useLoaderData } from 'react-router';
import { authenticate } from '../shopify.server';

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  if (session.shop !== process.env.ASSISTANT_SHOP) throw new Response('Forbidden', { status: 403 });
  const response = await fetch('http://127.0.0.1:3101/stats', { headers: { Authorization: `Bearer ${process.env.ASSISTANT_INTERNAL_TOKEN}` }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Response('Statistiques temporairement indisponibles', { status: 503 });
  return Response.json(await response.json(), { headers: { 'Cache-Control': 'no-store' } });
}

export default function AssistantStats() {
  const { days, generatedAt } = useLoaderData();
  const total = { messages: 0, suggestions: 0, noResults: 0, cartAdds: 0 };
  const topics = {}, missing = {}, products = {};
  for (const day of Object.values(days)) {
    for (const key of Object.keys(total)) total[key] += day[key] || 0;
    for (const [key, count] of Object.entries(day.topics || {})) topics[key] = (topics[key] || 0) + count;
    for (const [key, count] of Object.entries(day.missing || {})) missing[key] = (missing[key] || 0) + count;
    for (const [id, p] of Object.entries(day.products || {})) { products[id] ||= { title: p.title, suggested: 0, added: 0 }; products[id].suggested += p.suggested; products[id].added += p.added; }
  }
  const table = (title, rows) => <section style={{ background: 'white', padding: 20, borderRadius: 16, marginTop: 18 }}><h2>{title}</h2>{rows.length ? <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}><thead><tr><th>Catégorie</th><th>Nombre</th></tr></thead><tbody>{rows.map(([key, count]) => <tr key={key}><td style={{ padding: '8px 0' }}>{key}</td><td>{count}</td></tr>)}</tbody></table> : <p>Les premières données apparaîtront après utilisation du chat.</p>}</section>;
  return <main style={{ maxWidth: 1050, margin: 'auto', padding: 24, color: '#163d78', background: '#f3f7fc', fontFamily: 'system-ui' }}>
    <p>AL FAJR · Assistant shopping</p><h1>Les échanges qui aident vos clients</h1><p>30 derniers jours · Actualisé le {new Date(generatedAt).toLocaleString('fr-FR')}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>{[['Messages', total.messages], ['Produits proposés', total.suggestions], ['Recherches sans résultat', total.noResults], ['Ajouts au panier signalés', total.cartAdds]].map(([label, count]) => <section key={label} style={{ padding: 20, flex: '1 1 180px', background: '#fff', borderTop: '4px solid #f28b21', borderRadius: 14 }}><p>{label}</p><strong style={{ fontSize: 32 }}>{count}</strong></section>)}</div>
    {table('Sujets des échanges', Object.entries(topics).sort((a, b) => b[1] - a[1]))}
    {table('Recherches sans résultat, par famille', Object.entries(missing).sort((a, b) => b[1] - a[1]))}
    <section style={{ background: 'white', padding: 20, marginTop: 18, borderRadius: 16 }}><h2>Produits les plus proposés</h2><table style={{ width: '100%', textAlign: 'left' }}><thead><tr><th>Produit</th><th>Propositions</th><th>Ajouts signalés</th></tr></thead><tbody>{Object.entries(products).sort((a, b) => b[1].suggested - a[1].suggested).slice(0, 20).map(([id, p]) => <tr key={id}><td style={{ padding: '8px 0' }}>{p.title}</td><td>{p.suggested}</td><td>{p.added}</td></tr>)}</tbody></table></section>
    <p>Compteurs agrégés, sans texte des conversations ni coordonnées clients. Les ajouts sont signalés par le navigateur après confirmation Shopify : ce ne sont ni des commandes ni des ventes. Les blocages réseau peuvent sous-estimer ces chiffres.</p>
  </main>;
}
