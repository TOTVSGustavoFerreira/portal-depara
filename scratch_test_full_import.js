const SUPABASE_URL = 'https://dlhaxqfxkqidbgsgoeka.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RANwyVD95xsqD0Xipi_uwQ_OaLZj0VM';

const TABLE_MAP = {
  "ZDEPARA_COLIGADAS": "depara_coligadas",
  "ZDEPARA_FUNCOES": "depara_funcoes",
  "ZDEPARA_SINDICATOS": "depara_sindicatos",
  "ZDEPARA_SECOES": "depara_secoes",
  "ZDEPARA_BANCOS": "depara_bancos",
  "ZDEPARA_SITUACAO": "depara_situacao",
  "ZDEPARA_EVENTOS": "depara_eventos",
  "ZDEPARA_HORARIO": "depara_horario",
  "ZDEPARA_MOTIVO_FUNCAO": "depara_motivo_funcao",
  "ZDEPARA_MOTIVO_SALARIO": "depara_motivo_salario",
  "ZDEPARA_MOTIVO_SECAO": "depara_motivo_secao",
  "DADOS_RM_EVENTOS": "dados_rm_eventos",
  "DADOS_RM_SITUACAO": "dados_rm_situacao",
  "DADOS_RM_MOTIVOS": "dados_rm_motivos",
  "DADOS_RM_SECOES": "dados_rm_secoes"
};

const TABLE_COLUMNS = {
  "depara_coligadas": ['projeto_id', 'empresa_de', 'id_origem', 'nome_de', 'cnpj', 'codcoligada_para', 'status', 'sugestoes', 'observacao'],
  "depara_funcoes": ['projeto_id', 'empresa_de', 'codigo_de', 'nome_de', 'cbo', 'cbo_2002', 'coligada_para', 'codigo_para', 'status', 'sugestoes', 'observacao'],
  "depara_sindicatos": ['projeto_id', 'empresa_de', 'codigo_de', 'nome_de', 'cnpj', 'coligada_para', 'codigo_para', 'status', 'sugestoes', 'observacao'],
  "depara_secoes": ['projeto_id', 'empresa_de', 'filial_de', 'codigo_de', 'nome_de', 'coligada_para', 'filial_para', 'codigo_para', 'descricao_secao', 'status', 'sugestoes', 'observacao'],
  "depara_bancos": ['projeto_id', 'empresa_de', 'numbanco_de', 'nome_banco_de', 'numagencia_de', 'nome_agencia_de', 'codigo_banco_para', 'codigo_agencia_para', 'status', 'sugestoes', 'observacao'],
  "depara_situacao": ['projeto_id', 'codigo_de', 'nome_de', 'codsituacao_para', 'codmotivo_para', 'codsituacao_retorno_para', 'codmotivo_retorno_para', 'status', 'sugestoes', 'observacao'],
  "depara_eventos": ['projeto_id', 'empresa_de', 'codigo_de', 'nome_de', 'tipo_evento', 'coligada_para', 'codigo_para', 'nome_rm', 'codigo_para_ficha_mes1', 'nome_rm_2', 'codigo_para_ficha_mes2', 'nome_rm_3', 'codigo_para_verbas_ferias', 'nome_rm_4', 'status', 'sugestoes', 'observacao'],
  "depara_horario": ['projeto_id', 'empresa_de', 'codigo_de', 'nome_de', 'coligada_para', 'codigo_para', 'status', 'sugestoes', 'observacao'],
  "depara_motivo_funcao": ['projeto_id', 'empresa_de', 'codigo_motivo_de', 'nome_motivo_de', 'coligada_para', 'codigo_motivo_para', 'status', 'sugestoes', 'observacao'],
  "depara_motivo_salario": ['projeto_id', 'empresa_de', 'codigo_motivo_de', 'nome_motivo_de', 'coligada_para', 'codigo_para', 'status', 'sugestoes', 'observacao'],
  "depara_motivo_secao": ['projeto_id', 'empresa_de', 'codigo_motivo_de', 'nome_motivo_de', 'coligada_para', 'codigo_motivo_para', 'status', 'sugestoes', 'observacao'],
  "dados_rm_eventos": ['projeto_id', 'codigo', 'descricao', 'tipo', 'valhordiaref', 'nat_esocial'],
  "dados_rm_situacao": ['projeto_id', 'codcliente', 'descricao'],
  "dados_rm_motivos": ['projeto_id', 'codcliente', 'descricao'],
  "dados_rm_secoes": ['projeto_id', 'coligada', 'filial', 'cod_secao', 'descricao', 'cnpj', 'observacoes']
};

