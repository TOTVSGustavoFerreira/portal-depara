/**
 * supabaseClient.js - Camada Central de Conexão com Supabase PostgreSQL & RBAC
 * Portal De-Para TOTVS RM & Hub 360°
 */

var SUPABASE_URL = "https://dlhaxqfxkqidbgsgoeka.supabase.co";
var SUPABASE_ANON_KEY = "sb_publishable_RANwyVD95xsqD0Xipi_uwQ_OaLZj0VM";

// Inicialização segura do cliente Supabase a partir do SDK global do CDN
var sb = (typeof window !== "undefined" && window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ==============================================================================
// 0. SERVIÇO: AUTENTICAÇÃO E CONTROLE DE ACESSO BASEADO EM PAPÉIS (RBAC)
// ==============================================================================

var AuthService = {
  /**
   * Realiza login com E-mail e Senha
   */
  async login(email, password) {
    if (!sb) throw new Error("Supabase SDK não inicializado.");
    const { data, error } = await sb.auth.signInWithPassword({
      email: String(email).trim().toLowerCase(),
      password: String(password)
    });
    if (error) throw error;
    
    // Carrega o perfil associado na tabela perfis_usuarios
    const profile = await this.getProfile(data.user.id);
    return { session: data.session, user: data.user, profile };
  },

  /**
   * Cadastra um novo usuário (auto-registro com status PENDENTE)
   */
  async signUp(email, password, metadata = {}) {
    if (!sb) throw new Error("Supabase SDK não inicializado.");
    const cleanEmail = String(email).trim().toLowerCase();
    
    const { data, error } = await sb.auth.signUp({
      email: cleanEmail,
      password: String(password),
      options: {
        data: {
          nome_completo: metadata.nome_completo || cleanEmail.split("@")[0],
          cargo: metadata.cargo || "Usuário",
          role: metadata.role || "CLIENTE",
          projeto: metadata.projeto || null
        }
      }
    });
    if (error) throw error;
    return data;
  },

  /**
   * Realiza logout do usuário
   */
  async logout() {
    if (!sb) return;
    const { error } = await sb.auth.signOut();
    if (error) console.warn("Erro ao fazer logout:", error.message);
  },

  /**
   * Altera a senha do usuário atualmente autenticado
   */
  async updatePassword(newPassword) {
    if (!sb) throw new Error("Supabase SDK não inicializado.");
    if (!newPassword || newPassword.length < 6) {
      throw new Error("A nova senha deve ter no mínimo 6 caracteres.");
    }
    const { data, error } = await sb.auth.updateUser({
      password: String(newPassword)
    });
    if (error) throw error;
    return data;
  },

  /**
   * Envia e-mail de recuperação de senha pelo Supabase Auth
   */
  async resetPasswordForEmail(email, redirectTo) {
    if (!sb) throw new Error("Supabase SDK não inicializado.");
    const cleanEmail = String(email).trim().toLowerCase();
    
    let defaultRedirect = window.location.href.split('?')[0].split('#')[0];
    if (window.location.hostname.includes("github.io")) {
      defaultRedirect = "https://totvsgustavoferreira.github.io/portal-depara/hub.html";
    }

    const { data, error } = await sb.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: redirectTo || defaultRedirect
    });
    if (error) throw error;
    return data;
  },

  /**
   * Obtém a sessão ativa
   */
  async getSession() {
    if (!sb) return null;
    const { data: { session }, error } = await sb.auth.getSession();
    if (error || !session) return null;
    return session;
  },

  /**
   * Obtém o usuário logado atualmente
   */
  async getCurrentUser() {
    if (!sb) return null;
    const { data: { user }, error } = await sb.auth.getUser();
    if (error || !user) return null;
    return user;
  },

  /**
   * Obtém o perfil RBAC do usuário na tabela perfis_usuarios
   */
  async getProfile(userId) {
    if (!sb) throw new Error("Supabase SDK não inicializado.");
    const uid = userId || (await this.getCurrentUser())?.id;
    if (!uid) return null;

    const { data, error } = await sb
      .from("perfis_usuarios")
      .select("*")
      .eq("id", uid)
      .maybeSingle();

    if (error) {
      console.warn("Erro ao carregar perfil:", error.message);
      return null;
    }
    return data;
  },

  /**
   * Lista todos os usuários cadastrados (apenas ADMIN pode visualizar todos via RLS)
   */
  async listarUsuarios() {
    if (!sb) throw new Error("Supabase SDK não inicializado.");
    const { data, error } = await sb
      .from("perfis_usuarios")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Atualiza status, role ou projetos autorizados de um usuário (apenas ADMIN)
   */
  async atualizarUsuario(userId, updates) {
    if (!sb) throw new Error("Supabase SDK não inicializado.");
    const payload = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await sb
      .from("perfis_usuarios")
      .update(payload)
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Aprova um usuário pendente definindo papel e projetos autorizados
   */
  async aprovarUsuario(userId, role = "CLIENTE", projetosAutorizados = [], adminEmail = "") {
    return this.atualizarUsuario(userId, {
      role: role,
      status: "APROVADO",
      projetos_autorizados: projetosAutorizados,
      aprovado_por: adminEmail,
      data_aprovacao: new Date().toISOString()
    });
  },

  /**
   * Bloqueia um usuário
   */
  async bloquearUsuario(userId) {
    return this.atualizarUsuario(userId, {
      status: "BLOQUEADO"
    });
  },

  /**
   * Solicita acesso a um projeto específico (para clientes)
   */
  async solicitarAcessoProjeto(userId, codigoProjeto) {
    const profile = await this.getProfile(userId);
    if (!profile) throw new Error("Perfil não encontrado.");
    
    const cleanProj = String(codigoProjeto).trim().toUpperCase();
    const currentList = Array.isArray(profile.projetos_autorizados) ? profile.projetos_autorizados : [];
    if (currentList.includes(cleanProj)) return profile;

    const novaLista = [...currentList, cleanProj];
    return this.atualizarUsuario(userId, {
      projetos_autorizados: novaLista
    });
  },

  /**
   * Escuta mudanças no estado de autenticação
   */
  onAuthStateChange(callback) {
    if (!sb) return { data: { subscription: { unsubscribe: () => {} } } };
    return sb.auth.onAuthStateChange(callback);
  }
};

// ==============================================================================
// 1. SERVIÇO: GESTÃO DE CLIENTES TOTVS
// ==============================================================================

var ClientesService = {
  /**
   * Lista todos os clientes TOTVS cadastrados
   */
  async listar() {
    if (!sb) throw new Error("Supabase SDK não inicializado.");
    const { data, error } = await sb
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
    if (!sb) throw new Error("Supabase SDK não inicializado.");
    const cleanCod = String(codigoTotvs).trim().toUpperCase();
    const { data, error } = await sb
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
    if (!sb) throw new Error("Supabase SDK não inicializado.");
    
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

    const { data, error } = await sb
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
    if (!sb) throw new Error("Supabase SDK não inicializado.");
    const updateData = { ...payload, updated_at: new Date().toISOString() };
    const { data, error } = await sb
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
    if (!sb) throw new Error("Supabase SDK não inicializado.");
    const { error } = await sb
      .from("clientes_totvs")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return true;
  }
};

// ==============================================================================
// 2. SERVIÇO: GESTÃO DE PROJETOS DE-PARA
// ==============================================================================

var ProjetosService = {
  /**
   * Lista todos os projetos com dados do cliente TOTVS
   */
  async listar() {
    if (!sb) throw new Error("Supabase SDK não inicializado.");
    const { data, error } = await sb
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
    if (!sb) throw new Error("Supabase SDK não inicializado.");
    const cleanCode = String(codigoProjeto).trim().toUpperCase();
    const { data, error } = await sb
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
    if (!sb) throw new Error("Supabase SDK não inicializado.");
    const codCliente = String(codigoTotvs).trim().toUpperCase();
    
    const { data, error } = await sb
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
    if (!sb) throw new Error("Supabase SDK não inicializado.");

    const projData = {
      codigo_projeto: String(payload.codigo_projeto).trim().toUpperCase(),
      cliente_id: payload.cliente_id,
      titulo: String(payload.titulo || "Migração de Folha").trim(),
      tipo_migracao: payload.tipo_migracao || "FOLHA_PONTO",
      status: "EM_ANDAMENTO",
      passkey: String(payload.passkey || "1234").trim(),
      updated_at: new Date().toISOString()
    };

    const { data: novoProjeto, error: errProj } = await sb
      .from("projetos_depara")
      .insert([projData])
      .select()
      .single();

    if (errProj) throw errProj;

    if (rawDatabase && typeof rawDatabase === "object") {
      await DeParaDataService.importarBaseCompleta(novoProjeto.id, rawDatabase);
    }

    return novoProjeto;
  },

  /**
   * Atualiza informações do projeto
   */
  async atualizar(id, payload) {
    if (!sb) throw new Error("Supabase SDK não inicializado.");
    const updateData = { ...payload, updated_at: new Date().toISOString() };
    const { data, error } = await sb
      .from("projetos_depara")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Exclui um projeto e todas as suas linhas de mapeamento
   */
  async excluir(id) {
    if (!sb) throw new Error("Supabase SDK não inicializado.");
    const { error } = await sb
      .from("projetos_depara")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return true;
  }
};

// ==============================================================================
// 3. SERVIÇO: DADOS DE-PARA & OPERAÇÕES EM TEMPO REAL
// ==============================================================================

var DeParaDataService = {
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

  TABLE_COLUMNS: {
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
  },

  /**
   * Carrega todas as tabelas do projeto de forma paginada para contornar o limite de 1000 linhas da API Supabase
   */
  async carregarProjetoCompleto(projetoId) {
    if (!sb) throw new Error("Supabase SDK não inicializado.");

    const queries = Object.entries(this.TABLE_MAP).map(async ([sheetName, tableName]) => {
      let allRows = [];
      let from = 0;
      const step = 1000;

      while (true) {
        const { data, error } = await sb
          .from(tableName)
          .select("*")
          .eq("projeto_id", projetoId)
          .range(from, from + step - 1);

        if (error) {
          console.warn(`Aviso ao ler ${tableName}:`, error.message);
          break;
        }
        if (!data || data.length === 0) break;
        allRows = allRows.concat(data);
        if (data.length < step) break;
        from += step;
      }
      return { sheetName, rows: allRows };
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
    if (!sb) throw new Error("Supabase SDK não inicializado.");

    const updatePayload = {
      [campo]: valor,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await sb
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
    if (!sb) throw new Error("Supabase SDK não inicializado.");

    const updatePayload = {
      ...payload,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await sb
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
    if (!sb) throw new Error("Supabase SDK não inicializado.");

    for (const [sheetName, rows] of Object.entries(rawDatabase)) {
      const tableName = this.TABLE_MAP[sheetName];
      if (!tableName || !Array.isArray(rows) || rows.length === 0) continue;

      // Limpar registros anteriores desta aba para este projeto antes de inserir os novos
      await sb.from(tableName).delete().eq("projeto_id", projetoId);

      const allowedCols = new Set(this.TABLE_COLUMNS[tableName] || []);

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

        // Filtro estrito: incluir apenas colunas que existem na tabela Supabase
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

      const chunkSize = 150;
      for (let i = 0; i < formattedRows.length; i += chunkSize) {
        const chunk = formattedRows.slice(i, i + chunkSize);
        const { error } = await sb.from(tableName).insert(chunk);
        if (error) {
          console.error(`Erro ao gravar lote em ${tableName}:`, error);
          throw new Error(`Falha ao gravar na tabela ${tableName}: ${error.message}`);
        }
      }
    }
  },

  /**
   * Obtém os KPIs calculados de progresso de um projeto
   */
  async calcularProgresso(projetoId) {
    if (!sb) throw new Error("Supabase SDK não inicializado.");

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
      const { count: total } = await sb
        .from(t.key)
        .select("*", { count: "exact", head: true })
        .eq("projeto_id", projetoId);

      const { count: mapeados } = await sb
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

// Disponibilizar no escopo global window para acesso transparente em todos os scripts
if (typeof window !== "undefined") {
  window.sb = sb;
  window.AuthService = AuthService;
  window.ClientesService = ClientesService;
  window.ProjetosService = ProjetosService;
  window.DeParaDataService = DeParaDataService;
}
