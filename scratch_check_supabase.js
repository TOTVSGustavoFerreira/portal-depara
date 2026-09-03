const SUPABASE_URL = 'https://dlhaxqfxkqidbgsgoeka.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RANwyVD95xsqD0Xipi_uwQ_OaLZj0VM';

async function check() {
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
  };

  const resC = await fetch(`${SUPABASE_URL}/rest/v1/clientes_totvs?select=*`, { headers });
  const clients = await resC.json();
  console.log('Clientes no Supabase:', clients);

  const resP = await fetch(`${SUPABASE_URL}/rest/v1/projetos_depara?select=*`, { headers });
  const projs = await resP.json();
  console.log('Projetos no Supabase:', projs);

  if (Array.isArray(projs) && projs.length > 0) {
    for (const p of projs) {
      const resE = await fetch(`${SUPABASE_URL}/rest/v1/depara_eventos?projeto_id=eq.${p.id}&select=count`, {
        headers: { ...headers, 'Range-Unit': 'items', 'Prefer': 'count=exact' }
      });
      console.log(`Projeto ${p.codigo_projeto} (id: ${p.id}) Status:`, resE.status, 'Range:', resE.headers.get('content-range'));
      const evRows = await (await fetch(`${SUPABASE_URL}/rest/v1/depara_eventos?projeto_id=eq.${p.id}&limit=5`, { headers })).json();
      console.log(`Eventos amostra:`, evRows.length);
    }
  }
}
check();