async function testFullImportWithWhitelist() {
  const { execSync } = require('child_process');
  const pyOutput = execSync('python -c "import openpyxl, json; wb = openpyxl.load_workbook(\'exemplos/000-DE-PARA-PROJETO-DATA.xlsx\', data_only=True); res = {}; [res.update({s: [dict(zip([str(h).strip() if h is not None else f\'col_{i}\' for i, h in enumerate(list(ws.iter_rows(values_only=True))[0])], [str(v).strip() if v is not None else \'\' for v in r])) for r in list(ws.iter_rows(values_only=True))[1:] if any(r)]}) for s, ws in zip(wb.sheetnames, wb.worksheets)]; print(json.dumps(res))"').toString();

  const rawDatabase = JSON.parse(pyOutput);
  const projetoId = '20c94a98-f715-44de-8ce6-5c245eebbdea';

  for (const [sheetName, rows] of Object.entries(rawDatabase)) {
    const tableName = TABLE_MAP[sheetName];
    if (!tableName || !Array.isArray(rows) || rows.length === 0) continue;

    const allowedCols = new Set(TABLE_COLUMNS[tableName] || []);

    const formattedRows = rows.map(r => {
      const rawItem = {};
      Object.keys(r).forEach(k => {
        if (k === undefined || k === null || k === "") return;
        let cleanKey = String(k).trim().toLowerCase()
          .replace(/ /g, "_")
          .replace(/[\u00C0-\u00FF]/g, c => ({ 'á':'a','à':'a','ã':'a','â':'a','é':'e','ê':'e','í':'i','ó':'o','ô':'o','õ':'o','ú':'u','ç':'c' })[c] || c)
          .replace(/[^a-z0-9_]/g, "");

        if (cleanKey === "empresa__de") cleanKey = "empresa_de";
        if (tableName === "depara_coligadas") {
          if (cleanKey === "id") cleanKey = "id_origem";
          if (cleanKey === "codcoligada") cleanKey = "codcoligada_para";
        } else if (tableName === "dados_rm_eventos") {
          if (cleanKey === "tipoevento") cleanKey = "tipo";
        } else if (tableName === "dados_rm_secoes") {
          if (cleanKey === "cod_secao" || cleanKey === "cod_seao" || cleanKey === "codigo") cleanKey = "cod_secao";
          if (cleanKey === "descriao" || cleanKey === "descricao") cleanKey = "descricao";
          if (cleanKey === "observaoes" || cleanKey === "observacoes") cleanKey = "observacoes";
        }

        let val = r[k];
        if (val !== undefined && val !== null) val = String(val).trim();
        else val = null;
        rawItem[cleanKey] = val;
      });

      // Strict Whitelist
      const item = { projeto_id: projetoId };
      for (const col of allowedCols) {
        if (col === 'projeto_id') continue;
        if (rawItem[col] !== undefined) {
          item[col] = rawItem[col];
        }
      }

      if (!item.status && tableName.startsWith("depara_")) {
        item.status = (item.codigo_para || item.codcoligada_para || item.codsituacao_para || item.codigo_banco_para || item.codigo_motivo_para) ? "MAPEADO" : "PENDENTE";
      }
      return item;
    });

    // Limpar anteriores
    await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?projeto_id=eq.${projetoId}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });

    // Inserir lotes de 100
    const chunkSize = 100;
    let totalInserted = 0;
    for (let i = 0; i < formattedRows.length; i += chunkSize) {
      const chunk = formattedRows.slice(i, i + chunkSize);
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(chunk)
      });
      if (res.status >= 400) {
        const err = await res.text();
        console.error(`ERRO ao inserir lote em ${tableName}:`, err);
      } else {
        totalInserted += chunk.length;
      }
    }
    console.log(`✅ ${tableName} (${sheetName}): ${totalInserted} / ${formattedRows.length} registros inseridos com sucesso!`);
  }
}

testFullImportWithWhitelist();
