/**
 * supabaseClient.js - Camada Central de Conexão com Supabase PostgreSQL
 * Portal De-Para TOTVS RM & Hub 360°
 */

const SUPABASE_URL = "https://dlhaxqfxkqidbgsgoeka.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_RANwyVD95xsqD0Xipi_uwQ_OaLZj0VM";

// Inicialização do cliente Supabase (usando a biblioteca global do CDN)
const supabase = (typeof window !== "undefined" && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ==============================================================================
// 1. SERVIÇOS: GESTÃO DE CLIENTES TOTVS
// ==============================================================================

const ClientesService = {
  /**
   * Lista todos os clientes TOTVS cadastrados
   */
  async listar() {
    if (!supabase) throw new Error("Supabase SDK não inicializado.");
    const { data, error } = await supabase
      .from("clientes_totvs")
      .select("*, projetos_depara(id, codigo_projeto, titulo, status, created_at)")
      .order("codigo_totvs", { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  /**
   * Obtém um cliente pelo Código TOTVS (ex: 'T004821')
   */
  async obterPorCodigo(codigoTotvs) {
    if (!supabase) throw new Error("Supabase SDK não inicializado.");
    const cleanCod = String(codigoTotvs).trim().toUpperCase();
    const { data, error } = await supabase
      .from("clientes_totvs")
      .select("*, projetos_depara(*)")
      .eq("codigo_totvs", cleanCod)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * Cadastra um novo cliente TOTVS
   */
  async cadastrar(payload) {
    if (!supabase) throw new Error("Supabase SDK não inicializado.");
    
    let cod = String(payload.codigo_totvs || "").trim().toUpperCase();
    if (!cod.startsWith("T")) {
      cod = "T" + cod;
    }

    const clienteData = {
      codigo_totvs: cod,
      razao_social: String(payload.razao_social || "").trim().toUpperCase(),
      nome_fantasia: payload.nome_fantasia ? String(payload.nome_fantasia).trim().toUpperCase() : null,
      cnpj: payload.cnpj ? String(payload.cnpj).trim() : null,
      consultor_responsavel: payload.consultor_responsavel ? String(payload.consultor_responsavel).trim() : null,
      contato_rh: payload.contato_rh ? String(payload.contato_rh).trim() : null,
      email_contato: payload.email_contato ? String(payload.email_contato).trim() : null,
      observacoes: payload.observacoes ? String(payload.observacoes).trim() : null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("clientes_totvs")
      .insert([clienteData])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Atualiza dados de um cliente existente
   */
  async atualizar(id, payload) {
    if (!supabase) throw new Error("Supabase SDK não inicializado.");
    const updateData = { ...payload, updated_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from("clientes_totvs")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Exclui um cliente (e todos os projetos em cascata)
   */
  async excluir(id) {
    if (!supabase) throw new Error("Supabase SDK não inicializado.");
    const { error } = await supabase
      .from("clientes_totvs")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return true;
  }
};

// ==============================================================================
// 2. SERVIÇOS: GESTÃO DE PROJETOS DE-PARA
// ==============================================================================

const ProjetosService = {
  /**
   * Lista todos os projetos com dados do cliente TOTVS e contagem de itens
   */
  async listar() {
    if (!supabase) throw new Error("Supabase SDK não inicializado.");
    const { data, error } = await supabase
      .from("projetos_depara")
      .select(`
        *,
        clientes_totvs (id, codigo_totvs, razao_social, nome_fantasia, cnpj)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Obtém detalhes de um projeto pelo código (ex: 'T004821-P00001')
   */
  async obterPorCodigo(codigoProjeto) {
    if (!supabase) throw new Error("Supabase SDK não inicializado.");
    const cleanCode = String(codigoProjeto).trim().toUpperCase();
    const { data, error } = await supabase
      .from("projetos_depara")
      .select(`
        *,
        clientes_totvs (id, codigo_totvs, razao_social, nome_fantasia, cnpj)
      `)
      .eq("codigo_projeto", cleanCode)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * Calcula o próximo sequencial disponível para o cliente (ex: 'T004821-P00001')
   */
  async obterProximoCodigoProjeto(codigoTotvs) {
    if (!supabase) throw new Error("Supabase SDK não inicializado.");
    const codCliente = String(codigoTotvs).trim().toUpperCase();
    
    const { data, error } = await supabase
      .from("projetos_depara")
      .select("codigo_projeto, clientes_totvs!inner(codigo_totvs)")
      .eq("clientes_totvs.codigo_totvs", codCliente);

    if (error) throw error;

    let maxSeq = 0;
    if (data && data.length > 0) {
      data.forEach(p => {
        const parts = p.codigo_projeto.split("-P");
        if (parts.length === 2) {
          const num = parseInt(parts[1], 10);
          if (!isNaN(num) && num > maxSeq) {
            maxSeq = num;
          }
        }
      });
    }

    const nextSeqStr = String(maxSeq + 1).padStart(5, "0");
    return `${codCliente}-P${nextSeqStr}`;
  },

  /**
   * Cria um novo projeto De-Para e popula todas as 15 tabelas a partir do Excel (se fornecido)
   */
  async criar(payload, rawDatabase = null) {
    if (!supabase) throw new Error("Supabase SDK não inicializado.");

    // 1. Criar registro do projeto
    const projData = {
      codigo_projeto: String(payload.codigo_projeto).trim().toUpperCase(),
      cliente_id: payload.cliente_id,
      titulo: String(payload.titulo || "Migração de Folha").trim(),
      tipo_migracao: payload.tipo_migracao || "FOLHA_PONTO",
      status: "EM_ANDAMENTO",
      passkey: String(payload.passkey || "1234").trim(),
      updated_at: new Date().toISOString()
    };

    const { data: novoProjeto, error: errProj } = await supabase
      .from("projetos_depara")
      .insert([projData])
      .select()
      .single();

    if (errProj) throw errProj;

    // 2. Se houver dados da planilha Excel, importar para as tabelas correspondentes em lote
    if (rawDatabase && typeof rawDatabase === "object") {
      await DeParaDataService.importarBaseCompleta(novoProjeto.id, rawDatabase);
    }

    return novoProjeto;
  },

  /**
   * Exclui um projeto e todas as suas linhas de mapeamento
   */
  async excluir(id) {
    if (!supabase) throw new Error("Supabase SDK não inicializado.");
    const { error } = await supabase
      .from("projetos_depara")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return true;
  }
};

// ==============================================================================
// 3. SERVIÇOS: DADOS DE-PARA & OPERAÇÕES EM TEMPO REAL
// ==============================================================================

const DeParaDataService = {
  /**
   * Mapeamento de abas do Excel para tabelas no Supabase
   */
  TABLE_MAP: {
    // Mapeamentos
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
    // Catálogos RM
    "DADOS_RM_EVENTOS": "dados_rm_eventos",
    "DADOS_RM_SITUACAO": "dados_rm_situacao",
    "DADOS_RM_MOTIVOS": "dados_rm_motivos",
    "DADOS_RM_SECOES": "dados_rm_secoes"
  },

  /**
   * Carrega todas as tabelas do projeto de uma só vez
   */
  async carregarProjetoCompleto(projetoId) {
    if (!supabase) throw new Error("Supabase SDK não inicializado.");

    const queries = Object.entries(this.TABLE_MAP).map(async ([sheetName, tableName]) => {
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .eq("projeto_id", projetoId);

      if (error) {
        console.warn(`Aviso ao ler ${tableName}:`, error.message);
        return { sheetName, rows: [] };
      }
      return { sheetName, rows: data || [] };
    });

    const results = await Promise.all(queries);
    const db = {};
    results.forEach(res => {
      db[res.sheetName] = res.rows;
    });

    return db;
  },

  /**
   * Atualiza uma única célula em tempo real no banco
   */
  async salvarCelula(tableName, rowId, campo, valor) {
    if (!supabase) throw new Error("Supabase SDK não inicializado.");

    const updatePayload = {
      [campo]: valor,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from(tableName)
      .update(updatePayload)
      .eq("id", rowId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Salva uma linha completa (quando o usuário mapeia um item)
   */
  async salvarLinha(tableName, rowId, payload) {
    if (!supabase) throw new Error("Supabase SDK não inicializado.");

    const updatePayload = {
      ...payload,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from(tableName)
      .update(updatePayload)
      .eq("id", rowId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Importa e popula todas as 15 tabelas a partir de um objeto rawDatabase gerado do Excel
   */
  async importarBaseCompleta(projetoId, rawDatabase) {
    if (!supabase) throw new Error("Supabase SDK não inicializado.");

    for (const [sheetName, rows] of Object.entries(rawDatabase)) {
      const tableName = this.TABLE_MAP[sheetName];
      if (!tableName || !Array.isArray(rows) || rows.length === 0) continue;

      const formattedRows = rows.map(r => {
        const item = { projeto_id: projetoId };
        
        // Normalização de chaves para o schema do PostgreSQL
        Object.keys(r).forEach(k => {
          if (k === undefined || k === null || k === "") return;
          const cleanKey = String(k).trim().toLowerCase()
            .replace(/ /g, "_")
            .replace(/[\u00C0-\u00FF]/g, c => ({ 'á':'a','à':'a','ã':'a','â':'a','é':'e','ê':'e','í':'i','ó':'o','ô':'o','õ':'o','ú':'u','ç':'c' })[c] || c)
            .replace(/[^a-z0-9_]/g, "");

          let val = r[k];
          if (val !== undefined && val !== null) {
            val = String(val).trim();
          } else {
            val = null;
          }

          if (cleanKey) {
            item[cleanKey] = val;
          }
        });

        // Status inicial
        if (!item.status) {
          item.status = (item.codigo_para || item.cod_rm || item.codcoligada_para) ? "MAPEADO" : "PENDENTE";
        }

        return item;
      });

      // Inserção em lotes de 200 linhas para performance máxima
      const chunkSize = 200;
      for (let i = 0; i < formattedRows.length; i += chunkSize) {
        const chunk = formattedRows.slice(i, i + chunkSize);
        const { error } = await supabase.from(tableName).insert(chunk);
        if (error) {
          console.warn(`Erro ao inserir lote na tabela ${tableName}:`, error.message);
        }
      }
    }
  },

  /**
   * Obtém os KPIs calculados de progresso de um projeto
   */
  async calcularProgresso(projetoId) {
    if (!supabase) throw new Error("Supabase SDK não inicializado.");

    const tables = [
      { key: "depara_eventos", name: "Eventos" },
      { key: "depara_coligadas", name: "Coligadas" },
      { key: "depara_funcoes", name: "Funções" },
      { key: "depara_sindicatos", name: "Sindicatos" },
      { key: "depara_secoes", name: "Seções" },
      { key: "depara_situacao", name: "Situação" },
      { key: "depara_bancos", name: "Bancos" },
      { key: "depara_horario", name: "Horários" }
    ];

    let totalGeral = 0;
    let mapeadosGeral = 0;
    const detalhes = {};

    await Promise.all(tables.map(async (t) => {
      const { count: total } = await supabase
        .from(t.key)
        .select("*", { count: "exact", head: true })
        .eq("projeto_id", projetoId);

      const { count: mapeados } = await supabase
        .from(t.key)
        .select("*", { count: "exact", head: true })
        .eq("projeto_id", projetoId)
        .eq("status", "MAPEADO");

      const tot = total || 0;
      const map = mapeados || 0;
      const pct = tot > 0 ? Math.round((map / tot) * 100) : 0;

      totalGeral += tot;
      mapeadosGeral += map;
      detalhes[t.key] = { total: tot, mapeados: map, pct };
    }));

    const progressoGeral = totalGeral > 0 ? Math.round((mapeadosGeral / totalGeral) * 100) : 0;
    return {
      totalGeral,
      mapeadosGeral,
      progressoGeral,
      detalhes
    };
  }
};
