const SUPABASE_URL = 'https://dlhaxqfxkqidbgsgoeka.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RANwyVD95xsqD0Xipi_uwQ_OaLZj0VM';

async function testInsert() {
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  const testEvent = {
    projeto_id: '20c94a98-f715-44de-8ce6-5c245eebbdea',
    empresa_de: '1',
    codigo_de: '0001',
    nome_de: 'HORAS NORMAIS',
    tipo_evento: 'P',
    coligada_para: '1',
    codigo_para: '0001',
    nome_rm: 'HORAS NORMAIS',
    status: 'MAPEADO'
  };

  console.log('Tentando inserir evento de teste no Supabase...');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/depara_eventos`, {
    method: 'POST',
    headers,
    body: JSON.stringify(testEvent)
  });

  console.log('Status da resposta:', res.status, res.statusText);
  const body = await res.text();
  console.log('Corpo da resposta:', body);
}

testInsert();
