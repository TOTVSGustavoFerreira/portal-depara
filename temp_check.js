
    // Recuperar ID da Planilha da URL (?id=...) ou usar valor vazio padrão
    const urlParams = new URLSearchParams(window.location.search);
    const SPREADSHEET_ID = urlParams.get('id') || "";
    
    // ATENÇÃO: COLOQUE AQUI A URL DO WEB APP PUBLICADO NA CONTA PESSOAL DO GOOGLE
    const API_URL = "https://script.google.com/macros/s/AKfycbyb2-OlbTZRuiDyQ9ZQ5jQkAwHO0JcwzOIWh3OAn_kdEKKQy-BL9An3SD5l3c9hPWTh/exec";

    let database = [];
    let rmEvents = [];
    let unusedCreatedEvents = [];
    let unusedCreatedSecoes = [];
    let diagnostics = { gaps: [], duplicates: [] };
    let stats = {};
    let filteredData = [];
    let connectionInfo = {};
    
    let renderedCount = 40;
    const renderChunkSize = 25;
    
    let editingRowNumber = null;
    let expandedRowNumbers = new Set();
    
    let activeKpiFilter = 'all';
    let sortColumn = 'rowNum';
    let sortAscending = true;

    let clientPasskey = "";
    let currentModule = 'home'; // Roteamento padrão inicial

    window.onload = function() {
      if (!SPREADSHEET_ID) {
        showToast("ATENÇÃO: ID da planilha de origem não informado na URL (?id=ID_PLANILHA)", "error");
        return;
      }
      
      // Validação da Chave de Acesso (Passkey) para Multi-Tenant
      checkPasskeyAccess();
      
      // Forçar inicialização da aba correta
      switchModule('home');
      
      document.addEventListener('click', function(e) {
        if (!e.target.closest('.autocomplete-wrapper') && !e.target.closest('.autocomplete-td-wrapper')) {
          closeAllAutocompletes();
        }
      });
    };

    function checkPasskeyAccess() {
      // 1. Identificar o cliente a partir do ID da URL (ex: ?id=boalocacao)
      // Se for uma URL completa de planilha, extraímos o ID do arquivo ou usamos o texto simples
      let clientKey = SPREADSHEET_ID.toLowerCase();
      if (SPREADSHEET_ID.includes("docs.google.com")) {
        const matches = SPREADSHEET_ID.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (matches) clientKey = matches[1].toLowerCase();
      }
      
      // 2. Verificar se já temos a chave salva localmente para esse cliente
      const savedKey = localStorage.getItem(`passkey_${clientKey}`);
      
      // 3. Buscar o arquivo data/config_auth.json no repositório para validar
      showLoading("Validando credenciais...");
      
      fetch("data/config_auth.json")
        .then(res => {
          if (!res.ok) throw new Error("Não foi possível carregar as credenciais de segurança.");
          return res.json();
        })
        .then(authConfig => {
          hideLoading();
          
          // Encontrar se existe chave cadastrada para esse ID/cliente
          // Para ser tolerante, procuramos tanto pelo ID cru da URL quanto pelo ID reduzido
          let expectedKey = "";
          for (let key in authConfig) {
            if (clientKey.includes(key) || key.includes(clientKey)) {
              expectedKey = authConfig[key];
              document.getElementById("passkeyClientLabel").innerText = `Mapeamento De-Para | Projeto: ${key.toUpperCase()}`;
              break;
            }
          }
          
          // Se não houver chave definida para esse cliente, liberamos sem login (retrocompatibilidade)
          if (!expectedKey) {
            loadPortalData();
            return;
          }
          
          if (savedKey === expectedKey) {
            clientPasskey = savedKey;
            loadPortalData();
          } else {
            // Mostrar modal de login
            document.getElementById("passkeyModal").style.display = "flex";
            document.getElementById("passkeyInput").focus();
          }
        })
        .catch(err => {
          hideLoading();
          // Fallback caso config_auth.json não esteja na nuvem (primeira carga ou offline)
          console.warn("Segurança offline/local:", err.message);
          loadPortalData();
        });
    }

    function submitPasskey() {
      const inputVal = document.getElementById("passkeyInput").value.trim();
      let clientKey = SPREADSHEET_ID.toLowerCase();
      if (SPREADSHEET_ID.includes("docs.google.com")) {
        const matches = SPREADSHEET_ID.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (matches) clientKey = matches[1].toLowerCase();
      }
      
      showLoading("Validando chave...");
      
      fetch("data/config_auth.json")
        .then(res => res.json())
        .then(authConfig => {
          hideLoading();
          let expectedKey = "";
          for (let key in authConfig) {
            if (clientKey.includes(key) || key.includes(clientKey)) {
              expectedKey = authConfig[key];
              break;
            }
          }
          
          if (inputVal === expectedKey) {
            localStorage.setItem(`passkey_${clientKey}`, inputVal);
            clientPasskey = inputVal;
            document.getElementById("passkeyModal").style.display = "none";
            document.getElementById("passkeyErrorMsg").style.display = "none";
            loadPortalData();
          } else {
            document.getElementById("passkeyErrorMsg").style.display = "block";
          }
        })
        .catch(err => {
          hideLoading();
          showToast("Erro ao validar: " + err.message, "error");
        });
    }

    function toggleSidebar() {
      const sidebar = document.getElementById("sidebar");
      sidebar.classList.toggle("collapsed");
      
      const btn = document.querySelector(".sidebar-toggle-btn svg");
      if (sidebar.classList.contains("collapsed")) {
        btn.innerHTML = `<path d="M4 6h16M4 12h16M4 18h16"/>`;
      } else {
        btn.innerHTML = `<path d="M15 19l-7-7 7-7"/>`;
      }
    }

    function toggleSubmenuTree() {
      const list = document.getElementById("submenuTreeList");
      const arrow = document.getElementById("submenuTreeArrow");
      list.classList.toggle("collapsed");
      arrow.innerText = list.classList.contains("collapsed") ? "▶" : "▼";
    }

    function showToast(message, type = 'success') {
      const container = document.getElementById("toastContainer");
      const toast = document.createElement("div");
      toast.className = `toast toast-${type}`;
      
      let iconSvg = '';
      if (type === 'success') {
        iconSvg = `<svg class="toast-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
      } else if (type === 'error') {
        iconSvg = `<svg class="toast-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
      } else {
        iconSvg = `<svg class="toast-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
      }
      
      toast.innerHTML = `
        ${iconSvg}
        <span>${message}</span>
      `;
      container.appendChild(toast);
      
      setTimeout(() => toast.classList.add("show"), 10);
      
      setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
      }, 4500);
    }

    function showSoonAlert(moduleName) {
      showToast(`Módulo de mapeamento de ${moduleName} estará disponível nas próximas etapas do projeto!`, 'warning');
    }

    // Método para fazer chamadas HTTP GET à API do Apps Script
    function apiGet(action, extraParams = {}) {
      let url = `${API_URL}?action=${action}&id=${SPREADSHEET_ID}`;
      for (let key in extraParams) {
        url += `&${key}=${encodeURIComponent(extraParams[key])}`;
      }
      return fetch(url).then(res => {
        if (!res.ok) throw new Error("Erro de rede CORS");
        return res.json();
      });
    }

    // Método para fazer chamadas HTTP POST à API do Apps Script
    function apiPost(action, body = {}) {
      body.id = SPREADSHEET_ID;
      body.action = action;
      return fetch(API_URL, {
        method: "POST",
        body: JSON.stringify(body)
      }).then(res => {
        if (!res.ok) throw new Error("Erro de rede CORS");
        return res.json();
      });
    }

    // Variáveis de controle para a importação temporária
    let tempImportWorkbook = null;
    let tempImportFileName = "";

    // Cache em memória do banco completo carregado
    let rawJsonDatabase = {};

    function loadPortalData() {
      showLoading("Carregando base de dados do GitHub...");
      
      let clientKey = SPREADSHEET_ID.toLowerCase();
      if (SPREADSHEET_ID.includes("docs.google.com")) {
        const matches = SPREADSHEET_ID.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (matches) clientKey = matches[1].toLowerCase();
      }

      const pat = localStorage.getItem("gh_pat");
      const owner = localStorage.getItem("gh_owner") || "TOTVSGustavoFerreira";
      const repo = localStorage.getItem("gh_repo") || "portal-depara-navarro";
      const filePath = `data/${clientKey}.json`;
      
      // Se o token estiver configurado, lê DIRETAMENTE da API do GitHub (sempre atualizado).
      // Isso evita o atraso de deploy do GitHub Pages (que pode demorar até 10 minutos).
      // Se não houver token, usa o fallback pelo GitHub Pages como antes.
      let fetchPromise;
      
      const fileBase = `data/${clientKey}_base.json`;
      const fileEvHor = `data/${clientKey}_eventos_horarios.json`;
      const fileCad = `data/${clientKey}_cadastros.json`;

      const getFilePromise = (fileName, usePat) => {
        const timestamp = new Date().getTime();
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${fileName}?t=${timestamp}`;
        if (usePat) {
          return fetch(apiUrl, { headers: { "Authorization": `token ${pat}`, "Accept": "application/vnd.github.v3+json" } })
            .then(res => {
              if (res.status === 401) throw new Error("Token do GitHub inválido ou expirado.");
              if (res.status === 404) return null; // Arquivo não encontrado (novo banco ou base antiga)
              if (!res.ok) throw new Error("Erro ao acessar a API do GitHub para " + fileName);
              return res.json();
            }).then(info => {
              if (!info) return { sha: null, content: null };
              if (!info.content) {
                // Se o fallback do monolito for disparado e ele for >1MB, o content vem vazio.
                // Nesse caso (que só acontece se a pessoa não tiver migrado), jogamos um erro claro.
                if (fileName.includes('_base')) {
                   throw new Error("Arquivo no GitHub corrompido ou acima do limite. Por favor, reimporte a planilha.");
                }
                return { sha: info.sha, content: null };
              }
              const jsonText = decodeURIComponent(escape(window.atob(info.content)));
              return { sha: info.sha, content: JSON.parse(jsonText) };
            });
        } else {
          return fetch(`${fileName}?t=${timestamp}`).then(res => {
            if (res.status === 404) return { sha: null, content: null };
            if (!res.ok) throw new Error("Erro ao carregar " + fileName);
            return res.text();
          }).then(text => ({ sha: null, content: text ? JSON.parse(text) : null }));
        }
      };

      if (pat) {
        fetchPromise = Promise.all([
          getFilePromise(fileBase, true),
          getFilePromise(fileEvHor, true),
          getFilePromise(fileCad, true)
        ]).then(([resBase, resEvHor, resCad]) => {
          if (!resBase.content && !resEvHor.content && !resCad.content) {
            // Tenta fallback para o arquivo monolítico antigo
            return getFilePromise(`data/${clientKey}.json`, true).then(resMono => {
              if (!resMono.content) throw new Error("Base de dados não encontrada. Re-importe a planilha.");
              rawJsonDatabase = resMono.content;
              rawJsonDatabase._sha = { monolith: resMono.sha };
              return rawJsonDatabase;
            });
          }
          
          rawJsonDatabase = { ...(resBase.content || {}), ...(resEvHor.content || {}), ...(resCad.content || {}) };
          rawJsonDatabase._sha = {
            base: resBase.sha,
            eventos_horarios: resEvHor.sha,
            cadastros: resCad.sha
          };
          return rawJsonDatabase;
        });
      } else {
        fetchPromise = Promise.all([
          getFilePromise(fileBase, false),
          getFilePromise(fileEvHor, false),
          getFilePromise(fileCad, false)
        ]).then(([resBase, resEvHor, resCad]) => {
          if (!resBase.content && !resEvHor.content && !resCad.content) {
            return getFilePromise(`data/${clientKey}.json`, false).then(resMono => {
              if (!resMono.content) throw new Error("Base de dados não encontrada.");
              rawJsonDatabase = resMono.content;
              return rawJsonDatabase;
            });
          }
          rawJsonDatabase = { ...(resBase.content || {}), ...(resEvHor.content || {}), ...(resCad.content || {}) };
          return rawJsonDatabase;
        });
      }
      // O fetchPromise já está configurado (com pat ou sem pat)
      
      fetchPromise
        .then(response => {
          hideLoading();
          
          connectionInfo = {
            isInstalled: true,
            originName: response.config?.originName || "GitHub JSON DB",
            destinationName: response.config?.destinationName || "Google Planilha Oficial",
            destinationPath: "Exportação via Download"
          };

          document.getElementById("mainInterface").style.display = "flex";
          document.getElementById("wizardSetup").style.display = "none";
          
          // rmEvents e dados de apoio globais
          rmEvents = response.DADOS_RM_EVENTOS || [];
          unusedCreatedEvents = [];
          
          // Normalizar as propriedades das abas importadas/carregadas
          normalizeDatabaseProperties(rawJsonDatabase);
          
          // Forçar renderização do módulo ativo
          switchModule(currentModule);
          
          // Carregar os progressos na home
          updateHomeProgress();
        })
        .catch(err => {
          hideLoading();
          showToast("Erro ao carregar dados: " + err.message, 'error');
        });
    }

    function normalizeDatabaseProperties(db) {
      if (!db) return;
      
      // 1. Normalizar ZDEPARA_EVENTOS de forma robusta e agressiva
      if (db.ZDEPARA_EVENTOS && Array.isArray(db.ZDEPARA_EVENTOS)) {
        db.ZDEPARA_EVENTOS.forEach(item => {
          const getVal = (v1, v2) => {
            const s1 = String(v1 !== undefined && v1 !== null ? v1 : "").trim();
            const s2 = String(v2 !== undefined && v2 !== null ? v2 : "").trim();
            return s1 !== "" ? s1 : s2;
          };

          const valEmpresa = getVal(item.EMPRESA_DE, item.empresaDe);
          item.EMPRESA_DE = valEmpresa;
          item.empresaDe = valEmpresa;
          
          const valCodigo = getVal(item.CODIGO_DE, item.codigoDe);
          item.CODIGO_DE = valCodigo;
          item.codigoDe = valCodigo;
          
          const valNomeDe = getVal(item.NOME_DE, item.nomeDe);
          item.NOME_DE = valNomeDe;
          item.nomeDe = valNomeDe;
          
          const valTipo = getVal(item.TIPO_EVENTO, item.tipoEvento);
          item.TIPO_EVENTO = valTipo;
          item.tipoEvento = valTipo;
          
          const valColigada = getVal(item.COLIGADA_PARA, item.coligadaPara);
          item.COLIGADA_PARA = valColigada;
          item.coligadaPara = valColigada;
          
          const valCodigoPara = getVal(item.CODIGO_PARA, item.codigoPara);
          item.CODIGO_PARA = valCodigoPara;
          item.codigoPara = valCodigoPara;
          
          const valFicha1 = getVal(item.CODIGO_PARA_FICHA_MES1, item.codigoParaFichaMes1);
          item.CODIGO_PARA_FICHA_MES1 = valFicha1;
          item.codigoParaFichaMes1 = valFicha1;
          
          const valFicha2 = getVal(item.CODIGO_PARA_FICHA_MES2, item.codigoParaFichaMes2);
          item.CODIGO_PARA_FICHA_MES2 = valFicha2;
          item.codigoParaFichaMes2 = valFicha2;
          
          const valFerias = getVal(item.CODIGO_PARA_VERBAS_FERIAS, item.codigoParaVerbasFerias);
          item.CODIGO_PARA_VERBAS_FERIAS = valFerias;
          item.codigoParaVerbasFerias = valFerias;
          
          const valObs = getVal(item.OBSERVACAO, item.observacao);
          item.OBSERVACAO = valObs;
          item.observacao = valObs;
          
          const valSug = getVal(item.SUGESTOES, item.sugestoes);
          item.SUGESTOES = valSug;
          item.sugestoes = valSug;

          item.nomeRm = getRmName(item.codigoPara);
        });
      }

      // 2. Normalizar outras abas de de-para para garantir chaves limpas
      const genericTabs = [
        'ZDEPARA_COLIGADAS', 'ZDEPARA_FUNCOES', 'ZDEPARA_SINDICATOS', 
        'ZDEPARA_SECOES', 'ZDEPARA_BANCOS', 'ZDEPARA_SITUACAO', 
        'ZDEPARA_HORARIO', 'ZDEPARA_PERIODO_FOLHA', 'ZDEPARA_MOTIVO_FUNCAO', 
        'ZDEPARA_MOTIVO_SALARIO', 'ZDEPARA_MOTIVO_SECAO'
      ];

      genericTabs.forEach(key => {
        const arr = db[key];
        if (arr && Array.isArray(arr)) {
          arr.forEach(item => {
            // Converter todas as chaves existentes do item para string e limpar espaços
            for (let prop in item) {
              if (prop !== 'rowNum' && item[prop] !== undefined && item[prop] !== null) {
                item[prop] = String(item[prop]).trim();
              }
            }

            // Normalizar chaves comuns de De-Para para manter compatibilidade de exibição
            const colPara = String(item.COLIGADA_PARA !== undefined ? item.COLIGADA_PARA : (item.coligadaPara !== undefined ? item.coligadaPara : "1")).trim();
            item.COLIGADA_PARA = colPara;
            item.coligadaPara = colPara;

            const codPara = String(item.CODIGO_PARA !== undefined ? item.CODIGO_PARA : (item.codigoPara !== undefined ? item.codigoPara : "")).trim();
            item.CODIGO_PARA = codPara;
            item.codigoPara = codPara;

            const obs = String(item.OBSERVACAO !== undefined ? item.OBSERVACAO : (item.observacao !== undefined ? item.observacao : "")).trim();
            item.OBSERVACAO = obs;
            item.observacao = obs;
          });
        }
      });

      // 3. Normalizar bases de apoio DADOS_RM_* para manter consistência nas buscas e chaves do portal
      if (db.DADOS_RM_EVENTOS && Array.isArray(db.DADOS_RM_EVENTOS)) {
        db.DADOS_RM_EVENTOS.forEach(item => {
          const cod = String(item.CODIGO !== undefined ? item.CODIGO : (item.codigo !== undefined ? item.codigo : "")).trim();
          item.CODIGO = cod;
          item.codigo = cod;

          const desc = String(item.DESCRICAO !== undefined ? item.DESCRICAO : (item.descricao !== undefined ? item.descricao : "")).trim();
          item.DESCRICAO = desc;
          item.descricao = desc;

          const tipo = String(item.TIPOEVENTO !== undefined ? item.TIPOEVENTO : (item.tipo !== undefined ? item.tipo : "")).trim();
          item.TIPOEVENTO = tipo;
          item.tipo = tipo;

          const valref = String(item.VALHORDIAREF !== undefined ? item.VALHORDIAREF : (item.valhordiaref !== undefined ? item.valhordiaref : "")).trim();
          item.VALHORDIAREF = valref;
          item.valhordiaref = valref;

          const nat = String(item.NAT_ESOCIAL !== undefined ? item.NAT_ESOCIAL : (item.nat_esocial !== undefined ? item.nat_esocial : "")).trim();
          item.NAT_ESOCIAL = nat;
          item.nat_esocial = nat;
        });
        
        // Sincronizar rmEvents global
        rmEvents = db.DADOS_RM_EVENTOS;
      }

      if (db.DADOS_RM_SITUACAO && Array.isArray(db.DADOS_RM_SITUACAO)) {
        db.DADOS_RM_SITUACAO.forEach(item => {
          const cod = String(item.CODCLIENTE !== undefined ? item.CODCLIENTE : (item.codcliente !== undefined ? item.codcliente : "")).trim();
          item.CODCLIENTE = cod;
          item.codcliente = cod;

          const desc = String(item.DESCRICAO !== undefined ? item.DESCRICAO : (item.descricao !== undefined ? item.descricao : "")).trim();
          item.DESCRICAO = desc;
          item.descricao = desc;
        });
      }

      if (db.DADOS_RM_MOTIVOS && Array.isArray(db.DADOS_RM_MOTIVOS)) {
        db.DADOS_RM_MOTIVOS.forEach(item => {
          const cod = String(item.CODCLIENTE !== undefined ? item.CODCLIENTE : (item.codcliente !== undefined ? item.codcliente : "")).trim();
          item.CODCLIENTE = cod;
          item.codcliente = cod;

          const desc = String(item.DESCRICAO !== undefined ? item.DESCRICAO : (item.descricao !== undefined ? item.descricao : "")).trim();
          item.DESCRICAO = desc;
          item.descricao = desc;
        });
      }

      if (db.DADOS_RM_SECOES && Array.isArray(db.DADOS_RM_SECOES)) {
        db.DADOS_RM_SECOES.forEach(item => {
          const col = String(item.COLIGADA !== undefined ? item.COLIGADA : (item.coligada !== undefined ? item.coligada : "")).trim();
          item.COLIGADA = col;
          item.coligada = col;

          const fil = String(item.FILIAL !== undefined ? item.FILIAL : (item.filial !== undefined ? item.filial : "")).trim();
          item.FILIAL = fil;
          item.filial = fil;

          const sec = String(item.CODIGO !== undefined ? item.CODIGO : (item.codigo !== undefined ? item.codigo : "")).trim();
          item.CODIGO = sec;
          item.codigo = sec;

          const desc = String(item.DESCRICAO !== undefined ? item.DESCRICAO : (item.descricao !== undefined ? item.descricao : "")).trim();
          item.DESCRICAO = desc;
          item.descricao = desc;

          const cnpj = String(item.CNPJ !== undefined ? item.CNPJ : (item.cnpj !== undefined ? item.cnpj : "")).trim();
          item.CNPJ = cnpj;
          item.cnpj = cnpj;
        });
      }
      
      // Recalcular os nomes de ZDEPARA_EVENTOS após normalizar as tabelas de apoio
      if (db.ZDEPARA_EVENTOS && Array.isArray(db.ZDEPARA_EVENTOS)) {
        db.ZDEPARA_EVENTOS.forEach(item => {
          item.nomeRm = getRmName(item.codigoPara);
        });
      }

      // 4. Auto-mapeamento Inteligente: ZDEPARA_SITUACAO usando GLOBAL_SITUACAO_KNOWLEDGE_BASE
      if (typeof GLOBAL_SITUACAO_KNOWLEDGE_BASE !== 'undefined' && db.ZDEPARA_SITUACAO && Array.isArray(db.ZDEPARA_SITUACAO)) {
        db.ZDEPARA_SITUACAO.forEach(item => {
          const codOrigem = item.CODIGO_DE;
          if (codOrigem && GLOBAL_SITUACAO_KNOWLEDGE_BASE[codOrigem]) {
             const kb = GLOBAL_SITUACAO_KNOWLEDGE_BASE[codOrigem];
             if (!item.CODSITUACAO_PARA) item.CODSITUACAO_PARA = kb.CODSITUACAO_PARA || "";
             if (!item.CODMOTIVO_PARA) item.CODMOTIVO_PARA = kb.CODMOTIVO_PARA || "";
             if (!item.CODSITUACAO_RETORNO_PARA) item.CODSITUACAO_RETORNO_PARA = kb.CODSITUACAO_RETORNO_PARA || "";
             if (!item.CODMOTIVO_RETORNO_PARA) item.CODMOTIVO_RETORNO_PARA = kb.CODMOTIVO_RETORNO_PARA || "";
          }
        });
      }

      // 5. Seed Inteligente: DADOS_RM_MOTIVOS se vazio
      if (typeof GLOBAL_RM_MOTIVOS_SEED !== 'undefined' && (!db.DADOS_RM_MOTIVOS || !Array.isArray(db.DADOS_RM_MOTIVOS) || db.DADOS_RM_MOTIVOS.length === 0)) {
         db.DADOS_RM_MOTIVOS = JSON.parse(JSON.stringify(GLOBAL_RM_MOTIVOS_SEED));
      }
    }

    function switchModule(moduleName) {
      currentModule = moduleName;
      editingRowNumber = null;
      expandedRowNumbers.clear();
      activeKpiFilter = 'all';
      
      // Atualizar classe ativa na barra lateral
      document.querySelectorAll('.sidebar .menu-item').forEach(el => el.classList.remove('active'));
      
      // Marcar menu ativo
      const activeMenuItem = document.getElementById(`menu-item-${moduleName}`);
      if (activeMenuItem) {
        activeMenuItem.classList.add('active');
      }
      
      // Controlar exibição das views
      if (moduleName === 'home') {
        document.getElementById('titleHeader').innerText = "ZDEPARA - PAINEL GERAL";
        document.getElementById('subtitleHeader').innerText = "Visão geral e progresso de preenchimento dos de-para de migração";
        document.getElementById('homeView').style.display = 'flex';
        document.getElementById('deparaView').style.display = 'none';
        document.getElementById('configView').style.display = 'none';
        
        // Esconde os banners globais na tela inicial
        const banner = document.getElementById("inconsistencyWarningBanner");
        if (banner) banner.style.display = "none";
        
        updateHomeProgress();
      } 
      else if (moduleName === 'config') {
        document.getElementById('titleHeader').innerText = "ZDEPARA - CONFIGURAÇÕES";
        document.getElementById('subtitleHeader').innerText = "Configuração do repositório GitHub e importação/exportação local de planilhas";
        document.getElementById('homeView').style.display = 'none';
        document.getElementById('deparaView').style.display = 'none';
        document.getElementById('configView').style.display = 'flex';
        
        // Esconde os banners globais na tela de configuração
        const banner = document.getElementById("inconsistencyWarningBanner");
        if (banner) banner.style.display = "none";
        
        loadConfigInputs();
      } 
      else {
        document.getElementById('homeView').style.display = 'none';
        document.getElementById('deparaView').style.display = 'flex';
        document.getElementById('configView').style.display = 'none';
        
        // Carrega dados da aba selecionada
        setupModuleDatabase(moduleName);
      }
    }

    function loadConfigInputs() {
      document.getElementById("ghTokenInput").value = localStorage.getItem("gh_pat") || "";
      document.getElementById("ghOwnerInput").value = localStorage.getItem("gh_owner") || "TOTVSGustavoFerreira";
      document.getElementById("ghRepoInput").value = localStorage.getItem("gh_repo") || "portal-depara-navarro";
    }

    function updateHomeProgress() {
      if (!rawJsonDatabase) return;
      
      const modules = [
        { key: 'ZDEPARA_EVENTOS', elId: 'homeProgressEventos' },
        { key: 'ZDEPARA_COLIGADAS', elId: 'homeProgressColigadas' },
        { key: 'ZDEPARA_FUNCOES', elId: 'homeProgressFuncoes' },
        { key: 'ZDEPARA_SINDICATOS', elId: 'homeProgressSindicatos' },
        { key: 'ZDEPARA_SECOES', elId: 'homeProgressSecoes' },
        { key: 'ZDEPARA_SITUACAO', elId: 'homeProgressSituacao' }
      ];
      
      modules.forEach(m => {
        const arr = rawJsonDatabase[m.key] || [];
        const total = arr.length;
        let mapped = 0;
        
        arr.forEach(item => {
          // Diferentes formas de identificar mapeamento para cada aba
          if (m.key === 'ZDEPARA_EVENTOS') {
            if (item.codigoPara && !isCodeIgnored(item.codigoPara) && !isCodeToCreate(item.codigoPara)) mapped++;
          } else if (m.key === 'ZDEPARA_COLIGADAS') {
            if (item.CODCOLIGADA) mapped++;
          } else if (m.key === 'ZDEPARA_SITUACAO') {
            if (item.CODSITUACAO_PARA) mapped++;
          } else {
            if (item.CODIGO_PARA && !isCodeIgnored(item.CODIGO_PARA) && !isCodeToCreate(item.CODIGO_PARA)) mapped++;
          }
        });
        
        const pct = total > 0 ? Math.round((mapped / total) * 100) : 0;
        const el = document.getElementById(m.elId);
        if (el) el.innerText = `${mapped} / ${total} (${pct}%)`;
      });
    }

    function setupModuleDatabase(moduleName) {
      if (!rawJsonDatabase) return;
      
      // Títulos e cabeçalhos dinâmicos
      const titleHeader = document.getElementById("titleHeader");
      const subtitleHeader = document.getElementById("subtitleHeader");
      const tableTitleText = document.getElementById("tableTitleText");
      const mainTableHead = document.getElementById("mainTableHead");
      const filterTypeDropdown = document.getElementById("filterTypeDropdown");
      const kpiLabelTotal = document.getElementById("kpiLabelTotal");
      
      let headerHtml = "";
      let filterOptionsHtml = "";
      
      if (moduleName === 'eventos') {
        titleHeader.innerText = "ZDEPARA_EVENTOS";
        subtitleHeader.innerText = "Mapeamento de eventos legados com validação sequencial e relatórios de auditoria";
        tableTitleText.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg> Tabela De-Para Eventos`;
        kpiLabelTotal.innerText = "Total Eventos";
        
        database = rawJsonDatabase.ZDEPARA_EVENTOS || [];
        
        headerHtml = `
          <tr>
            <th class="sortable col-empresa-orig" onclick="toggleSort('empresaDe')">Emp. Origem<span class="sort-indicator" id="sort-empresaDe"></span></th>
            <th class="sortable col-codigo-orig" onclick="toggleSort('codigoDe')">Cód. Origem<span class="sort-indicator" id="sort-codigoDe"></span></th>
            <th class="sortable col-nome-orig" onclick="toggleSort('nomeDe')">Nome Origem<span class="sort-indicator" id="sort-nomeDe"></span></th>
            <th class="sortable col-tipo-orig" onclick="toggleSort('tipoEvento')">Tipo Evento<span class="sort-indicator" id="sort-tipoEvento"></span></th>
            <th class="sortable col-coligada-rm" onclick="toggleSort('coligadaPara')">Colig. RM<span class="sort-indicator" id="sort-coligadaPara"></span></th>
            <th class="sortable col-codigo-rm" onclick="toggleSort('codigoPara')">Cód. RM<span class="sort-indicator" id="sort-codigoPara"></span></th>
            <th class="sortable col-nome-rm" onclick="toggleSort('nomeRm')">Nome RM / Tipo<span class="sort-indicator" id="sort-nomeRm"></span></th>
            <th class="col-acoes">Ações</th>
          </tr>
        `;
        
        filterOptionsHtml = `
          <option value="global">Busca Geral</option>
          <option value="empresaDe">Empresa Origem</option>
          <option value="tipoEvento">Tipo Evento</option>
          <option value="status">Status Mapeamento</option>
          <option value="coligadaPara">Coligada RM</option>
          <option value="codigoPara">Código RM</option>
          <option value="nomeRm">Nome RM</option>
          <option value="temObservacao">Com Observação?</option>
        `;
      } 
      else if (moduleName === 'coligadas') {
        titleHeader.innerText = "ZDEPARA_COLIGADAS";
        subtitleHeader.innerText = "Mapeamento das Coligadas / Empresas do cliente para o RM";
        tableTitleText.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg> Tabela De-Para Coligadas`;
        kpiLabelTotal.innerText = "Total Coligadas";
        
        database = rawJsonDatabase.ZDEPARA_COLIGADAS || [];
        
        headerHtml = `
          <tr>
            <th class="sortable" onclick="toggleSort('EMPRESA_DE')">Empresa Origem<span class="sort-indicator" id="sort-EMPRESA_DE"></span></th>
            <th class="sortable" onclick="toggleSort('ID')">ID<span class="sort-indicator" id="sort-ID"></span></th>
            <th class="sortable" onclick="toggleSort('NOME_DE')">Nome Origem<span class="sort-indicator" id="sort-NOME_DE"></span></th>
            <th class="sortable" onclick="toggleSort('CNPJ')">CNPJ / CPF<span class="sort-indicator" id="sort-CNPJ"></span></th>
            <th class="sortable" onclick="toggleSort('CODCOLIGADA')">Coligada RM<span class="sort-indicator" id="sort-CODCOLIGADA"></span></th>
            <th class="sortable" onclick="toggleSort('CODFILIAL_PARA')">Filial RM<span class="sort-indicator" id="sort-CODFILIAL_PARA"></span></th>
            <th class="col-acoes">Ações</th>
          </tr>
        `;
        
        filterOptionsHtml = `
          <option value="global">Busca Geral</option>
          <option value="nome">Nome Origem</option>
          <option value="cnpj">CNPJ</option>
          <option value="codColigada">Código RM</option>
        `;
      } 
      else if (moduleName === 'funcoes') {
        titleHeader.innerText = "ZDEPARA_FUNCOES";
        subtitleHeader.innerText = "Mapeamento das Funções / Cargos legados para o RM";
        tableTitleText.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg> Tabela De-Para Funções`;
        kpiLabelTotal.innerText = "Total Funções";
        
        database = rawJsonDatabase.ZDEPARA_FUNCOES || [];
        
        headerHtml = `
          <tr>
            <th class="sortable col-funcao-emp" onclick="toggleSort('EMPRESA_DE')">Empresa Origem<span class="sort-indicator" id="sort-EMPRESA_DE"></span></th>
            <th class="sortable col-funcao-cod" onclick="toggleSort('CODIGO_DE')">Cód. Origem<span class="sort-indicator" id="sort-CODIGO_DE"></span></th>
            <th class="sortable col-funcao-nome" onclick="toggleSort('NOME_DE')">Nome Função Origem<span class="sort-indicator" id="sort-NOME_DE"></span></th>
            <th class="sortable col-funcao-cbo" onclick="toggleSort('CBO')">CBO<span class="sort-indicator" id="sort-CBO"></span></th>
            <th class="sortable col-funcao-coligada" onclick="toggleSort('COLIGADA_PARA')">Coligada RM<span class="sort-indicator" id="sort-COLIGADA_PARA"></span></th>
            <th class="sortable col-funcao-codpara" onclick="toggleSort('CODIGO_PARA')">CÓDIGO PARA<span class="sort-indicator" id="sort-CODIGO_PARA"></span></th>
            <th class="col-funcao-acoes">Ações</th>
          </tr>
        `;
        
        filterOptionsHtml = `
          <option value="global">Busca Geral</option>
          <option value="nomeDe">Nome Função</option>
          <option value="cbo">CBO</option>
          <option value="codigoPara">Código Para</option>
          <option value="observacao">Observação</option>
        `;
      } 
      else if (moduleName === 'sindicatos') {
        titleHeader.innerText = "ZDEPARA_SINDICATOS";
        subtitleHeader.innerText = "Mapeamento dos Sindicatos legados para o RM";
        tableTitleText.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg> Tabela De-Para Sindicatos`;
        kpiLabelTotal.innerText = "Total Sindicatos";
        
        database = rawJsonDatabase.ZDEPARA_SINDICATOS || [];
        
        headerHtml = `
          <tr>
            <th class="sortable" onclick="toggleSort('EMPRESA_DE')">Empresa Origem<span class="sort-indicator" id="sort-EMPRESA_DE"></span></th>
            <th class="sortable" onclick="toggleSort('CODIGO_DE')">Cód. Origem<span class="sort-indicator" id="sort-CODIGO_DE"></span></th>
            <th class="sortable" onclick="toggleSort('NOME_DE')">Nome Sindicato<span class="sort-indicator" id="sort-NOME_DE"></span></th>
            <th class="sortable" onclick="toggleSort('CNPJ')">CNPJ<span class="sort-indicator" id="sort-CNPJ"></span></th>
            <th class="sortable" onclick="toggleSort('COLIGADA_PARA')">Coligada RM<span class="sort-indicator" id="sort-COLIGADA_PARA"></span></th>
            <th class="sortable" onclick="toggleSort('CODIGO_PARA')">Sindicato RM<span class="sort-indicator" id="sort-CODIGO_PARA"></span></th>
            <th class="col-acoes">Ações</th>
          </tr>
        `;
        
        filterOptionsHtml = `
          <option value="global">Busca Geral</option>
          <option value="nomeDe">Nome Sindicato</option>
          <option value="cnpj">CNPJ</option>
          <option value="codigoPara">Código RM</option>
        `;
      } 
      else if (moduleName === 'secoes') {
        titleHeader.innerText = "ZDEPARA_SECOES";
        subtitleHeader.innerText = "Mapeamento da estrutura de Seções e Departamentos legados para o RM";
        tableTitleText.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg> Tabela De-Para Seções`;
        kpiLabelTotal.innerText = "Total Seções";
        
        database = rawJsonDatabase.ZDEPARA_SECOES || [];
        
        headerHtml = `
          <tr>
            <th class="sortable" onclick="toggleSort('CODIGO_DE')">Seção Origem (Legado)<span class="sort-indicator" id="sort-CODIGO_DE"></span></th>
            <th class="sortable" onclick="toggleSort('CODIGO_PARA')">Seção Destino (RM)<span class="sort-indicator" id="sort-CODIGO_PARA"></span></th>
            <th class="col-acoes">Ações</th>
          </tr>
        `;
        
        filterOptionsHtml = `
          <option value="global">Busca Geral</option>
          <option value="nomeDe">Nome Seção</option>
          <option value="codigoPara">Código RM</option>
        `;
      } 
      else if (moduleName === 'situacao') {
        titleHeader.innerText = "ZDEPARA_SITUACAO";
        subtitleHeader.innerText = "Mapeamento das Situações Cadastrais legadas para o RM";
        tableTitleText.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg> Tabela De-Para Situação`;
        kpiLabelTotal.innerText = "Total Situações";
        
        database = rawJsonDatabase.ZDEPARA_SITUACAO || [];
        
        headerHtml = `
          <tr>
            <th class="sortable" style="width: 10%;" onclick="toggleSort('CODIGO_DE')">Código Origem<span class="sort-indicator" id="sort-CODIGO_DE"></span></th>
            <th class="sortable" style="width: 25%;" onclick="toggleSort('NOME_DE')">Situação Origem<span class="sort-indicator" id="sort-NOME_DE"></span></th>
            <th class="sortable" onclick="toggleSort('CODSITUACAO_PARA')">Situação RM<span class="sort-indicator" id="sort-CODSITUACAO_PARA"></span></th>
            <th class="sortable" onclick="toggleSort('CODMOTIVO_PARA')">Motivo RM<span class="sort-indicator" id="sort-CODMOTIVO_PARA"></span></th>
            <th class="sortable" onclick="toggleSort('CODSITUACAO_RETORNO_PARA')">Sit. Retorno RM<span class="sort-indicator" id="sort-CODSITUACAO_RETORNO_PARA"></span></th>
            <th class="sortable" onclick="toggleSort('CODMOTIVO_RETORNO_PARA')">Motivo Retorno RM<span class="sort-indicator" id="sort-CODMOTIVO_RETORNO_PARA"></span></th>
            <th class="col-acoes">Ações</th>
          </tr>
        `;
        
        filterOptionsHtml = `
          <option value="global">Busca Geral</option>
          <option value="nomeDe">Situação Origem</option>
        `;
      }
      
      mainTableHead.innerHTML = headerHtml;
      filterTypeDropdown.innerHTML = filterOptionsHtml;
      
      calculateLocalDiagnosticsAndStats();
      renderWarnings();
      updateDashboard();
      applyFilters();
    }

    function calculateLocalDiagnosticsAndStats() {
      // 1. Diagnósticos padrão (Duplicados gerais)
      const seen = new Set();
      const dupes = [];
      database.forEach(item => {
        let key = "";
        let codeLabel = "";
        if (currentModule === 'eventos') {
          if (!item.empresaDe || !item.codigoDe) return;
          key = `${item.empresaDe}-${item.codigoDe}-${item.tipoEvento}`;
          codeLabel = item.codigoDe;
        } else if (currentModule === 'coligadas') {
          if (!item.EMP_CODIGO) return;
          key = `${item.EMP_CODIGO}`;
          codeLabel = item.EMP_CODIGO;
        } else if (currentModule === 'situacao') {
          if (!item.CODIGO_DE) return;
          key = `${item.CODIGO_DE}`;
          codeLabel = item.CODIGO_DE;
        } else {
          const emp = item.EMPRESA_DE || item['EMPRESA _DE'];
          const cod = item.CODIGO_DE;
          if (!emp || !cod) return;
          key = `${emp}-${cod}`;
          codeLabel = cod;
        }
        if (seen.has(key)) {
          dupes.push(codeLabel);
        } else {
          seen.add(key);
        }
      });
      
      diagnostics = {
        duplicates: [...new Set(dupes)],
        gaps: [],
        orphans: []
      };

      // Lacunas e itens não usados apenas para Eventos (módulo original)
      if (currentModule === 'eventos') {
        const manualCreatedCodes = rmEvents
          .filter(ev => ev.descricao.includes("[INCLUSAO MANUAL]"))
          .map(ev => parseInt(ev.codigo, 10))
          .filter(n => !isNaN(n))
          .sort((a, b) => a - b);
        
        const gaps = [];
        if (manualCreatedCodes.length > 0) {
          const min = manualCreatedCodes[0];
          const max = manualCreatedCodes[manualCreatedCodes.length - 1];
          const manualSet = new Set(manualCreatedCodes);
          for (let i = min; i <= max; i++) {
            if (!manualSet.has(i)) {
              gaps.push(String(i).padStart(4, '0'));
            }
          }
        }
        diagnostics.gaps = gaps.slice(0, 15);

        // Calcular eventos manuais não vinculados
        const usedCodesInDatabase = new Set();
        database.forEach(item => {
          if (item.codigoPara) usedCodesInDatabase.add(String(item.codigoPara).trim());
          if (item.codigoParaFichaMes1) usedCodesInDatabase.add(String(item.codigoParaFichaMes1).trim());
          if (item.codigoParaFichaMes2) usedCodesInDatabase.add(String(item.codigoParaFichaMes2).trim());
          if (item.codigoParaVerbasFerias) usedCodesInDatabase.add(String(item.codigoParaVerbasFerias).trim());
        });

        unusedCreatedEvents = rmEvents.filter(ev => {
          const isManual = ev.descricao.includes("[INCLUSAO MANUAL]") || ev.descricao.includes("INCLUSAO MANUAL");
          const isUsed = usedCodesInDatabase.has(String(ev.codigo).trim());
          return isManual && !isUsed;
        });
      } else {
        unusedCreatedEvents = [];
      }

      if (currentModule === 'secoes') {
        const usedSecoesKeys = new Set();
        (rawJsonDatabase.ZDEPARA_SECOES || []).forEach(item => {
          if (item.CODIGO_PARA) {
            const key = `${item.COLIGADA_PARA || '1'}_${item.FILIAL_PARA || '1'}_${String(item.CODIGO_PARA).trim()}`;
            usedSecoesKeys.add(key);
          }
        });

        const allSecoes = rawJsonDatabase.DADOS_RM_SECOES || [];
        unusedCreatedSecoes = allSecoes.filter(s => {
          const desc = s.DESCRICAO || s.descricao || "";
          const isManual = desc.includes("[INCLUSAO MANUAL]") || desc.includes("INCLUSAO MANUAL");
          const key = `${s.COLIGADA || '1'}_${s.FILIAL || '1'}_${String(s.CODIGO).trim()}`;
          return isManual && !usedSecoesKeys.has(key);
        });
      } else {
        unusedCreatedSecoes = [];
      }

      // 2. Estatísticas do Módulo Corrente
      const total = database.length;
      let preenchidos = 0;
      let naoPreenchidos = 0;
      let pAnalise = 0;
      let divergencias = 0;

      // Mapas de divergência
      const nameToDestCodes = {}; // Para duplicidades de destino por nome de origem
      const cnpjToColigadaDest = {}; // Raiz CNPJ -> CODCOLIGADA

      if (currentModule === 'coligadas') {
        database.forEach(item => {
          const cnpjLimpo = String(item.CNPJ || "").replace(/\D/g, "").slice(0, 8); // Raiz de 8 dígitos
          const coligadaDest = String(item.CODCOLIGADA || "").trim();
          if (cnpjLimpo && coligadaDest) {
            if (!cnpjToColigadaDest[cnpjLimpo]) cnpjToColigadaDest[cnpjLimpo] = new Set();
            cnpjToColigadaDest[cnpjLimpo].add(coligadaDest);
          }
        });
      } else {
        database.forEach(item => {
          const destCode = String((currentModule === 'situacao' ? item.CODSITUACAO_PARA : item.CODIGO_PARA) || "").trim();
          const origName = String(item.NOME_DE || item.NOME || item.nomeDe || "").toLowerCase().trim();
          if (destCode && !isCodeIgnored(destCode) && !isCodeToCreate(destCode) && origName) {
            if (!nameToDestCodes[origName]) nameToDestCodes[origName] = new Set();
            nameToDestCodes[origName].add(destCode);
          }
        });
      }

      database.forEach(item => {
        item.hasDivergencia = false;
        item.hasDivergenciaDuplicidade = false;
        item.hasDivergenciaTipo = false;

        if (currentModule === 'coligadas') {
          const codColigada = String(item.CODCOLIGADA || "").trim();
          if (codColigada) {
            preenchidos++;
            // Validar divergência de CNPJ (mesma raiz para coligadas diferentes)
            const cnpjLimpo = String(item.CNPJ || "").replace(/\D/g, "").slice(0, 8);
            if (cnpjLimpo && cnpjToColigadaDest[cnpjLimpo] && cnpjToColigadaDest[cnpjLimpo].size > 1) {
              item.hasDivergencia = true;
              item.hasDivergenciaDuplicidade = true;
              divergencias++;
            }
          } else {
            naoPreenchidos++;
          }
        } 
        else if (currentModule === 'situacao') {
          const codSituacao = String(item.CODSITUACAO_PARA || "").trim();
          if (codSituacao) {
            preenchidos++;
          } else {
            naoPreenchidos++;
          }
          // Situação não possui divergências por padrão
        } 
        else if (currentModule === 'secoes') {
          const codSecao = String(item.CODIGO_PARA || "").trim();
          if (isCodePending(codSecao)) {
            pAnalise++;
          } else if (codSecao) {
            preenchidos++;
          } else {
            naoPreenchidos++;
          }
          // Seções não possui KPIs de divergência por padrão
        } 
        else {
          // Eventos, Funções, Sindicatos
          const codPara = String((currentModule === 'eventos' ? item.codigoPara : item.CODIGO_PARA) || "").trim();
          
          if (isCodePending(codPara)) {
            pAnalise++;
          } else if (codPara && !isCodeIgnored(codPara) && !isCodeToCreate(codPara)) {
            preenchidos++;
          } else {
            if (!codPara || isCodeToCreate(codPara)) naoPreenchidos++;
          }

          // Validações de divergência
          if (codPara && !isCodeIgnored(codPara) && !isCodeToCreate(codPara)) {
            // Divergência de Tipo (Apenas em Eventos)
            if (currentModule === 'eventos') {
              const compatibility = checkTypeCompatibility(item.tipoEvento, codPara);
              if (!compatibility.isMatch) {
                item.hasDivergenciaTipo = true;
                item.hasDivergencia = true;
              }
            }

            // Divergência de Mapeamentos Duplos por Nome
            const origName = String(item.NOME_DE || item.NOME || item.nomeDe || "").toLowerCase().trim();
            if (origName && nameToDestCodes[origName] && nameToDestCodes[origName].size > 1) {
              item.hasDivergenciaDuplicidade = true;
              item.hasDivergencia = true;
            }
          }

          if (item.hasDivergencia) {
            divergencias++;
          }
        }
      });

      stats = {
        total: total,
        preenchidos: preenchidos,
        naoPreenchidos: naoPreenchidos,
        pAnalise: pAnalise,
        divergencias: divergencias
      };
    }

    function showLoading(text) {
      document.getElementById("loadingText").innerText = text;
      document.getElementById("loadingOverlay").style.display = "flex";
    }

    function hideLoading() {
      document.getElementById("loadingOverlay").style.display = "none";
    }

    function runAutoInstall() {
      showLoading("Instalando tabelas e colunas...");
      apiGet("autoInstallStructure")
        .then(function(response) {
          hideLoading();
          if (response.success) {
            showToast(response.message, 'success');
            loadPortalData();
          } else {
            showToast(response.error, 'error');
          }
        })
        .catch(function(err) {
          hideLoading();
          showToast("Erro na instalação: " + err.message, 'error');
        });
    }

    function updateFooter() {
      // O rodapé agora exibe um resumo dinâmico dos dados em vez das informações da planilha.
      // Os campos são preenchidos pelo updateDashboard após calcular os stats.
      const syncDate = rawJsonDatabase?.config?.ultimo_sincronismo;
      const syncEl = document.getElementById('footerLastSync');
      if (syncEl && syncDate) {
        const d = new Date(syncDate);
        syncEl.innerText = d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      }
    }

    function renderWarnings() {
      const banner = document.getElementById("inconsistencyWarningBanner");
      const optBanner = document.getElementById("sequenceOptimizationBanner");
      
      const hasDuplicates = (diagnostics.duplicates && diagnostics.duplicates.length > 0);
      const hasOrphans = (currentModule === 'eventos' && diagnostics.orphans && diagnostics.orphans.length > 0);
      const hasUnused = (currentModule === 'eventos' && unusedCreatedEvents && unusedCreatedEvents.length > 0) || (currentModule === 'secoes' && unusedCreatedSecoes && unusedCreatedSecoes.length > 0);
      const hasGaps = (currentModule === 'eventos' && diagnostics.gaps && diagnostics.gaps.length > 0);
      
      if (hasDuplicates || hasOrphans || hasUnused || hasGaps) {
        banner.style.display = "flex";
      } else {
        banner.style.display = "none";
      }

      // Exibe banner de otimização se estiver em funcoes e se houver lacunas numéricas nas funções
      let hasFuncoesGaps = false;
      if (currentModule === 'funcoes') {
        const list = rawJsonDatabase.ZDEPARA_FUNCOES || [];
        const mappedCodes = list
          .map(item => parseInt(item.CODIGO_PARA || "", 10))
          .filter(n => !isNaN(n))
          .sort((a, b) => a - b);
        
        if (mappedCodes.length > 0) {
          const min = mappedCodes[0];
          const max = mappedCodes[mappedCodes.length - 1];
          const mappedSet = new Set(mappedCodes);
          for (let i = min; i <= max; i++) {
            if (!mappedSet.has(i)) {
              hasFuncoesGaps = true;
              break;
            }
          }
        }
      }

      if (currentModule === 'funcoes' && hasFuncoesGaps) {
        if (optBanner) optBanner.style.display = "flex";
      } else {
        if (optBanner) optBanner.style.display = "none";
      }
    }

    function showInconsistenciesPanel() {
      const modal = document.getElementById("diagnosticsModal");
      const title = document.getElementById("diagnosticsModalTitle");
      const content = document.getElementById("diagnosticsContentList");
      
      title.innerText = "Painel de Inconsistências e Alertas";
      
      let html = "";
      
      // 1. DUPLICIDADES (CÓDIGO DUPLICADO)
      if (diagnostics.duplicates && diagnostics.duplicates.length > 0) {
        html += `
          <div style="border: 1px solid #fee2e2; background: #fff5f5; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
            <h4 style="color:#b91c1c; margin:0 0 6px 0; font-size:0.9rem; display:flex; align-items:center; gap:6px;">
              <span style="background:#ef4444; color:#fff; width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; font-size:0.75rem; font-weight:700;">!</span>
              Códigos Duplicados na ${currentModule === 'eventos' ? 'DADOS_RM_EVENTOS' : 'BASE DE DADOS'} (${diagnostics.duplicates.length})
            </h4>
            <p style="font-size:0.8rem; margin:0 0 8px 0; color:#7f1d1d;">Estes códigos de evento foram cadastrados mais de uma vez na aba de referência oficial do RM. Remova as linhas duplicadas na planilha:</p>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${diagnostics.duplicates.map(d => `<span class="badge" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-family:monospace; padding:2px 8px; border-radius:4px; font-size:0.75rem;">${d}</span>`).join('')}
            </div>
          </div>
        `;
      }
      
      // 2. MAPEAMENTOS ÓRFÃOS (VÍNCULOS APONTANDO PARA RM INEXISTENTE)
      if (diagnostics.orphans && diagnostics.orphans.length > 0) {
        html += `
          <div style="border: 1px solid #fef3c7; background: #fffbeb; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
            <h4 style="color:#d97706; margin:0 0 6px 0; font-size:0.9rem; display:flex; align-items:center; gap:6px;">
              <span style="background:#f59e0b; color:#fff; width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; font-size:0.75rem; font-weight:700;">?</span>
              Mapeamentos Órfãos em ZDEPARA_EVENTOS (${diagnostics.orphans.length})
            </h4>
            <p style="font-size:0.8rem; margin:0 0 8px 0; color:#92400e;">Eventos legados associados a um código RM que <strong>não existe</strong> na base de apoio. Ajuste o vínculo ou cadastre o evento correspondente:</p>
            <div style="display:flex; flex-direction:column; gap:6px; max-height: 180px; overflow-y: auto; padding-right: 4px;">
              ${diagnostics.orphans.map(o => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:#fff; border:1px solid #fde68a; border-radius:6px; font-size:0.78rem;">
                  <span>Linha ${o.rowNum}: <strong>${o.codigoDe} - ${o.nomeDe}</strong></span>
                  <span style="background:#fffbeb; color:#d97706; font-family:monospace; padding:2px 6px; border-radius:4px; font-weight:700; border:1px solid #fde68a;">RM Inexistente: ${o.codigoPara}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
      
      // 3. EVENTOS MANUAIS NÃO UTILIZADOS
      if (unusedCreatedEvents && unusedCreatedEvents.length > 0) {
        html += `
          <div style="border: 1px solid #fce7f3; background: #fdf2f8; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
            <h4 style="color:#c026d3; margin:0 0 6px 0; font-size:0.9rem; display:flex; align-items:center; gap:6px;">
              <span style="background:#d946ef; color:#fff; width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; font-size:0.75rem; font-weight:700;">*</span>
              Eventos Manuais Criados Não Utilizados (${unusedCreatedEvents.length})
            </h4>
            <p style="font-size:0.8rem; margin:0 0 8px 0; color:#701a75;">Novos códigos criados manualmente via portal que ainda não possuem nenhum vínculo. Se desistiu deles, você pode excluí-los:</p>
            <div style="display:flex; flex-direction:column; gap:6px; max-height: 180px; overflow-y: auto; padding-right: 4px;">
              ${unusedCreatedEvents.map(ev => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:#fff; border:1px solid #fbcfe8; border-radius:6px; font-size:0.78rem;">
                  <span>Código <strong>${ev.codigo}</strong> - ${ev.descricao} (${ev.tipo})</span>
                  <button class="row-btn" style="padding:2px 8px; font-size:0.7rem; background:#fee2e2; border-color:#fca5a5; color:#b91c1c; border-radius:4px;" onclick="deleteManualEvent('${ev.codigo}')">Excluir</button>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      // 3.1 SEÇÕES MANUAIS NÃO UTILIZADAS
      if (unusedCreatedSecoes && unusedCreatedSecoes.length > 0) {
        html += `
          <div style="border: 1px solid #fce7f3; background: #fdf2f8; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
            <h4 style="color:#c026d3; margin:0 0 6px 0; font-size:0.9rem; display:flex; align-items:center; gap:6px;">
              <span style="background:#d946ef; color:#fff; width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; font-size:0.75rem; font-weight:700;">*</span>
              Seções Manuais Criadas Não Utilizadas (${unusedCreatedSecoes.length})
            </h4>
            <p style="font-size:0.8rem; margin:0 0 8px 0; color:#701a75;">Novas seções criadas manualmente via portal que ainda não possuem nenhum vínculo no De-Para. Se desistiu delas, você pode excluí-los:</p>
            <div style="display:flex; flex-direction:column; gap:6px; max-height: 180px; overflow-y: auto; padding-right: 4px;">
              ${unusedCreatedSecoes.map(sec => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:#fff; border:1px solid #fbcfe8; border-radius:6px; font-size:0.78rem;">
                  <span>[Col: <strong>${sec.COLIGADA}</strong> | Fil: <strong>${sec.FILIAL}</strong>] Código <strong>${sec.CODIGO}</strong> - ${sec.DESCRICAO}</span>
                  <button class="row-btn" style="padding:2px 8px; font-size:0.7rem; background:#fee2e2; border-color:#fca5a5; color:#b91c1c; border-radius:4px;" onclick="deleteManualSecao('${sec.COLIGADA}', '${sec.FILIAL}', '${sec.CODIGO}')">Excluir</button>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
      
      // 4. GAPS
      if (diagnostics.gaps && diagnostics.gaps.length > 0) {
        html += `
          <div style="border: 1px solid #e2e8f0; background: #f8fafc; padding: 12px; border-radius: 8px;">
            <h4 style="color:#475569; margin:0 0 6px 0; font-size:0.9rem; display:flex; align-items:center; gap:6px;">
              <span style="background:#64748b; color:#fff; width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; font-size:0.75rem; font-weight:700;">#</span>
              Lacunas na Numeração Manual (Gaps) (${diagnostics.gaps.length})
            </h4>
            <p style="font-size:0.8rem; margin:0 0 8px 0; color:#334155;">Numerações manuais que foram puladas/liberadas. Recomendamos usar estes códigos ao cadastrar novos eventos:</p>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${diagnostics.gaps.map(g => `<span class="badge" style="background:#e2e8f0; color:#475569; border:1px solid #cbd5e1; font-family:monospace; padding:2px 6px; border-radius:4px; font-size:0.75rem;">${g}</span>`).join('')}
            </div>
          </div>
        `;
      }
      
      if (currentModule === 'secoes') {
        html += `
          <div style="border: 1px solid #e0e7ff; background: #eef2ff; padding: 12px; border-radius: 8px; margin-top: 12px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h4 style="color:#3730a3; margin:0 0 4px 0; font-size:0.88rem;">Otimização Sequencial de Seções Manuais</h4>
              <p style="font-size:0.78rem; margin:0; color:#4338ca;">Elimine lacunas na numeração (ex: ajustar 001.01.04 para 001.01.03) e atualize os vínculos no De-Para.</p>
            </div>
            <button class="row-btn row-btn-primary" style="font-size:0.78rem; white-space:nowrap; margin-left:12px;" onclick="triggerReorganizeSecoesManuais()">⚡ Reorganizar Sequência</button>
          </div>
        `;
      }
      
      if (!html) {
        content.innerHTML = `<p style="text-align:center; padding:20px; color:var(--color-text-muted);">Nenhuma inconsistência ou alerta de integridade identificado na base de dados.</p>`;
      } else {
        content.innerHTML = html;
      }
      
      modal.style.display = "flex";
    }

    function showCustomConfirm(title, message, onConfirm) {
      document.getElementById("confirmTitle").innerText = title;
      document.getElementById("confirmMessage").innerText = message;
      
      const modal = document.getElementById("customConfirmModal");
      const okBtn = document.getElementById("confirmOkBtn");
      const cancelBtn = document.getElementById("confirmCancelBtn");
      
      modal.style.display = "flex";
      
      okBtn.onclick = function() {
        modal.style.display = "none";
        onConfirm();
      };
      
      cancelBtn.onclick = function() {
        modal.style.display = "none";
      };
    }



    function toggleProgressDetails() {
      const container = document.getElementById("progressDetailsContainer");
      const chevron = document.getElementById("detailsChevron");
      if (container.style.display === "none") {
        container.style.display = "block";
        chevron.style.transform = "rotate(180deg)";
      } else {
        container.style.display = "none";
        chevron.style.transform = "rotate(0deg)";
      }
    }

    function addProgressLog(message) {
      const logDiv = document.getElementById("progressLog");
      const item = document.createElement("div");
      item.style.marginBottom = "4px";
      item.style.borderBottom = "1px dashed #e2e8f0";
      item.style.paddingBottom = "4px";
      
      const timeStr = new Date().toLocaleTimeString();
      item.innerText = `[${timeStr}] ${message}`;
      logDiv.appendChild(item);
      
      // Auto-scroll
      const container = document.getElementById("progressDetailsContainer");
      container.scrollTop = container.scrollHeight;
    }

    function clearProgressLog() {
      document.getElementById("progressLog").innerHTML = "";
    }

    function showProgressModal(title) {
      document.getElementById("progressTitle").innerText = title;
      document.getElementById("progressBarFill").style.width = "0%";
      document.getElementById("progressPercentage").innerText = "0%";
      document.getElementById("progressLabel").innerText = "Iniciando...";
      clearProgressLog();
      document.getElementById("progressModal").style.display = "flex";
    }

    function updateProgressModal(current, total, sheetName) {
      const pct = Math.round((current / total) * 100);
      document.getElementById("progressBarFill").style.width = pct + "%";
      document.getElementById("progressPercentage").innerText = pct + "%";
      document.getElementById("progressLabel").innerText = `Processando: ${sheetName} (${current} de ${total})`;
    }

    function closeProgressModal() {
      document.getElementById("progressModal").style.display = "none";
    }

    function triggerImport() {
      // Rotina de importação via API do Google desativada em favor da importação direta de arquivos Excel no painel.
      showToast("Use o botão 'Importar Planilha' na aba Configuração / Excel para enviar seus arquivos locais.", "info");
    }

    function triggerExport() {
      if (!rawJsonDatabase) {
        showToast("Carregando base de dados...", "error");
        return;
      }
      
      showCustomConfirm(
        "Exportar Planilha Oficial",
        "Deseja exportar e baixar a base de dados atualizada contendo todas as 15 abas no formato Excel (.xlsx)?",
        function() {
          showLoading("Gerando arquivo Excel...");
          
          try {
            const wb = XLSX.utils.book_new();
            
            // Definição estrita das 15 abas e seus cabeçalhos oficiais
            const abasMap = [
              {
                key: 'ZDEPARA_EVENTOS',
                name: 'ZDEPARA_EVENTOS',
                headers: ["EMPRESA_DE", "CODIGO_DE", "NOME_DE", "TIPO_EVENTO", "COLIGADA_PARA", "CODIGO_PARA", "NOME_RM", "CODIGO_PARA_FICHA_MES1", "NOME_RM", "CODIGO_PARA_FICHA_MES2", "NOME_RM", "CODIGO_PARA_VERBAS_FERIAS", "NOME_RM"],
                mapper: item => {
                  const codPara = String(item.CODIGO_PARA !== undefined ? item.CODIGO_PARA : (item.codigoPara !== undefined ? item.codigoPara : "")).trim();
                  const codFicha1 = String(item.CODIGO_PARA_FICHA_MES1 !== undefined ? item.CODIGO_PARA_FICHA_MES1 : (item.codigoParaFichaMes1 !== undefined ? item.codigoParaFichaMes1 : "")).trim();
                  const codFicha2 = String(item.CODIGO_PARA_FICHA_MES2 !== undefined ? item.CODIGO_PARA_FICHA_MES2 : (item.codigoParaFichaMes2 !== undefined ? item.codigoParaFichaMes2 : "")).trim();
                  const codFerias = String(item.CODIGO_PARA_VERBAS_FERIAS !== undefined ? item.CODIGO_PARA_VERBAS_FERIAS : (item.codigoParaVerbasFerias !== undefined ? item.codigoParaVerbasFerias : "")).trim();

                  return [
                    String(item.EMPRESA_DE !== undefined ? item.EMPRESA_DE : (item.empresaDe !== undefined ? item.empresaDe : "")).trim(),
                    String(item.CODIGO_DE !== undefined ? item.CODIGO_DE : (item.codigoDe !== undefined ? item.codigoDe : "")).trim(),
                    String(item.NOME_DE !== undefined ? item.NOME_DE : (item.nomeDe !== undefined ? item.nomeDe : "")).trim(),
                    String(item.TIPO_EVENTO !== undefined ? item.TIPO_EVENTO : (item.tipoEvento !== undefined ? item.tipoEvento : "")).trim(),
                    String(item.COLIGADA_PARA !== undefined ? item.COLIGADA_PARA : (item.coligadaPara !== undefined ? item.coligadaPara : "")).trim(),
                    codPara,
                    getRmName(codPara),
                    codFicha1,
                    getRmName(codFicha1),
                    codFicha2,
                    getRmName(codFicha2),
                    codFerias,
                    getRmName(codFerias)
                  ];
                }
              },
              {
                key: 'ZDEPARA_COLIGADAS',
                name: 'ZDEPARA_COLIGADAS',
                headers: ["EMPRESA_DE", "ID", "NOME_DE", "CNPJ", "CODCOLIGADA", "CODFILIAL_PARA"],
                mapper: item => [
                  item.EMPRESA_DE || item.EMP_CODIGO || "",
                  item.ID || "",
                  item.NOME_DE || item.NOME || "",
                  item.CNPJ || "",
                  item.CODCOLIGADA || "",
                  item.CODFILIAL_PARA || ""
                ]
              },
              {
                key: 'ZDEPARA_FUNCOES',
                name: 'ZDEPARA_FUNCOES',
                headers: ["EMPRESA_DE", "CODIGO_DE", "NOME_DE", "CBO", "CBO_2002", "COLIGADA_PARA", "CODIGO_PARA"],
                mapper: item => [
                  item.EMPRESA_DE || "",
                  item.CODIGO_DE || "",
                  item.NOME_DE || "",
                  item.CBO || "",
                  item.CBO_2002 || "",
                  item.COLIGADA_PARA || "1",
                  item.CODIGO_PARA || ""
                ]
              },
              {
                key: 'ZDEPARA_SINDICATOS',
                name: 'ZDEPARA_SINDICATOS',
                headers: ["EMPRESA _DE", "CODIGO_DE", "NOME_DE", "CNPJ", "COLIGADA_PARA", "CODIGO_PARA"],
                mapper: item => [
                  item.EMPRESA_DE || item['EMPRESA _DE'] || "",
                  item.CODIGO_DE || "",
                  item.NOME_DE || "",
                  item.CNPJ || "",
                  item.COLIGADA_PARA || "1",
                  item.CODIGO_PARA || ""
                ]
              },
              {
                key: 'ZDEPARA_SECOES',
                name: 'ZDEPARA_SECOES',
                headers: ["EMPRESA_DE", "FILIAL_DE", "CODIGO_DE", "NOME_DE", "COLIGADA_PARA", "FILIAL_PARA", "CODIGO_PARA", "NOME SECAO PARA"],
                mapper: item => [
                  item.EMPRESA_DE || "",
                  item.FILIAL_DE || "",
                  item.CODIGO_DE || "",
                  item.NOME_DE || "",
                  item.COLIGADA_PARA || "1",
                  item.FILIAL_PARA || "",
                  item.CODIGO_PARA || "",
                  getSecaoName(item.COLIGADA_PARA, item.FILIAL_PARA, item.CODIGO_PARA)
                ]
              },
              {
                key: 'ZDEPARA_BANCOS',
                name: 'ZDEPARA_BANCOS',
                headers: ["EMPRESA_DE", "NUMBANCO_DE", "NOME_BANCO_DE", "NUMAGENCIA_DE", "NOME_AGENCIA_DE", "CODIGO_BANCO_PARA", "CODIGO_AGENCIA_PARA"],
                mapper: item => [
                  item.EMPRESA_DE || "",
                  item.NUMBANCO_DE || item.ID_BANCO_EPG || "",
                  item.NOME_BANCO_DE || item.NOME_DE || "",
                  item.NUMAGENCIA_DE || item.ID_AGENCIA_EPG || "",
                  item.NOME_AGENCIA_DE || "",
                  item.CODIGO_BANCO_PARA || "",
                  item.CODIGO_AGENCIA_PARA || ""
                ]
              },
              {
                key: 'ZDEPARA_SITUACAO',
                name: 'ZDEPARA_SITUACAO',
                headers: ["CODIGO_DE", "NOME_DE", "CODSITUACAO_PARA", "CODMOTIVO_PARA", "CODSITUACAO_RETORNO_PARA", "CODMOTIVO_RETORNO_PARA"],
                mapper: item => [
                  item.CODIGO_DE || "",
                  item.NOME_DE || "",
                  item.CODSITUACAO_PARA || "",
                  item.CODMOTIVO_PARA || "",
                  item.CODSITUACAO_RETORNO_PARA || "",
                  item.CODMOTIVO_RETORNO_PARA || ""
                ]
              },
              {
                key: 'ZDEPARA_HORARIO',
                name: 'ZDEPARA_HORARIO',
                headers: ["EMPRESA_DE", "CODIGO_DE", "NOME_DE", "COLIGADA_PARA", "CODIGO_PARA"],
                mapper: item => [
                  item.EMPRESA_DE || "",
                  item.CODIGO_DE || "",
                  item.NOME_DE || "",
                  item.COLIGADA_PARA || "1",
                  item.CODIGO_PARA || ""
                ]
              },
              {
                key: 'ZDEPARA_PERIODO_FOLHA',
                name: 'ZDEPARA_PERIODO_FOLHA',
                headers: ["CODIGO_PERIODO_DE", "TIPO_FOLHA_DE", "PREFIXO_ESOCIAL", "NROPERIODO_PARA"],
                mapper: item => [
                  item.CODIGO_PERIODO_DE || "",
                  item.TIPO_FOLHA_DE || "",
                  item.PREFIXO_ESOCIAL || "",
                  item.NROPERIODO_PARA || ""
                ]
              },
              {
                key: 'ZDEPARA_MOTIVO_FUNCAO',
                name: 'ZDEPARA_MOTIVO_FUNCAO',
                headers: ["EMPRESA_DE", "CODIGO_MOTIVO_DE", "NOME_MOTIVO_DE", "COLIGADA_PARA", "CODIGO_MOTIVO_PARA"],
                mapper: item => [
                  item.EMPRESA_DE || "",
                  item.CODIGO_MOTIVO_DE || item.CODIGO_DE || "",
                  item.NOME_MOTIVO_DE || item.NOME_DE || "",
                  item.COLIGADA_PARA || "1",
                  item.CODIGO_MOTIVO_PARA || item.CODMOTIVO_PARA || ""
                ]
              },
              {
                key: 'ZDEPARA_MOTIVO_SALARIO',
                name: 'ZDEPARA_MOTIVO_SALARIO',
                headers: ["EMPRESA_DE", "CODIGO_MOTIVO_DE", "NOME_MOTIVO_DE", "COLIGADA_PARA", "CODIGO_MOTIVO_PARA"],
                mapper: item => [
                  item.EMPRESA_DE || "",
                  item.CODIGO_MOTIVO_DE || item.CODIGO_DE || "",
                  item.NOME_MOTIVO_DE || item.NOME_DE || "",
                  item.COLIGADA_PARA || "1",
                  item.CODIGO_MOTIVO_PARA || item.CODMOTIVO_PARA || ""
                ]
              },
              {
                key: 'ZDEPARA_MOTIVO_SECAO',
                name: 'ZDEPARA_MOTIVO_SECAO',
                headers: ["EMPRESA_DE", "CODIGO_MOTIVO_DE", "NOME_MOTIVO_DE", "COLIGADA_PARA", "CODIGO_MOTIVO_PARA"],
                mapper: item => [
                  item.EMPRESA_DE || "",
                  item.CODIGO_MOTIVO_DE || item.CODIGO_DE || "",
                  item.NOME_MOTIVO_DE || item.NOME_DE || "",
                  item.COLIGADA_PARA || "1",
                  item.CODIGO_MOTIVO_PARA || item.CODMOTIVO_PARA || ""
                ]
              },
              {
                key: 'DADOS_RM_EVENTOS',
                name: 'DADOS_RM_EVENTOS',
                headers: ["CODIGO", "DESCRICAO", "TIPOEVENTO", "VALHORDIAREF", "NAT_ESOCIAL"],
                mapper: item => [
                  item.CODIGO || item.codigo || "",
                  item.DESCRICAO || item.descricao || "",
                  item.TIPOEVENTO || item.tipo || "",
                  item.VALHORDIAREF || item.valhordiaref || "",
                  item.NAT_ESOCIAL || item.nat_esocial || ""
                ]
              },
              {
                key: 'DADOS_RM_SITUACAO',
                name: 'DADOS_RM_SITUACAO',
                headers: ["CODCLIENTE", "DESCRICAO"],
                mapper: item => [
                  item.CODCLIENTE || item.codcliente || "",
                  item.DESCRICAO || item.descricao || ""
                ]
              },
              {
                key: 'DADOS_RM_MOTIVOS',
                name: 'DADOS_RM_MOTIVOS',
                headers: ["CODCLIENTE", "DESCRICAO"],
                mapper: item => [
                  item.CODCLIENTE || item.codcliente || "",
                  item.DESCRICAO || item.descricao || ""
                ]
              },
              {
                key: 'DADOS_RM_SECOES',
                name: 'DADOS_RM_SECOES',
                headers: ["COLIGADA", "FILIAL", "COD_SECAO", "DESCRICAO", "CNPJ"],
                mapper: item => [
                  item.COLIGADA !== undefined ? item.COLIGADA : (item.coligada || ""),
                  item.FILIAL !== undefined ? item.FILIAL : (item.filial || ""),
                  item.CODIGO !== undefined ? item.CODIGO : (item.codigo !== undefined ? item.codigo : (item.COD_SECAO || item.cod_secao || "")),
                  item.DESCRICAO !== undefined ? item.DESCRICAO : (item.descricao || ""),
                  item.CNPJ !== undefined ? item.CNPJ : (item.cnpj || "")
                ]
              }
            ];
 
            abasMap.forEach(aba => {
              const rows = rawJsonDatabase[aba.key] || [];
              
              // Monta a matriz de dados (Primeira linha são os cabeçalhos litérios)
              const sheetData = [aba.headers];
              rows.forEach(item => {
                sheetData.push(aba.mapper(item));
              });
              
              const ws = XLSX.utils.aoa_to_sheet(sheetData);
              
              // 1. Forçar todas as células (cabeçalho e dados) como texto puro para reter zeros à esquerda
              for (let key in ws) {
                if (key[0] === '!') continue; // Ignora chaves internas de controle
                const cell = ws[key];
                cell.t = 's'; // Tipo: String
                cell.z = '@'; // Formato de exibição: Text
              }
              
              // 2. Aplicar colorização de cabeçalhos por coluna (linha 0 no Excel)
              const isDadosRm = aba.name.startsWith("DADOS_RM");
              aba.headers.forEach((h, colIdx) => {
                const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
                if (ws[cellRef]) {
                  let colorHex = "5B95F9"; // Azul padrão para Legados Origem
                  
                  if (isDadosRm) {
                    colorHex = "F7CB4D"; // Amarelo para DADOS_RM
                  } else {
                    // Para abas ZDEPARA:
                    // Se a coluna é de destino/RM, pinta de amarelo; se for origem, de azul
                    const hNorm = h.toUpperCase();
                    const isParaCol = hNorm.includes("_PARA") || hNorm === "CODCOLIGADA" || hNorm === "NOME_RM" || hNorm.includes("FICHA_MES") || hNorm.includes("VERBAS_FERIAS");
                    if (isParaCol) {
                      colorHex = "F7CB4D"; // Amarelo
                    }
                  }
                  
                  ws[cellRef].s = {
                    fill: {
                      fgColor: { rgb: colorHex }
                    },
                    font: {
                      bold: true,
                      color: { rgb: (colorHex === "5B95F9" ? "FFFFFF" : "000000") }
                    }
                  };
                }
              });
              
              XLSX.utils.book_append_sheet(wb, ws, aba.name);
            });
            
            // Salvar arquivo XLSX com padrão de nome
            let clientKey = SPREADSHEET_ID.toLowerCase();
            if (SPREADSHEET_ID.includes("docs.google.com")) {
              const matches = SPREADSHEET_ID.match(/\/d\/([a-zA-Z0-9-_]+)/);
              if (matches) clientKey = matches[1].toLowerCase();
            }
            
            const d = new Date();
            const dia = String(d.getDate()).padStart(2, '0');
            const mes = String(d.getMonth() + 1).padStart(2, '0');
            const ano = String(d.getFullYear()).slice(-2);
            const hora = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            const dataStr = `${dia}${mes}${ano}_${hora}${min}`;
 
            const filename = `000-ZDEPARA - ${clientKey.toUpperCase()} - ${dataStr}.xlsx`;
            XLSX.writeFile(wb, filename);
            
            hideLoading();
            showToast("Planilha gerada e baixada com sucesso!", "success");
          } catch (err) {
            hideLoading();
            showToast("Erro ao gerar Excel: " + err.message, "error");
          }
        }
      );
    }
 
    function handleExcelImport(event) {
      const file = event.target.files[0];
      if (!file) return;

      showLoading("Analisando planilha Excel...");
      const reader = new FileReader();
      
      reader.onload = function(e) {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          
          tempImportWorkbook = workbook;
          tempImportFileName = file.name;
          
          const abasToImport = [
            { name: 'ZDEPARA_EVENTOS', key: 'ZDEPARA_EVENTOS' },
            { name: 'ZDEPARA_COLIGADAS', key: 'ZDEPARA_COLIGADAS' },
            { name: 'ZDEPARA_FUNCOES', key: 'ZDEPARA_FUNCOES' },
            { name: 'ZDEPARA_SINDICATOS', key: 'ZDEPARA_SINDICATOS' },
            { name: 'ZDEPARA_SECOES', key: 'ZDEPARA_SECOES' },
            { name: 'ZDEPARA_BANCOS', key: 'ZDEPARA_BANCOS' },
            { name: 'ZDEPARA_SITUACAO', key: 'ZDEPARA_SITUACAO' },
            { name: 'ZDEPARA_HORARIO', key: 'ZDEPARA_HORARIO' },
            { name: 'ZDEPARA_PERIODO_FOLHA', key: 'ZDEPARA_PERIODO_FOLHA' },
            { name: 'ZDEPARA_MOTIVO_FUNCAO', key: 'ZDEPARA_MOTIVO_FUNCAO' },
            { name: 'ZDEPARA_MOTIVO_SALARIO', key: 'ZDEPARA_MOTIVO_SALARIO' },
            { name: 'ZDEPARA_MOTIVO_SECAO', key: 'ZDEPARA_MOTIVO_SECAO' },
            { name: 'DADOS_RM_EVENTOS', key: 'DADOS_RM_EVENTOS' },
            { name: 'DADOS_RM_SITUACAO', key: 'DADOS_RM_SITUACAO' },
            { name: 'DADOS_RM_MOTIVOS', key: 'DADOS_RM_MOTIVOS' },
            { name: 'DADOS_RM_SECOES', key: 'DADOS_RM_SECOES' }
          ];

          const abasValidas = [];
          abasToImport.forEach(aba => {
            const ws = workbook.Sheets[aba.name];
            if (ws) {
              const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
              const records = json.length > 1 ? json.length - 1 : 0;
              abasValidas.push({ ...aba, records });
            }
          });

          hideLoading();

          if (abasValidas.length === 0) {
            showToast("Nenhuma aba mapeada válida encontrada no arquivo enviado.", "error");
            return;
          }

          // Injetar checkboxes no modal
          const container = document.getElementById("importTabListContainer");
          container.innerHTML = abasValidas.map(aba => `
            <label style="display:flex; align-items:center; gap:10px; font-size:0.88rem; color:var(--color-text-dark); cursor:pointer; padding:6px; border-radius:4px; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#e2e8f0'" onmouseout="this.style.backgroundColor='transparent'">
              <input type="checkbox" name="importTabCheckbox" value="${aba.key}" data-sheetname="${aba.name}" checked style="width:16px; height:16px; cursor:pointer;">
              <span><strong>${aba.name}</strong> (${aba.records} registros detectados)</span>
            </label>
          `).join('');

          // Exibir o modal de escolha
          document.getElementById("importSelectionModal").style.display = "flex";
          
        } catch (err) {
          hideLoading();
          showToast("Erro ao processar arquivo: " + err.message, "error");
        }
      };

      reader.readAsArrayBuffer(file);
      event.target.value = "";
    }

    
    // BASE DE CONHECIMENTO GLOBAL
    const GLOBAL_SITUACAO_KNOWLEDGE_BASE = {
  "1": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "2": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "3": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "4": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "5": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "6": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "7": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "8": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "9": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "10": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "11": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "12": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "13": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "14": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "15": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "04"
  },
  "16": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "17": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "18": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "19": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "20": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "21": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "22": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "23": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "24": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "25": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "26": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "27": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "28": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "29": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "30": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "31": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "32": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "33": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "34": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "35": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "36": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "37": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "38": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "39": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "40": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "41": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "42": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "43": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "44": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "45": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "46": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "47": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "48": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "49": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "50": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "51": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "53": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "54": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "55": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "56": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "57": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "58": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "59": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "60": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "61": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "62": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "63": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "65": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "66": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "69": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "70": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "71": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "72": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "73": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "74": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "76": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "82": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "90": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  },
  "99": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "A",
    "CODMOTIVO_RETORNO_PARA": "38"
  },
  "390": {
    "CODSITUACAO_PARA": "",
    "CODMOTIVO_PARA": "",
    "CODSITUACAO_RETORNO_PARA": "",
    "CODMOTIVO_RETORNO_PARA": ""
  }
};
    const GLOBAL_RM_MOTIVOS_SEED = [
  {
    "CODCLIENTE": "01",
    "DESCRICAO": "ADMISSAO"
  },
  {
    "CODCLIENTE": "02",
    "DESCRICAO": "APOSENTADORIA P/INVALIDEZ ACIDENTE DE TRABALHO"
  },
  {
    "CODCLIENTE": "03",
    "DESCRICAO": "AFASTAMENTO P/FERIAS"
  },
  {
    "CODCLIENTE": "04",
    "DESCRICAO": "RETORNO DAS FERIAS"
  },
  {
    "CODCLIENTE": "06",
    "DESCRICAO": "TRANSFERENCIA ENTRE COLIGADAS"
  },
  {
    "CODCLIENTE": "07",
    "DESCRICAO": "TRANSFERENCIA ENTRE FILIAIS"
  },
  {
    "CODCLIENTE": "08",
    "DESCRICAO": "DEMISSAO"
  },
  {
    "CODCLIENTE": "09",
    "DESCRICAO": "LICENCA MATERNIDADE"
  },
  {
    "CODCLIENTE": "10",
    "DESCRICAO": "LICENCA MATERNIDADE P/ABORTO NAO CRIMINOSO"
  },
  {
    "CODCLIENTE": "11",
    "DESCRICAO": "LICENCA REMUNERADA"
  },
  {
    "CODCLIENTE": "12",
    "DESCRICAO": "LICENCA MATERNIDADE POR ADOCAO"
  },
  {
    "CODCLIENTE": "13",
    "DESCRICAO": "ADMISSAO ALTA ESTACAO/SAFRA"
  },
  {
    "CODCLIENTE": "14",
    "DESCRICAO": "AVISO PREVIO"
  },
  {
    "CODCLIENTE": "15",
    "DESCRICAO": "SERVICO MILITAR"
  },
  {
    "CODCLIENTE": "16",
    "DESCRICAO": "APOSENTADORIA"
  },
  {
    "CODCLIENTE": "17",
    "DESCRICAO": "CESSAO / REQUISICAO"
  },
  {
    "CODCLIENTE": "18",
    "DESCRICAO": "MANDATO SINDICAL"
  },
  {
    "CODCLIENTE": "28",
    "DESCRICAO": "CARCERE"
  },
  {
    "CODCLIENTE": "29",
    "DESCRICAO": "LEI MARIA DA PENHA"
  },
  {
    "CODCLIENTE": "30",
    "DESCRICAO": "SUSPENSAO DISPLINAR"
  },
  {
    "CODCLIENTE": "31",
    "DESCRICAO": "ESPECIE B31 (AUXILIO-DOENCA)"
  },
  {
    "CODCLIENTE": "32",
    "DESCRICAO": "SUSPENSAO TEMPORARIA CONTRATO TRABALHO MP 936/2020"
  },
  {
    "CODCLIENTE": "33",
    "DESCRICAO": "LICENCA PATERNIDADE 05 DIAS"
  },
  {
    "CODCLIENTE": "34",
    "DESCRICAO": "LICENCA PATERNIDADE 20 DIAS"
  },
  {
    "CODCLIENTE": "35",
    "DESCRICAO": "LICENCA MATERNIDADE POR PRORROGACAO"
  },
  {
    "CODCLIENTE": "36",
    "DESCRICAO": "LICENCA MATERNIDADE POR ANTECIPACAO"
  },
  {
    "CODCLIENTE": "37",
    "DESCRICAO": "AFASTAMENTO DOENCA OCUPACIONAL"
  },
  {
    "CODCLIENTE": "38",
    "DESCRICAO": "RETORNO DE AFASTAMENTO"
  },
  {
    "CODCLIENTE": "39",
    "DESCRICAO": "AFAST TEMP POR DOENCA IGUAL OU INFERIOR A 15 DIAS"
  },
  {
    "CODCLIENTE": "40",
    "DESCRICAO": "AFAST TEMP POR DOENCA SUPERIOR A 15 DIAS"
  },
  {
    "CODCLIENTE": "41",
    "DESCRICAO": "AFAST TEMP POR AC TRAB IGUAL OU INFERIOR A 15 DIAS"
  },
  {
    "CODCLIENTE": "42",
    "DESCRICAO": "AFAST TEMP POR AC TRAB SUPERIOR A 15 DIAS"
  },
  {
    "CODCLIENTE": "43",
    "DESCRICAO": "OUTROS MOTIVOS DE AFASTAMENTO TEMPORARIO"
  },
  {
    "CODCLIENTE": "44",
    "DESCRICAO": "LICENCA SEM VENCIMENTO"
  },
  {
    "CODCLIENTE": "91",
    "DESCRICAO": "ESPECIE B91 AUXILIO-ACIDENTE P/ACIDENTE TRABALHO"
  },
  {
    "CODCLIENTE": "99",
    "DESCRICAO": "IMPLANTACAO ERP"
  },
  {
    "CODCLIENTE": "CV",
    "DESCRICAO": "AFASTAMENTO POR COVID-19"
  },
  {
    "CODCLIENTE": "DC",
    "DESCRICAO": "MOTIVO DESCONHECIDO"
  }
];

    const OFFICIAL_HEADERS = {
      ZDEPARA_EVENTOS: ["EMPRESA_DE", "CODIGO_DE", "NOME_DE", "TIPO_EVENTO", "COLIGADA_PARA", "CODIGO_PARA", "NOME_RM", "CODIGO_PARA_FICHA_MES1", "NOME_RM", "CODIGO_PARA_FICHA_MES2", "NOME_RM", "CODIGO_PARA_VERBAS_FERIAS", "NOME_RM"],
      ZDEPARA_COLIGADAS: ["EMPRESA_DE", "ID", "NOME_DE", "CNPJ", "CODCOLIGADA", "CODFILIAL_PARA"],
      ZDEPARA_FUNCOES: ["EMPRESA_DE", "CODIGO_DE", "NOME_DE", "COLIGADA_PARA", "CODIGO_PARA"],
      ZDEPARA_SINDICATOS: ["EMPRESA_DE", "CODIGO_DE", "NOME_DE", "COLIGADA_PARA", "CODIGO_PARA"],
      ZDEPARA_SECOES: ["EMPRESA_DE", "CODIGO_DE", "NOME_DE", "COLIGADA_PARA", "FILIAL_PARA", "CODIGO_PARA"],
      ZDEPARA_SITUACAO: ["EMPRESA_DE", "CODIGO_DE", "NOME_DE", "CODSITUACAO_PARA", "CODMOTIVO_PARA", "CODSITUACAO_RETORNO_PARA", "CODMOTIVO_RETORNO_PARA"],
      ZDEPARA_HORARIO: ["EMPRESA_DE", "CODIGO_DE", "NOME_DE", "COLIGADA_PARA", "CODIGO_PARA"],
      ZDEPARA_PERIODO_FOLHA: ["EMPRESA_DE", "CODIGO_DE", "NOME_DE", "COLIGADA_PARA", "CODIGO_PARA"],
      ZDEPARA_MOTIVO_FUNCAO: ["EMPRESA_DE", "CODIGO_DE", "NOME_DE", "COLIGADA_PARA", "CODIGO_PARA"],
      ZDEPARA_MOTIVO_SALARIO: ["EMPRESA_DE", "CODIGO_DE", "NOME_DE", "COLIGADA_PARA", "CODIGO_PARA"],
      ZDEPARA_MOTIVO_SECAO: ["EMPRESA_DE", "CODIGO_DE", "NOME_DE", "COLIGADA_PARA", "CODIGO_PARA"],
      DADOS_RM_EVENTOS: ["CODIGO", "DESCRICAO", "TIPOEVENTO", "VALHORDIAREF", "NAT_ESOCIAL"],
      DADOS_RM_SITUACAO: ["CODCLIENTE", "DESCRICAO"],
      DADOS_RM_MOTIVOS: ["CODCLIENTE", "DESCRICAO"],
      DADOS_RM_SECOES: ["COLIGADA", "FILIAL", "CODIGO", "DESCRICAO", "CNPJ"]
    };

    function normalizeHeaderFuzzy(row, officialHeaders, progressLog, sheetName) {
      const normalizedRow = {};
      const cleanOfficial = officialHeaders.map(h => ({
        official: h,
        clean: h.toUpperCase().replace(/[\s_-]/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      }));

      const loggedWarnings = {};

      for (let prop in row) {
        if (prop === 'rowNum') continue;
        const cleanProp = prop.toUpperCase().replace(/[\s_-]/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const match = cleanOfficial.find(o => o.clean === cleanProp);
        
        if (match) {
          normalizedRow[match.official] = row[prop];
          if (match.official !== prop && progressLog && !loggedWarnings[match.official]) {
            progressLog.innerHTML += `   ⚠️ [Aba ${sheetName}]: Coluna "${prop}" corrigida para "${match.official}".\n`;
            loggedWarnings[match.official] = true;
          }
        } else {
          normalizedRow[prop] = row[prop];
        }
      }

      // Garantir que todos os cabeçalhos oficiais existam para evitar quebra de nulls
      officialHeaders.forEach(h => {
        if (normalizedRow[h] === undefined) {
          normalizedRow[h] = "";
          if (progressLog && !loggedWarnings[h]) {
            progressLog.innerHTML += `   ❌ [Aba ${sheetName}]: Coluna obrigatória "${h}" ausente! Criada como vazia.\n`;
            loggedWarnings[h] = true;
          }
        }
      });

      return normalizedRow;
    }

    function toggleSelectAllImportTabs(shouldCheck) {
      document.querySelectorAll('input[name="importTabCheckbox"]').forEach(cb => cb.checked = shouldCheck);
    }

    function proceedWithExcelImport() {
      // Fechar modal de seleção
      closeModal('importSelectionModal');

      const selectedCheckboxes = document.querySelectorAll('input[name="importTabCheckbox"]:checked');
      if (selectedCheckboxes.length === 0) {
        showToast("Você precisa selecionar pelo menos uma aba para importar.", "error");
        return;
      }

      // Abrir modal de progresso
      const progressModal = document.getElementById("progressModal");
      const progressTitle = document.getElementById("progressTitle");
      const progressLabel = document.getElementById("progressLabel");
      const progressBarFill = document.getElementById("progressBarFill");
      const progressPercentage = document.getElementById("progressPercentage");
      const progressLog = document.getElementById("progressLog");
      
      progressLog.innerHTML = "";
      progressTitle.innerText = "Importando Planilha Excel";
      progressModal.style.display = "flex";

      const totalAbas = selectedCheckboxes.length;
      let abasProcessadas = 0;

      if (!rawJsonDatabase) rawJsonDatabase = {};

      selectedCheckboxes.forEach((cb, index) => {
        const key = cb.value;
        const sheetName = cb.getAttribute("data-sheetname");

        progressLabel.innerText = `Processando aba ${sheetName}...`;
        
        try {
          const ws = tempImportWorkbook.Sheets[sheetName];
          if (ws) {
            let json = XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" });
            
            // Rodar Fuzzy Header Match se houver cabeçalhos oficiais cadastrados para essa aba
            const official = OFFICIAL_HEADERS[key];
            if (official) {
              json = json.map(row => normalizeHeaderFuzzy(row, official, progressLog, sheetName));
            }

            // Adicionar index sequencial de linhas
            json.forEach((item, idx) => {
              item.rowNum = idx + 1;
            });
            
            rawJsonDatabase[key] = json;
            progressLog.innerHTML += `Aba [${sheetName}]: ${json.length} registros processados.\n`;
          }
        } catch (err) {
          progressLog.innerHTML += `Aba [${sheetName}]: Erro de leitura - ${err.message}.\n`;
        }

        abasProcessadas++;
        const pct = Math.round((abasProcessadas / totalAbas) * 100);
        progressBarFill.style.width = `${pct}%`;
        progressPercentage.innerText = `${pct}%`;
      });

      // Normalizar propriedades da base recém-carregada na memória
      normalizeDatabaseProperties(rawJsonDatabase);
      progressLog.innerHTML += `Propriedades e compatibilidades normalizadas com sucesso.\n`;

      const pat = localStorage.getItem("gh_pat");
      if (pat) {
        // Enviar alterações para o GitHub
        progressLabel.innerText = "Enviando alterações para o repositório GitHub...";
        progressLog.innerHTML += "Iniciando commit de sincronização no GitHub...\n";

        commitChangesToGitHub(`Importação bilateral seletiva via planilha Excel - ${tempImportFileName}`, () => {}, () => {
          let secondsLeft = 15;
          progressLabel.innerText = `Organizando os dados... Aguarde um momento para atualizar as informações com segurança. (${secondsLeft}s)`;
          progressBarFill.style.width = "100%";
          progressPercentage.innerText = "100%";
          
          const interval = setInterval(() => {
            secondsLeft--;
            progressLabel.innerText = `Organizando os dados... Aguarde um momento para atualizar as informações com segurança. (${secondsLeft}s)`;
            if (secondsLeft <= 0) {
              clearInterval(interval);
              progressModal.style.display = "none";
              showToast(`Sucesso! ${totalAbas} abas importadas e sincronizadas com o GitHub.`, "success");
              switchModule(currentModule);
            }
          }, 1000);
        });
      } else {
        // Modo offline (sem salvar remoto)
        setTimeout(() => {
          progressModal.style.display = "none";
          showToast(`Modo Offline: ${totalAbas} abas importadas apenas localmente na memória.`, "warning");
          switchModule(currentModule);
        }, 1200);
      }
    }

    function createBackupOnGitHub() {
      const pat = localStorage.getItem("gh_pat");
      if (!pat) {
        showToast("Configure e salve o Token do GitHub antes de gerar backups.", "error");
        return;
      }

      showLoading("Criando ponto de restauração (Backup)...");

      let clientKey = SPREADSHEET_ID.toLowerCase();
      if (SPREADSHEET_ID.includes("docs.google.com")) {
        const matches = SPREADSHEET_ID.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (matches) clientKey = matches[1].toLowerCase();
      }

      const owner = localStorage.getItem("gh_owner") || "TOTVSGustavoFerreira";
      const repo = localStorage.getItem("gh_repo") || "portal-depara-navarro";
      const backupPath = `data/backup_${clientKey}.json`;

      // 1. Procurar SHA do backup se ele já existir
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${backupPath}`;
      
      fetch(apiUrl, {
        headers: {
          "Authorization": `token ${pat}`,
          "Accept": "application/vnd.github.v3+json"
        }
      })
      .then(res => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error("Erro ao acessar API do GitHub.");
        return res.json();
      })
      .then(fileInfo => {
        const sha = fileInfo ? fileInfo.sha : null;
        
        // Clonar base de dados limpa (removendo sha antigo do objeto salvo no arquivo)
        const cleanDb = { ...rawJsonDatabase };
        delete cleanDb._sha;

        const contentBase64 = safeBtoa(JSON.stringify(cleanDb, null, 2));
        
        const body = {
          message: `Ponto de Restauração - Backup Manual via Portal De-Para`,
          content: contentBase64
        };
        if (sha) body.sha = sha;

        return fetch(apiUrl, {
          method: "PUT",
          headers: {
            "Authorization": `token ${pat}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });
      })
      .then(res => {
        hideLoading();
        if (!res.ok) throw new Error("Erro ao enviar arquivo ao repositório.");
        showToast("Backup gerado com sucesso! Ponto de restauração salvo no GitHub.", "success");
      })
      .catch(err => {
        hideLoading();
        showToast("Erro ao criar backup: " + err.message, "error");
      });
    }

    function optimizeManualCreatedCodesSequence() {
      showCustomConfirm(
        "Otimização de Sequência de Funções",
        "Deseja reordenar os códigos das funções mapeadas para remover buracos e lacunas de numeração? Isso re-sequenciará de forma contínua seus códigos de destino e sincronizará no GitHub.",
        function() {
          showLoading("Reordenando sequência de funções...");

          const list = rawJsonDatabase.ZDEPARA_FUNCOES || [];
          // Filtrar itens com código numérico mapeado
          const validItems = list.filter(item => {
            const cod = String(item.CODIGO_PARA || "").trim();
            return cod && !isNaN(parseInt(cod, 10)) && !isCodeIgnored(cod) && !isCodeToCreate(cod);
          });

          if (validItems.length === 0) {
            hideLoading();
            showToast("Nenhum código de função mapeado para reordenar.", "warning");
            return;
          }

          // Ordenar os códigos únicos atuais
          const sortedCodes = [...new Set(validItems.map(item => parseInt(item.CODIGO_PARA, 10)))].sort((a, b) => a - b);
          const startNum = sortedCodes[0]; // Código base inicial

          // Criar de-para de remapeamento (código antigo -> novo código sem lacunas)
          const remapping = {};
          sortedCodes.forEach((codeVal, idx) => {
            const oldCode = String(codeVal).trim();
            const newCode = String(startNum + idx);
            remapping[oldCode] = newCode;
            // Tratar versão com preenchimento de zeros à esquerda se existia
            remapping[oldCode.padStart(4, '0')] = newCode.padStart(4, '0');
          });

          // Enviar alterações para o GitHub
          commitChangesToGitHub("Otimização de numeração e re-sequenciamento de códigos na aba ZDEPARA_FUNCOES", () => {
            // Atualizar os códigos na base de dados de ZDEPARA_FUNCOES na memória
            list.forEach(item => {
              const oldPara = String(item.CODIGO_PARA || "").trim();
              if (remapping[oldPara]) {
                const newCode = remapping[oldPara];
                item.CODIGO_PARA = newCode;
                item.codigoPara = newCode;
              }
            });
            
            rawJsonDatabase.ZDEPARA_FUNCOES = list;
            database = list;
          }, () => {
            showToast("Códigos de funções reordenados e sincronizados com sucesso!", "success");
            switchModule(currentModule);
          }, 'cadastros');
        }
      );
    }

    function restoreBackupOnGitHub() {
      const pat = localStorage.getItem("gh_pat");
      if (!pat) {
        showToast("Configure e salve o Token do GitHub antes de restaurar.", "error");
        return;
      }

      // Pedir senha de segurança para evitar restaurações acidentais
      const pwd = prompt("Esta ação irá sobrescrever o banco atual pela versão do último backup. Digite a senha de segurança para confirmar:");
      if (pwd !== "TOTVS_DEPARA_2026") {
        if (pwd !== null) showToast("Senha de segurança incorreta. Ação abortada.", "error");
        return;
      }

      showLoading("Restaurando banco a partir do backup...");

      let clientKey = SPREADSHEET_ID.toLowerCase();
      if (SPREADSHEET_ID.includes("docs.google.com")) {
        const matches = SPREADSHEET_ID.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (matches) clientKey = matches[1].toLowerCase();
      }

      const owner = localStorage.getItem("gh_owner") || "TOTVSGustavoFerreira";
      const repo = localStorage.getItem("gh_repo") || "portal-depara-navarro";
      const backupPath = `data/backup_${clientKey}.json`;
      const mainPath = `data/${clientKey}.json`;

      let backupContent = "";
      let mainSha = null;

      // 1. Ler o arquivo de backup
      fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${backupPath}`, {
        headers: {
          "Authorization": `token ${pat}`,
          "Accept": "application/vnd.github.v3+json"
        }
      })
      .then(res => {
        if (res.status === 404) throw new Error("Nenhum arquivo de backup encontrado. Crie um backup primeiro.");
        if (!res.ok) throw new Error("Erro ao ler arquivo de backup.");
        return res.json();
      })
      .then(fileInfo => {
        backupContent = fileInfo.content; // Conteúdo decodificado em Base64 do backup
        
        // 2. Buscar o SHA do arquivo principal para poder sobrescrevê-lo
        return fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${mainPath}`, {
          headers: {
            "Authorization": `token ${pat}`,
            "Accept": "application/vnd.github.v3+json"
          }
        });
      })
      .then(res => {
        if (!res.ok) throw new Error("Erro ao ler informações do arquivo principal.");
        return res.json();
      })
      .then(mainFileInfo => {
        mainSha = mainFileInfo.sha;

        // 3. Gravar o conteúdo do backup sobre o arquivo principal
        const body = {
          message: `Reversão/Rollback - Restaurando para o último ponto de backup manual`,
          content: backupContent.replace(/\n/g, ""),
          sha: mainSha
        };

        return fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${mainPath}`, {
          method: "PUT",
          headers: {
            "Authorization": `token ${pat}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });
      })
      .then(res => {
        if (!res.ok) throw new Error("Erro ao salvar restauração no GitHub.");
        
        // Recarregar os dados do portal agora restaurados
        loadPortalData();
        showToast("Restauração concluída! O banco de dados foi revertido para o backup.", "success");
      })
      .catch(err => {
        hideLoading();
        showToast("Erro ao restaurar: " + err.message, "error");
      });
    }

    function updateDashboard() {
      // Contar dinamicamente registros que são NAO IMPORTAR para o footer
      let ignoredCount = 0;
      database.forEach(item => {
        const cod = ((currentModule === 'eventos' ? item.codigoPara : item.CODIGO_PARA) || "").trim();
        if (cod === "NAO IMPORTAR") ignoredCount++;
      });

      document.getElementById("valTotal").innerText = stats.total;
      document.getElementById("valMapped").innerText = stats.preenchidos;
      document.getElementById("valUnmapped").innerText = stats.naoPreenchidos;
      document.getElementById("valPending").innerText = stats.pAnalise;
      document.getElementById("valDivergent").innerText = stats.divergencias;
      
      // Controlar visibilidade de cards baseados no módulo ativo
      const pendingCard = document.getElementById("kpiCardPending");
      const divergentCard = document.getElementById("kpiCardDivergent");
      const manualCard = document.getElementById("kpiCardManual");
      
      // Seções e Situação não possuem divergências
      if (currentModule === 'secoes' || currentModule === 'situacao') {
        divergentCard.style.display = 'none';
      } else {
        divergentCard.style.display = 'flex';
      }

      // Coligadas e Situação não possuem "P/ Análise"
      if (currentModule === 'coligadas' || currentModule === 'situacao') {
        pendingCard.style.display = 'none';
      } else {
        pendingCard.style.display = 'flex';
      }

      // Situação exibe o card de Motivos Manuais
      if (currentModule === 'situacao') {
        manualCard.style.display = 'flex';
        manualCard.querySelector('.kpi-label').innerText = 'Motivos Manuais Criados';
        let manualCount = 0;
        if (database) {
           manualCount = database.filter(i => {
             const m1 = getMotivoName(i.CODMOTIVO_PARA) || "";
             const m2 = getMotivoName(i.CODMOTIVO_RETORNO_PARA) || "";
             return m1.includes('[INCLUSAO MANUAL]') || m2.includes('[INCLUSAO MANUAL]') || parseInt(i.CODMOTIVO_PARA) > 90 || parseInt(i.CODMOTIVO_RETORNO_PARA) > 90;
           }).length;
        }
        document.getElementById("valManual").innerText = manualCount;
      } else if (currentModule === 'secoes') {
        manualCard.style.display = 'flex';
        manualCard.querySelector('.kpi-label').innerText = 'Seções Manuais Criadas';
        let manualCount = 0;
        if (rawJsonDatabase && rawJsonDatabase.DADOS_RM_SECOES) {
          manualCount = rawJsonDatabase.DADOS_RM_SECOES.filter(s => 
            String(s.DESCRICAO || "").includes("[INCLUSAO MANUAL]")
          ).length;
        }
        document.getElementById("valManual").innerText = manualCount;
      } else {
        manualCard.style.display = 'none';
      }
      
      // Atualiza o rodapé com o resumo dinâmico
      const ftIgnored = document.getElementById('footerIgnored');
      const ftMapped = document.getElementById('footerMapped');
      const ftPending = document.getElementById('footerPending');
      const ftUnmapped = document.getElementById('footerUnmapped');
      
      if (ftIgnored) ftIgnored.innerText = ignoredCount;
      if (ftMapped) ftMapped.innerText = stats.preenchidos;
      if (ftPending) ftPending.innerText = stats.pAnalise;
      if (ftUnmapped) ftUnmapped.innerText = stats.naoPreenchidos;
      
      updateFooter();
    }

    function handleFilterTypeChange(type) {
      const container = document.getElementById("filterValueContainer");
      container.innerHTML = "";
      
      if (type === "empresaDe") {
        const uniqueEmpresas = [...new Set(database.map(i => i.empresaDe || i.EMPRESA_DE || i['EMPRESA _DE']).filter(Boolean))].sort();
        let options = uniqueEmpresas.map(e => `<option value="${e}">${e}</option>`).join('');
        container.innerHTML = `
          <select id="filterValueInput" class="filter-select" style="width:100%;" onchange="applyFilters()">
            <option value="">Selecione a Empresa...</option>
            ${options}
          </select>`;
      } 
      else if (type === "tipoEvento") {
        container.innerHTML = `
          <select id="filterValueInput" class="filter-select" style="width:100%;" onchange="applyFilters()">
            <option value="">Selecione o Tipo...</option>
            <option value="P-PROVENTO">P-PROVENTO</option>
            <option value="D-DESCONTO">D-DESCONTO</option>
            <option value="B-BASE">B-BASE</option>
          </select>`;
      } 
      else if (type === "status") {
        container.innerHTML = `
          <select id="filterValueInput" class="filter-select" style="width:100%;" onchange="applyFilters()">
            <option value="">Selecione o Status...</option>
            <option value="mapeado">Mapeado</option>
            <option value="nao_mapeado">Não Mapeado</option>
            <option value="p_analise">P/ Análise</option>
          </select>`;
      }
      else if (type === "temObservacao") {
        container.innerHTML = `
          <select id="filterValueInput" class="filter-select" style="width:100%;" onchange="applyFilters()">
            <option value="">Selecione...</option>
            <option value="sim">Sim (Com Observação)</option>
            <option value="nao">Não (Vazia)</option>
          </select>`;
      }
      else {
        container.innerHTML = `<input type="text" id="filterValueInput" class="input-field" placeholder="Digite para filtrar..." oninput="applyFilters()">`;
      }
    }

    function toggleKpiFilter(filterType) {
      document.querySelectorAll('.kpi-card').forEach(card => card.classList.remove('active-filter'));
      
      if (activeKpiFilter === filterType) {
        activeKpiFilter = 'all';
      } else {
        activeKpiFilter = filterType;
        let cardId = '';
        if (filterType === 'mapped') cardId = 'kpiCardMapped';
        else if (filterType === 'unmapped') cardId = 'kpiCardUnmapped';
        else if (filterType === 'pending') cardId = 'kpiCardPending';
        else if (filterType === 'divergent') cardId = 'kpiCardDivergent';
        else if (filterType === 'manual_motives') cardId = 'kpiCardManual';
        
        if (cardId) document.getElementById(cardId).classList.add('active-filter');
      }
      
      applyFilters();
    }

    function applyFilters() {
      const type = document.getElementById("filterTypeDropdown").value;
      const valueInput = document.getElementById("filterValueInput");
      const val = valueInput ? valueInput.value.toLowerCase().trim() : "";
      
      filteredData = database.filter(item => {
        // 1. Filtro dos KPIs baseado no módulo ativo
        let isMapped = false;
        let destCode = "";
        let isPending = false;
        
        if (currentModule === 'eventos') {
          destCode = (item.codigoPara || "").trim();
          isMapped = destCode && !isCodeIgnored(destCode) && !isCodeToCreate(destCode);
          isPending = isCodePending(destCode);
        } else if (currentModule === 'coligadas') {
          destCode = (item.CODCOLIGADA || "").trim();
          isMapped = !!destCode;
          isPending = false;
        } else if (currentModule === 'situacao') {
          destCode = (item.CODSITUACAO_PARA || "").trim();
          isMapped = !!destCode;
          isPending = false;
        } else {
          // Funcoes, Sindicatos, Secoes
          destCode = (item.CODIGO_PARA || "").trim();
          isMapped = destCode && !isCodeIgnored(destCode) && !isCodeToCreate(destCode);
          isPending = isCodePending(destCode);
        }
        
        if (activeKpiFilter === 'mapped' && !isMapped) return false;
        if (activeKpiFilter === 'unmapped') {
          if (currentModule === 'coligadas' || currentModule === 'situacao') {
            if (isMapped) return false;
          } else {
            if (isMapped || (destCode && destCode !== "CRIAR" && destCode !== "A CRIAR" && destCode !== "CRIAR EVENTO")) return false;
          }
        }
        if (activeKpiFilter === 'pending' && !isPending) return false;
        if (activeKpiFilter === 'divergent' && !item.hasDivergencia) return false;
        if (activeKpiFilter === 'manual_motives') {
          if (currentModule === 'situacao') {
            const m1 = getMotivoName(item.CODMOTIVO_PARA) || "";
            const m2 = getMotivoName(item.CODMOTIVO_RETORNO_PARA) || "";
            if (!(m1.includes('[INCLUSAO MANUAL]') || m2.includes('[INCLUSAO MANUAL]') || parseInt(item.CODMOTIVO_PARA) > 90 || parseInt(item.CODMOTIVO_RETORNO_PARA) > 90)) return false;
          } else if (currentModule === 'secoes') {
            const secName = getSecaoName(item.COLIGADA_PARA, item.FILIAL_PARA, item.CODIGO_PARA) || "";
            if (!secName.includes('[INCLUSAO MANUAL]')) return false;
          } else {
            return false;
          }
        }
        
        // 2. Filtro de Input do Usuário
        if (!val) return true;
        
        if (type === 'global') {
          // Busca geral customizada por tipo de módulo
          if (currentModule === 'eventos') {
            return (item.empresaDe || "").toLowerCase().includes(val) ||
                   (item.codigoDe || "").toLowerCase().includes(val) ||
                   (item.nomeDe || "").toLowerCase().includes(val) ||
                   (item.codigoPara || "").toLowerCase().includes(val) ||
                   (item.nomeRm || "").toLowerCase().includes(val);
          } else if (currentModule === 'coligadas') {
            return (item.EMP_CODIGO || "").toLowerCase().includes(val) ||
                   (item.NOME || "").toLowerCase().includes(val) ||
                   (item['RAZAO SOCIAL'] || "").toLowerCase().includes(val) ||
                   (item.CNPJ || "").toLowerCase().includes(val) ||
                   (item.CODCOLIGADA || "").toLowerCase().includes(val);
          } else if (currentModule === 'situacao') {
            return (item.CODIGO_DE || "").toLowerCase().includes(val) ||
                   (item.NOME_DE || "").toLowerCase().includes(val) ||
                   (item.CODSITUACAO_PARA || "").toLowerCase().includes(val) ||
                   (item.CODMOTIVO_PARA || "").toLowerCase().includes(val);
          } else {
            return (item.EMPRESA_DE || item['EMPRESA _DE'] || "").toLowerCase().includes(val) ||
                   (item.CODIGO_DE || "").toLowerCase().includes(val) ||
                   (item.NOME_DE || "").toLowerCase().includes(val) ||
                   (item.CODIGO_PARA || "").toLowerCase().includes(val) ||
                   (item.OBSERVACAO || "").toLowerCase().includes(val);
          }
        }
        else if (type === 'empresaDe') {
          const emp = item.empresaDe || item.EMPRESA_DE || item['EMPRESA _DE'] || item.EMP_CODIGO || "";
          return String(emp).toLowerCase() === val;
        }
        else if (type === 'tipoEvento') {
          return (item.tipoEvento || "").toLowerCase().includes(val.replace("b-", ""));
        }
        else if (type === 'status') {
          if (val === 'mapeado') return isMapped;
          if (val === 'nao_mapeado') return !isMapped;
          if (val === 'p_analise') return isPending;
        }
        else if (type === 'coligadaPara' || type === 'coligadaDest') {
          const col = item.coligadaPara || item.COLIGADA_PARA || item.CODCOLIGADA || "";
          return String(col).toLowerCase().includes(val);
        }
        else if (type === 'codigoPara' || type === 'codColigada') {
          return String(destCode).toLowerCase().includes(val);
        }
        else if (type === 'nomeRm' || type === 'nome') {
          const name = item.nomeRm || item.NOME || item.NOME_DE || "";
          return String(name).toLowerCase().includes(val);
        }
        else if (type === 'nomeDe' || type === 'nomeSecao') {
          const n = item.NOME_DE || item.nomeDe || item.NOME || "";
          return String(n).toLowerCase().includes(val);
        }
        else if (type === 'cnpj') {
          return (item.CNPJ || "").toLowerCase().includes(val);
        }
        else if (type === 'cbo') {
          return (item.CBO || "").toLowerCase().includes(val);
        }
        else if (type === 'observacao') {
          return (item.OBSERVACAO || item.observacao || "").toLowerCase().includes(val);
        }
        
        return true;
      });
      
      sortData();
      renderedCount = 40;
      renderTableContent();
    }

    function toggleSort(column) {
      if (sortColumn === column) {
        sortAscending = !sortAscending;
      } else {
        sortColumn = column;
        sortAscending = true;
      }
      
      document.querySelectorAll('.sort-indicator').forEach(ind => ind.innerText = '');
      const indicator = document.getElementById("sort-" + column);
      if (indicator) {
        indicator.innerText = sortAscending ? " ▲" : " ▼";
      }
      
      applyFilters();
    }

    function sortData() {
      if (sortColumn === 'rowNum') {
        filteredData.sort((a, b) => sortAscending ? a.rowNum - b.rowNum : b.rowNum - a.rowNum);
        return;
      }
      
      filteredData.sort((a, b) => {
        let valA = String(a[sortColumn] || '').toLowerCase();
        let valB = String(b[sortColumn] || '').toLowerCase();
        
        if (sortColumn === 'codigoDe' || sortColumn === 'empresaDe' || sortColumn === 'coligadaPara' || sortColumn === 'codigoPara') {
          let numA = parseInt(valA, 10);
          let numB = parseInt(valB, 10);
          if (!isNaN(numA) && !isNaN(numB)) {
            return sortAscending ? numA - numB : numB - numA;
          }
        }
        
        if (valA < valB) return sortAscending ? -1 : 1;
        if (valA > valB) return sortAscending ? 1 : -1;
        return 0;
      });
    }

    function isCodeIgnored(cod) {
      if (!cod) return false;
      const normalized = String(cod)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .trim()
        .toUpperCase();
      return normalized === "NAO IMPORTAR" || normalized === "P/ ANALISE";
    }

    // Retorna true se o código indica que o evento ainda precisa ser criado (não mapeado)
    function isCodeToCreate(cod) {
      if (!cod) return false;
      const norm = String(cod).trim().toUpperCase();
      return norm === "CRIAR" || norm === "A CRIAR" || norm === "CRIAR EVENTO";
    }

    function isCodePending(cod) {
      if (!cod) return false;
      const normalized = String(cod)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toUpperCase();
      return normalized === "P/ ANALISE";
    }

    function safeBtoa(str) {
      const bytes = new TextEncoder().encode(str);
      // Codificar Base64 em blocos pequenos para evitar limites do btoa() em arquivos grandes
      // Chunk de 32766 bytes (divisível por 3) garante que blocos intermediários não geram padding
      const CHUNK = 32766;
      let base64Result = '';
      for (let offset = 0; offset < bytes.length; offset += CHUNK) {
        const slice = bytes.subarray(offset, Math.min(offset + CHUNK, bytes.length));
        // Converter bytes para string binária em sub-blocos seguros para String.fromCharCode.apply
        let binaryStr = '';
        const SUB = 8192;
        for (let j = 0; j < slice.length; j += SUB) {
          binaryStr += String.fromCharCode.apply(null, slice.subarray(j, Math.min(j + SUB, slice.length)));
        }
        base64Result += btoa(binaryStr);
      }
      return base64Result;
    }

    // Dado um código de evento RM, retorna a descrição/nome buscando na lista rmEvents
    function getRmName(cod) {
      if (!cod || isCodeIgnored(cod) || isCodeToCreate(cod)) return '';
      const ev = rmEvents.find(e => e.codigo === cod || e.codigo === String(cod).padStart(4, '0'));
      return ev ? ev.descricao : '';
    }

    function getSituacaoName(cod) {
      if (!cod) return '';
      if (!rawJsonDatabase || !rawJsonDatabase.DADOS_RM_SITUACAO) return '';
      const codStr = String(cod).trim();
      const item = rawJsonDatabase.DADOS_RM_SITUACAO.find(s => String(s.CODCLIENTE).trim() === codStr);
      return item ? item.DESCRICAO : '';
    }

    function getSecaoName(coligada, filial, cod) {
      if (!cod || !rawJsonDatabase || !rawJsonDatabase.DADOS_RM_SECOES) return '';
      const codStr = String(cod).trim();
      const colStr = String(coligada || "1").trim();
      const filStr = String(filial || "1").trim();
      const item = rawJsonDatabase.DADOS_RM_SECOES.find(s => 
        String(s.COLIGADA).trim() === colStr && 
        String(s.FILIAL).trim() === filStr && 
        String(s.CODIGO).trim() === codStr
      );
      return item ? item.DESCRICAO : '';
    }

    function setSecaoRowAsPendingAnalysis(rowNum) {
      const el = document.getElementById(`edit-CODIGO_PARA-${rowNum}`);
      if (el) el.value = "P/ ANALISE";
    }

    function setSecaoRowAsNaoImportar(rowNum) {
      const el = document.getElementById(`edit-CODIGO_PARA-${rowNum}`);
      if (el) el.value = "NAO IMPORTAR";
    }

    function getSecoesOptionsHtml(currentVal, empresaDe, filialDe) {
      let html = `<option value="">-- Selecione a Seção --</option>`;
      if (!rawJsonDatabase || !rawJsonDatabase.DADOS_RM_SECOES) return html;
      
      let targetColigada = "1";
      let targetFilial = "1";

      if (empresaDe !== undefined && rawJsonDatabase.ZDEPARA_COLIGADAS) {
        const empNum = parseInt(empresaDe, 10);
        const mappedCol = rawJsonDatabase.ZDEPARA_COLIGADAS.find(c => {
          const cEmpNum = parseInt(c.EMPRESA_DE, 10);
          if (!isNaN(empNum) && !isNaN(cEmpNum)) {
            return cEmpNum === empNum;
          }
          return String(c.EMPRESA_DE).trim() === String(empresaDe).trim();
        });
        if (mappedCol && mappedCol.CODCOLIGADA) {
          targetColigada = String(mappedCol.CODCOLIGADA).trim();
          targetFilial = String(mappedCol.CODFILIAL_PARA || mappedCol.FILIAL_PARA || "1").trim();
        }
      }

      let secoes = rawJsonDatabase.DADOS_RM_SECOES;
      let filteredSecoes = secoes.filter(s => 
        String(s.COLIGADA).trim() === targetColigada && 
        String(s.FILIAL).trim() === targetFilial
      );

      if (filteredSecoes.length === 0) {
        filteredSecoes = secoes;
      }
      
      const parentCodes = new Set();
      filteredSecoes.forEach(s => {
        const parts = String(s.CODIGO).split('.');
        let prefix = "";
        for (let i = 0; i < parts.length - 1; i++) {
          prefix += (i > 0 ? "." : "") + parts[i];
          parentCodes.add(`${s.COLIGADA}_${s.FILIAL}_${prefix}`);
        }
      });

      filteredSecoes.forEach(s => {
        const key = `${s.COLIGADA}_${s.FILIAL}_${s.CODIGO}`;
        const isParent = parentCodes.has(key);
        const optionValue = `${s.COLIGADA}|${s.FILIAL}|${s.CODIGO}`;
        const isSelected = (optionValue === currentVal) ? "selected" : "";
        const cnpjText = s.CNPJ ? ` (CNPJ: ${s.CNPJ})` : '';
        const label = `[Col: ${s.COLIGADA} | Fil: ${s.FILIAL}] ${s.CODIGO} - ${s.DESCRICAO}${cnpjText}`;
        
        if (isParent) {
          html += `<option value="${optionValue}" disabled style="color:#a0aec0;">${label}</option>`;
        } else {
          html += `<option value="${optionValue}" ${isSelected}>${label}</option>`;
        }
      });
      
      const isPending = currentVal === "P/ ANALISE";
      const isNaoImportar = currentVal === "NAO IMPORTAR";

      html += `<option value="P/ ANALISE" ${isPending ? 'selected' : ''}>P/ ANÁLISE</option>`;
      html += `<option value="NAO IMPORTAR" ${isNaoImportar ? 'selected' : ''}>NÃO IMPORTAR</option>`;

      if (currentVal && currentVal.includes('|')) {
         const parts = currentVal.split('|');
         const secCode = parts[2] ? parts[2].trim() : '';
         if (secCode) {
           const fallbackKey = `${parts[0]}_${parts[1]}_${secCode}`;
           const exists = secoes.some(s => `${s.COLIGADA}_${s.FILIAL}_${s.CODIGO}` === fallbackKey);
           if (!exists) {
              html += `<option value="${currentVal}" selected>[Col: ${parts[0]} | Fil: ${parts[1]}] ${secCode} (Código Inexistente no RM)</option>`;
           }
         }
      }

      html += `<option value="NEW_MANUAL" style="font-weight: bold; color: var(--color-secondary);">+ Criar Nova Seção Manual</option>`;

      return html;
    }

    function getMotivoName(cod) {
      if (!cod) return '';
      if (!rawJsonDatabase || !rawJsonDatabase.DADOS_RM_MOTIVOS) return '';
      const codStr = String(cod).padStart(2, '0');
      const item = rawJsonDatabase.DADOS_RM_MOTIVOS.find(s => String(s.CODCLIENTE).padStart(2, '0') === codStr);
      return item ? item.DESCRICAO : '';
    }

    function getSituacaoOptionsHtml(selectedVal) {
      let html = `<option value="">-- Selecione --</option>`;
      if (rawJsonDatabase && rawJsonDatabase.DADOS_RM_SITUACAO) {
        rawJsonDatabase.DADOS_RM_SITUACAO.forEach(s => {
          const cod = String(s.CODCLIENTE).trim();
          const sel = (cod === String(selectedVal || "").trim()) ? 'selected' : '';
          html += `<option value="${cod}" ${sel}>${cod} - ${s.DESCRICAO}</option>`;
        });
      }
      return html;
    }

    function getMotivoOptionsHtml(selectedVal) {
      let html = `<option value="">-- Selecione --</option>`;
      if (rawJsonDatabase && rawJsonDatabase.DADOS_RM_MOTIVOS) {
        rawJsonDatabase.DADOS_RM_MOTIVOS.forEach(s => {
          const cod = String(s.CODCLIENTE).padStart(2, '0');
          const sel = (cod === String(selectedVal || "").padStart(2, '0')) ? 'selected' : '';
          html += `<option value="${cod}" ${sel}>${cod} - ${s.DESCRICAO}</option>`;
        });
      }
      html += `<option value="NEW">+ Criar Novo Motivo Manual</option>`;
      return html;
    }

    function normalizeEventType(type) {
      if (!type) return "";
      type = type.toUpperCase().replace(/\s/g, "");
      if (type.includes("PROV") || type === "P") return "PROVENTO";
      if (type.includes("DESC") || type === "D") return "DESCONTO";
      if (type.includes("BASE") || type.includes("CALC") || type === "B") return "BASE";
      return type;
    }

    function checkTypeCompatibility(legacyType, rmCode) {
      if (!rmCode || isCodeIgnored(rmCode)) {
        return { isMatch: true, rmType: "" };
      }
      
      const rmEvent = rmEvents.find(e => e.codigo === rmCode);
      if (!rmEvent) {
        return { isMatch: true, rmType: "" };
      }
      
      const rmType = rmEvent.tipo;
      const normLegacy = normalizeEventType(legacyType);
      const normRM = normalizeEventType(rmType);
      
      // Traduz o tipo abreviado para um nome completo amigável na tela
      let prettyType = rmType;
      const normRMVal = normRM;
      if (normRMVal === "PROVENTO") prettyType = "Provento";
      else if (normRMVal === "DESCONTO") prettyType = "Desconto";
      else if (normRMVal === "BASE") prettyType = "Base de Cálculo";
      
      return { 
        isMatch: (normLegacy === normRM), 
        rmType: prettyType,
        legacyNorm: normLegacy === "PROVENTO" ? "Provento" : (normLegacy === "DESCONTO" ? "Desconto" : "Base"),
        rmNorm: normRM === "PROVENTO" ? "Provento" : (normRM === "DESCONTO" ? "Desconto" : "Base")
      };
    }

    function renderTableContent() {
      const tbody = document.getElementById("tableBody");
      tbody.innerHTML = "";
      
      const total = filteredData.length;
      document.getElementById("tableCount").innerText = `${total} registros`;
      
      if (total === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--color-text-muted); padding: 32px;">Nenhum registro encontrado.</td></tr>`;
        return;
      }
      
      const itemsToRender = filteredData.slice(0, renderedCount);
      
      // Se não for o módulo de eventos, delegar para a renderização genérica inteligente
      if (currentModule !== 'eventos') {
        renderGenericTableContent(tbody, itemsToRender);
        return;
      }
      
      itemsToRender.forEach(item => {
        const isEditing = editingRowNumber === item.rowNum;
        const isExpanded = expandedRowNumbers.has(item.rowNum);
        
        const compatibility = checkTypeCompatibility(item.tipoEvento, item.codigoPara);
        
        let rowColorClass = "row-base";
        let typeBadge = "badge-base";
        
        // Tolerância de singular/plural nos tipos de evento de origem
        const tipoNorm = item.tipoEvento.toUpperCase();
        if (tipoNorm.includes("PROVENTO")) typeBadge = "badge-prov";
        else if (tipoNorm.includes("DESCONTO")) typeBadge = "badge-desc";
        
        if (isCodeToCreate(item.codigoPara)) {
          rowColorClass = "row-unmapped"; // CRIAR = não mapeado → laranja
        } else if (isCodeIgnored(item.codigoPara)) {
          if (String(item.codigoPara).toUpperCase().includes("ANALISE")) {
            rowColorClass = "row-panalise";
          } else {
            rowColorClass = "row-neutral row-nao-importar";
          }
        } else if (!item.codigoPara) {
          rowColorClass = "row-unmapped"; 
        } else if (!compatibility.isMatch) {
          rowColorClass = "row-mismatch"; 
        } else {
          if (tipoNorm.includes("PROVENTO")) rowColorClass = "row-provento";
          else if (tipoNorm.includes("DESCONTO")) rowColorClass = "row-desconto";
        }
        
        let mapBadge = "badge-mapped";
        let statusLabel = item.nomeRm || "MAPEADO";
        
        if (isCodeToCreate(item.codigoPara)) {
          mapBadge = "badge-unmapped";
          statusLabel = "CRIAR";
        } else if (isCodeIgnored(item.codigoPara)) {
          if (String(item.codigoPara).toUpperCase().includes("ANALISE")) {
            mapBadge = "badge-panalise";
            statusLabel = "P/ ANÁLISE";
          } else {
            mapBadge = "badge-nao-importar";
            statusLabel = "NÃO IMPORTAR";
          }
        } else if (!item.codigoPara) {
          mapBadge = "badge-unmapped";
          statusLabel = "PENDENTE";
        } else if (!compatibility.isMatch) {
          mapBadge = "badge-divergent";
          statusLabel = "DIVERGÊNCIA";
        }
        
        const tr = document.createElement("tr");
        tr.className = `row-item ${rowColorClass} ${isEditing ? 'row-editing' : ''} ${isExpanded ? 'row-expanded' : ''}`;
        
        let rmCellContent = `<span class="badge ${mapBadge}">${statusLabel}</span>`;
        if (item.codigoPara && !isCodeIgnored(item.codigoPara)) {
          const rmTypeLabel = compatibility.rmType ? ` | Tipo: ${compatibility.rmType}` : '';
          
          let mismatchSpan = '';
          if (item.hasDivergenciaDuplicidade) {
            mismatchSpan = ` <span style="color:var(--magenta); font-weight:700;" title="Este nome de evento legado está mapeado para mais de um código RM diferente!">(DIVERGÊNCIA DUPLICIDADE)</span>`;
          } else if (item.hasDivergenciaTipo || !compatibility.isMatch) {
            mismatchSpan = ` <span style="color:var(--magenta); font-weight:700;" title="O tipo de evento RM não condiz com o tipo legado!">(DIVERGÊNCIA TIPO: RM ${compatibility.rmNorm} vs Legado ${compatibility.legacyNorm})</span>`;
          }

          rmCellContent = `
            <div style="display:flex; flex-direction:column; gap:2px;">
              <span style="font-weight:600;">${getRmName(item.codigoPara) || item.nomeRm || ''}</span>
              <span style="font-size:0.75rem; color:var(--color-text-muted);">${rmTypeLabel}${mismatchSpan}</span>
            </div>
          `;
        }
        
        if (isEditing) {
          tr.innerHTML = `
            <td class="col-empresa-orig">${item.empresaDe}</td>
            <td class="col-codigo-orig"><code>${item.codigoDe}</code></td>
            <td class="col-nome-orig" title="${item.nomeDe}">${item.nomeDe}</td>
            <td class="col-tipo-orig" style="text-align: center;"><span class="badge ${typeBadge}">${item.tipoEvento}</span></td>
            
            <td class="col-coligada-rm">${item.coligadaPara || "1"}</td>
            
            <td class="col-codigo-rm" style="overflow: visible;">
              <div class="autocomplete-td-wrapper">
                <input type="text" id="edit-codigoPara-${item.rowNum}" class="input-field" style="padding: 6px; font-size: 0.8rem;" value="${item.codigoPara}" autocomplete="off" oninput="handleCodRmInput(this.value, ${item.rowNum})">
                <ul id="table-autocomplete-codigoPara-${item.rowNum}" class="table-autocomplete-list" style="display: none;"></ul>
              </div>
            </td>
            
            <td class="col-nome-rm">
              <input type="text" id="edit-nomeRm-${item.rowNum}" class="input-field" style="padding: 6px; font-size: 0.8rem;" value="${getRmName(item.codigoPara) || item.nomeRm || ''}" disabled>
            </td>
            
            <td class="col-acoes">
              <div class="action-icons">
                <button class="action-icon-btn" onclick="saveRowEdition(${item.rowNum})" title="Salvar Alterações" style="color: var(--success);">
                  <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
                </button>
                <button class="action-icon-btn" onclick="cancelRowEdition()" title="Cancelar" style="color: var(--danger);">
                  <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </td>
          `;
        } else {
          const arrowSymbol = isExpanded ? "▲" : "▼";
          tr.innerHTML = `
            <td class="col-empresa-orig" onclick="toggleRowExpansion(${item.rowNum})">${item.empresaDe}</td>
            <td class="col-codigo-orig" onclick="toggleRowExpansion(${item.rowNum})"><code>${item.codigoDe}</code></td>
            <td class="col-nome-orig" onclick="toggleRowExpansion(${item.rowNum})" title="${item.nomeDe}">${item.nomeDe}</td>
            <td class="col-tipo-orig" style="text-align: center;" onclick="toggleRowExpansion(${item.rowNum})"><span class="badge ${typeBadge}">${item.tipoEvento}</span></td>
            <td class="col-coligada-rm" onclick="toggleRowExpansion(${item.rowNum})">${item.coligadaPara || "-"}</td>
            <td class="col-codigo-rm" onclick="toggleRowExpansion(${item.rowNum})"><code>${item.codigoPara || "-"}</code></td>
            <td class="col-nome-rm" onclick="toggleRowExpansion(${item.rowNum})">${rmCellContent}</td>
            <td class="col-acoes">
              <div class="action-icons">
                <button class="action-icon-btn" onclick="toggleRowExpansion(${item.rowNum})" title="Ver Detalhes">
                  <span style="font-size: 0.8rem;">${arrowSymbol}</span>
                </button>
                <button class="action-icon-btn" onclick="startRowEdition(${item.rowNum})" title="Editar Mapeamento">
                  <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
              </div>
            </td>
          `;
        }
        
        tbody.appendChild(tr);
        
        if (isExpanded || isEditing) {
          const detailTr = document.createElement("tr");
          detailTr.className = "row-expanded-detail";
          
          let contentHtml = "";
          
          if (isEditing) {
            const duplicates = database.filter(i => 
              i.nomeDe.toLowerCase() === item.nomeDe.toLowerCase() && 
              i.tipoEvento === item.tipoEvento && 
              i.rowNum !== item.rowNum
            );
            
            const hasDuplicates = duplicates.length > 0;
            const bulkFillText = hasDuplicates ? `Aplicar este mapeamento para outros ${duplicates.length} eventos semelhantes com mesmo Nome e Tipo?` : '';
            const isFichaEnabled = "disabled";
            
            contentHtml = `
              <td colspan="8">
                <div class="detail-subrow-content">
                  <div class="detail-grid">
                    <div class="detail-field-group autocomplete-wrapper">
                      <span class="detail-label">Ficha Mês 1 - Código</span>
                      <input type="text" id="edit-ficha1-${item.rowNum}" class="input-field" value="${item.codigoParaFichaMes1}" ${isFichaEnabled} autocomplete="off" oninput="triggerTableAutocomplete(this.value, ${item.rowNum}, 'ficha1')">
                      <ul id="table-autocomplete-ficha1-${item.rowNum}" class="table-autocomplete-list" style="display: none;"></ul>
                    </div>
                    <div class="detail-field-group">
                      <span class="detail-label">Ficha Mês 1 - Nome RM</span>
                      <input type="text" id="edit-nomeFicha1-${item.rowNum}" class="input-field" value="${getRmName(item.codigoParaFichaMes1) || ''}" disabled>
                    </div>
                    
                    <div class="detail-field-group autocomplete-wrapper">
                      <span class="detail-label">Ficha Mês 2 - Código</span>
                      <input type="text" id="edit-ficha2-${item.rowNum}" class="input-field" value="${item.codigoParaFichaMes2}" ${isFichaEnabled} autocomplete="off" oninput="triggerTableAutocomplete(this.value, ${item.rowNum}, 'ficha2')">
                      <ul id="table-autocomplete-ficha2-${item.rowNum}" class="table-autocomplete-list" style="display: none;"></ul>
                    </div>
                    <div class="detail-field-group">
                      <span class="detail-label">Ficha Mês 2 - Nome RM</span>
                      <input type="text" id="edit-nomeFicha2-${item.rowNum}" class="input-field" value="${getRmName(item.codigoParaFichaMes2) || ''}" disabled>
                    </div>

                    <div class="detail-field-group autocomplete-wrapper">
                      <span class="detail-label">Verba Férias - Código</span>
                      <input type="text" id="edit-ferias-${item.rowNum}" class="input-field" value="${item.codigoParaVerbasFerias}" ${isFichaEnabled} autocomplete="off" oninput="triggerTableAutocomplete(this.value, ${item.rowNum}, 'ferias')">
                      <ul id="table-autocomplete-ferias-${item.rowNum}" class="table-autocomplete-list" style="display: none;"></ul>
                    </div>
                    <div class="detail-field-group">
                      <span class="detail-label">Verba Férias - Nome RM</span>
                      <input type="text" id="edit-nomeFerias-${item.rowNum}" class="input-field" value="${getRmName(item.codigoParaVerbasFerias) || ''}" disabled>
                    </div>
                  </div>
                  
                  <div class="detail-grid" style="grid-template-columns: 2fr 1fr;">
                    <div class="detail-field-group">
                      <span class="detail-label">Observações</span>
                      <input type="text" id="edit-obs-${item.rowNum}" class="input-field" value="${item.observacao}">
                    </div>
                    <div style="display:flex; align-items:center; gap: 8px; justify-content: flex-end; padding-top: 14px;">
                      <button class="row-btn row-btn-warning" onclick="setRowAsPendingAnalysis(${item.rowNum})">P/ Análise</button>
                      <button class="row-btn row-btn-secondary" onclick="setRowAsBaseCalculo(${item.rowNum})">Base Cálculo</button>
                    </div>
                  </div>
                  
                  <div class="detail-actions">
                    <div style="display: ${hasDuplicates ? 'flex' : 'none'}; align-items: center; gap: 8px;">
                      <input type="checkbox" id="edit-chkBulk-${item.rowNum}" style="width: 16px; height: 16px; cursor: pointer;">
                      <label for="edit-chkBulk-${item.rowNum}" style="font-size: 0.8rem; color: #6d28d9; font-weight: 600;">${bulkFillText}</label>
                    </div>
                    <div style="display: flex; gap: 8px; margin-left: auto;">
                      <button class="row-btn row-btn-secondary" onclick="cancelRowEdition()">Cancelar</button>
                      <button class="row-btn row-btn-primary" onclick="saveRowEdition(${item.rowNum})">Salvar Linha</button>
                    </div>
                  </div>
                </div>
              </td>
            `;
          } else {
            contentHtml = `
              <td colspan="8">
                <div class="detail-subrow-content">
                  <div class="detail-grid">
                    <div class="detail-field-group">
                      <span class="detail-label">Ficha Mês 1</span>
                      <div class="detail-value">${item.codigoParaFichaMes1 ? `${item.codigoParaFichaMes1}${getRmName(item.codigoParaFichaMes1) ? ' - ' + getRmName(item.codigoParaFichaMes1) : ''}` : '-'}</div>
                    </div>
                    <div class="detail-field-group">
                      <span class="detail-label">Ficha Mês 2</span>
                      <div class="detail-value">${item.codigoParaFichaMes2 ? `${item.codigoParaFichaMes2}${getRmName(item.codigoParaFichaMes2) ? ' - ' + getRmName(item.codigoParaFichaMes2) : ''}` : '-'}</div>
                    </div>
                    <div class="detail-field-group">
                      <span class="detail-label">Verbas Férias</span>
                      <div class="detail-value">${item.codigoParaVerbasFerias ? `${item.codigoParaVerbasFerias}${getRmName(item.codigoParaVerbasFerias) ? ' - ' + getRmName(item.codigoParaVerbasFerias) : ''}` : '-'}</div>
                    </div>
                    <div class="detail-field-group">
                      <span class="detail-label">Observações</span>
                      <div class="detail-value" style="white-space: normal;">${item.observacao || '-'}</div>
                    </div>
                  </div>
                </div>
              </td>
            `;
          }
          
          detailTr.innerHTML = contentHtml;
          tbody.appendChild(detailTr);
        }
      });
    }

    function renderGenericTableContent(tbody, itemsToRender) {
      itemsToRender.forEach(item => {
        const isEditing = editingRowNumber === item.rowNum;
        const isExpanded = expandedRowNumbers.has(item.rowNum) || isEditing;
        
        let rowColorClass = "row-base";
        let trHtml = "";
        
        // 1. Identificar Status/Badge do Destino para colorir a linha
        let destCode = "";
        if (currentModule === 'coligadas') {
          destCode = String(item.CODCOLIGADA || "").trim();
        } else if (currentModule === 'situacao') {
          destCode = String(item.CODSITUACAO_PARA || "").trim();
        } else {
          destCode = String(item.CODIGO_PARA || "").trim();
        }

        let mapBadge = "badge-mapped";
        let statusLabel = destCode || "MAPEADO";
        
        if (isCodeToCreate(destCode)) {
          rowColorClass = "row-unmapped";
          mapBadge = "badge-unmapped";
          statusLabel = "CRIAR";
        } else if (isCodeIgnored(destCode)) {
          if (String(destCode).toUpperCase().includes("ANALISE")) {
            rowColorClass = "row-panalise";
            mapBadge = "badge-panalise";
            statusLabel = "P/ ANÁLISE";
          } else {
            rowColorClass = "row-neutral row-nao-importar";
            mapBadge = "badge-nao-importar";
            statusLabel = "NÃO IMPORTAR";
          }
        } else if (!destCode) {
          rowColorClass = "row-unmapped";
          mapBadge = "badge-unmapped";
          statusLabel = "PENDENTE";
        } else if (item.hasDivergencia) {
          rowColorClass = "row-mismatch";
          mapBadge = "badge-divergent";
          statusLabel = destCode ? `DIVERGÊNCIA (${destCode})` : "DIVERGÊNCIA";
        }

        if (currentModule === 'secoes' && destCode && !isCodeIgnored(destCode) && !isCodeToCreate(destCode) && !item.hasDivergencia) {
          const sName = getSecaoName(item.COLIGADA_PARA, item.FILIAL_PARA, destCode);
          if (sName) {
            statusLabel = `[Col: ${item.COLIGADA_PARA || '1'} | Fil: ${item.FILIAL_PARA || '1'}] ${destCode} - ${sName}`;
          } else {
            statusLabel = `[Col: ${item.COLIGADA_PARA || '1'} | Fil: ${item.FILIAL_PARA || '1'}] ${destCode} - (Inválido/Inexistente)`;
            mapBadge = "badge-divergent";
          }
        }

        const tr = document.createElement("tr");
        tr.className = `row-item ${rowColorClass} ${isEditing ? 'row-editing' : ''} ${isExpanded ? 'row-expanded' : ''}`;
        
        // 2. Montar Colunas baseadas no módulo ativo
        if (isEditing) {
          if (currentModule === 'coligadas') {
            trHtml = `
              <td><code>${item.EMPRESA_DE || ''}</code></td>
              <td>${item.ID || ''}</td>
              <td>${item.NOME_DE || ''}</td>
              <td>
                <input type="text" id="edit-CNPJ-${item.rowNum}" class="input-field" style="padding: 6px; font-size: 0.8rem;" value="${item.CNPJ || ''}" placeholder="CNPJ / CPF">
              </td>
              <td style="overflow: visible;">
                <input type="text" id="edit-CODCOLIGADA-${item.rowNum}" class="input-field" style="padding: 6px; font-size: 0.8rem;" value="${item.CODCOLIGADA || ''}" autocomplete="off">
              </td>
              <td>
                <input type="text" id="edit-CODFILIAL_PARA-${item.rowNum}" class="input-field" style="padding: 6px; font-size: 0.8rem;" value="${item.CODFILIAL_PARA || ''}">
              </td>
              <td class="col-acoes">
                <div class="action-icons">
                  <button class="action-icon-btn" onclick="saveRowEdition(${item.rowNum})" title="Salvar Alterações" style="color: var(--success);"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></button>
                  <button class="action-icon-btn" onclick="cancelRowEdition()" title="Cancelar" style="color: var(--danger);"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg></button>
                </div>
              </td>
            `;
          } 
          else if (currentModule === 'funcoes') {
            trHtml = `
              <td class="col-funcao-emp"><code>${item.EMPRESA_DE || ''}</code></td>
              <td class="col-funcao-cod"><code>${item.CODIGO_DE || ''}</code></td>
              <td class="col-funcao-nome" title="${item.NOME_DE || ''}">${item.NOME_DE || ''}</td>
              <td class="col-funcao-cbo"><code>${item.CBO || ''}</code></td>
              <td class="col-funcao-coligada">
                <input type="text" id="edit-COLIGADA_PARA-${item.rowNum}" class="input-field" style="padding: 6px; font-size: 0.8rem;" value="${item.COLIGADA_PARA || '1'}">
              </td>
              <td class="col-funcao-codpara" style="overflow: visible;">
                <input type="text" id="edit-CODIGO_PARA-${item.rowNum}" class="input-field" style="padding: 6px; font-size: 0.8rem;" value="${item.CODIGO_PARA || ''}">
              </td>
              <td class="col-funcao-acoes">
                <div class="action-icons">
                  <button class="action-icon-btn" onclick="saveRowEdition(${item.rowNum})" title="Salvar Alterações" style="color: var(--success);"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></button>
                  <button class="action-icon-btn" onclick="cancelRowEdition()" title="Cancelar" style="color: var(--danger);"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg></button>
                </div>
              </td>
            `;
          } 
          else if (currentModule === 'sindicatos') {
            trHtml = `
              <td><code>${item.EMPRESA_DE || item['EMPRESA _DE'] || ''}</code></td>
              <td><code>${item.CODIGO_DE || ''}</code></td>
              <td>${item.NOME_DE || ''}</td>
              <td>${item.CNPJ || ''}</td>
              <td>
                <input type="text" id="edit-COLIGADA_PARA-${item.rowNum}" class="input-field" style="padding: 6px; font-size: 0.8rem;" value="${item.COLIGADA_PARA || '1'}">
              </td>
              <td style="overflow: visible;">
                <input type="text" id="edit-CODIGO_PARA-${item.rowNum}" class="input-field" style="padding: 6px; font-size: 0.8rem;" value="${item.CODIGO_PARA || ''}">
              </td>
              <td class="col-acoes">
                <div class="action-icons">
                  <button class="action-icon-btn" onclick="saveRowEdition(${item.rowNum})" title="Salvar Alterações" style="color: var(--success);"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></button>
                  <button class="action-icon-btn" onclick="cancelRowEdition()" title="Cancelar" style="color: var(--danger);"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg></button>
                </div>
              </td>
            `;
          } 
          else if (currentModule === 'secoes') {
            const currentVal = `${item.COLIGADA_PARA || '1'}|${item.FILIAL_PARA || '1'}|${item.CODIGO_PARA || ''}`;
            trHtml = `
              <td><code>[EMP: ${item.EMPRESA_DE || ''} | FILIAL: ${item.FILIAL_DE || ''}] COD_DE: ${item.CODIGO_DE || ''} | ${item.NOME_DE || ''}</code></td>
              <td style="overflow: visible;">
                <select id="edit-CODIGO_PARA-${item.rowNum}" class="input-field" style="padding: 6px; font-size: 0.8rem; width: 100%;" onchange="if(this.value==='NEW_MANUAL') createManualSecao(this, '${item.EMPRESA_DE}', '${item.FILIAL_DE}')">
                   ${getSecoesOptionsHtml(currentVal, item.EMPRESA_DE, item.FILIAL_DE)}
                </select>
              </td>
              <td class="col-acoes">
                <div class="action-icons">
                  <button class="action-icon-btn" onclick="saveRowEdition(${item.rowNum})" title="Salvar Alterações" style="color: var(--success);"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></button>
                  <button class="action-icon-btn" onclick="cancelRowEdition()" title="Cancelar" style="color: var(--danger);"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg></button>
                </div>
              </td>
            `;
          } 
          else if (currentModule === 'situacao') {
            trHtml = `
              <td><code>${item.CODIGO_DE || ''}</code></td>
              <td>${item.NOME_DE || ''}</td>
              <td>
                <select id="edit-CODSITUACAO_PARA-${item.rowNum}" class="input-field" style="padding: 6px; font-size: 0.8rem;">
                  ${getSituacaoOptionsHtml(item.CODSITUACAO_PARA)}
                </select>
              </td>
              <td>
                <select id="edit-CODMOTIVO_PARA-${item.rowNum}" class="input-field" style="padding: 6px; font-size: 0.8rem;" onchange="if(this.value==='NEW') createManualMotivo(this)">
                  ${getMotivoOptionsHtml(item.CODMOTIVO_PARA)}
                </select>
              </td>
              <td>
                <select id="edit-CODSITUACAO_RETORNO_PARA-${item.rowNum}" class="input-field" style="padding: 6px; font-size: 0.8rem;">
                  ${getSituacaoOptionsHtml(item.CODSITUACAO_RETORNO_PARA)}
                </select>
              </td>
              <td>
                <select id="edit-CODMOTIVO_RETORNO_PARA-${item.rowNum}" class="input-field" style="padding: 6px; font-size: 0.8rem;" onchange="if(this.value==='NEW') createManualMotivo(this)">
                  ${getMotivoOptionsHtml(item.CODMOTIVO_RETORNO_PARA)}
                </select>
              </td>
              <td class="col-acoes">
                <div class="action-icons">
                  <button class="action-icon-btn" onclick="saveRowEdition(${item.rowNum})" title="Salvar Alterações" style="color: var(--success);"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></button>
                  <button class="action-icon-btn" onclick="cancelRowEdition()" title="Cancelar" style="color: var(--danger);"><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg></button>
                </div>
              </td>
            `;
          }
        } 
        else {
          // Linha de Exibição normal
          const arrowSymbol = isExpanded ? "▲" : "▼";
          const actionButtons = `
            <div class="action-icons">
              <button class="action-icon-btn" onclick="toggleRowExpansion(${item.rowNum})" title="Ver Detalhes">
                <span style="font-size: 0.8rem;">${arrowSymbol}</span>
              </button>
              <button class="action-icon-btn" onclick="startRowEdition(${item.rowNum})" title="Editar Mapeamento">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              </button>
            </div>
          `;
          
          let badgeDest = `<span class="badge ${mapBadge}">${statusLabel}</span>`;

          if (currentModule === 'coligadas') {
            trHtml = `
              <td onclick="toggleRowExpansion(${item.rowNum})"><code>${item.EMPRESA_DE || ''}</code></td>
              <td onclick="toggleRowExpansion(${item.rowNum})">${item.ID || ''}</td>
              <td onclick="toggleRowExpansion(${item.rowNum})">${item.NOME_DE || ''}</td>
              <td onclick="toggleRowExpansion(${item.rowNum})">${item.CNPJ || ''}</td>
              <td onclick="toggleRowExpansion(${item.rowNum})">${badgeDest}</td>
              <td onclick="toggleRowExpansion(${item.rowNum})"><code>${item.CODFILIAL_PARA || ''}</code></td>
              <td>${actionButtons}</td>
            `;
          } 
          else if (currentModule === 'funcoes') {
            trHtml = `
              <td class="col-funcao-emp" onclick="toggleRowExpansion(${item.rowNum})"><code>${item.EMPRESA_DE || ''}</code></td>
              <td class="col-funcao-cod" onclick="toggleRowExpansion(${item.rowNum})"><code>${item.CODIGO_DE || ''}</code></td>
              <td class="col-funcao-nome" onclick="toggleRowExpansion(${item.rowNum})" title="${item.NOME_DE || ''}">${item.NOME_DE || ''}</td>
              <td class="col-funcao-cbo" onclick="toggleRowExpansion(${item.rowNum})"><code>${item.CBO || ''}</code></td>
              <td class="col-funcao-coligada" onclick="toggleRowExpansion(${item.rowNum})">${item.COLIGADA_PARA || item.coligadaPara || '1'}</td>
              <td class="col-funcao-codpara" onclick="toggleRowExpansion(${item.rowNum})">${badgeDest}</td>
              <td class="col-funcao-acoes">${actionButtons}</td>
            `;
          } 
          else if (currentModule === 'sindicatos') {
            trHtml = `
              <td onclick="toggleRowExpansion(${item.rowNum})"><code>${item.EMPRESA_DE || item['EMPRESA _DE'] || ''}</code></td>
              <td onclick="toggleRowExpansion(${item.rowNum})"><code>${item.CODIGO_DE || ''}</code></td>
              <td onclick="toggleRowExpansion(${item.rowNum})">${item.NOME_DE || ''}</td>
              <td onclick="toggleRowExpansion(${item.rowNum})">${item.CNPJ || ''}</td>
              <td onclick="toggleRowExpansion(${item.rowNum})">${item.COLIGADA_PARA || ''}</td>
              <td onclick="toggleRowExpansion(${item.rowNum})">${badgeDest}</td>
              <td>${actionButtons}</td>
            `;
          } 
          else if (currentModule === 'secoes') {
            const hasObs = !!(item.OBSERVACAO || item.observacao);
            const obsIcon = hasObs ? `<span title="Possui observação" style="margin-left: 6px; cursor: pointer; font-size: 1.1em;">💬</span>` : '';
            trHtml = `
              <td onclick="toggleRowExpansion(${item.rowNum})"><code>[EMP: ${item.EMPRESA_DE || ''} | FILIAL: ${item.FILIAL_DE || ''}] COD_DE: ${item.CODIGO_DE || ''} | ${item.NOME_DE || ''}</code></td>
              <td onclick="toggleRowExpansion(${item.rowNum})">${badgeDest}${obsIcon}</td>
              <td>${actionButtons}</td>
            `;
          } 
          else if (currentModule === 'situacao') {
            const sitParaName = getSituacaoName(item.CODSITUACAO_PARA);
            const motParaName = getMotivoName(item.CODMOTIVO_PARA);
            const sitRetName = getSituacaoName(item.CODSITUACAO_RETORNO_PARA);
            const motRetName = getMotivoName(item.CODMOTIVO_RETORNO_PARA);
            
            trHtml = `
              <td onclick="toggleRowExpansion(${item.rowNum})"><code>${item.CODIGO_DE || ''}</code></td>
              <td onclick="toggleRowExpansion(${item.rowNum})">${item.NOME_DE || ''}</td>
              <td onclick="toggleRowExpansion(${item.rowNum})">
                ${item.CODSITUACAO_PARA ? `<code>${item.CODSITUACAO_PARA}</code> <span style="font-size:0.75rem; color:#64748b;">${sitParaName}</span>` : ''}
              </td>
              <td onclick="toggleRowExpansion(${item.rowNum})">
                ${item.CODMOTIVO_PARA ? `<code>${item.CODMOTIVO_PARA}</code> <span style="font-size:0.75rem; color:#64748b;">${motParaName}</span>` : ''}
              </td>
              <td onclick="toggleRowExpansion(${item.rowNum})">
                ${item.CODSITUACAO_RETORNO_PARA ? `<code>${item.CODSITUACAO_RETORNO_PARA}</code> <span style="font-size:0.75rem; color:#64748b;">${sitRetName}</span>` : ''}
              </td>
              <td onclick="toggleRowExpansion(${item.rowNum})">
                ${item.CODMOTIVO_RETORNO_PARA ? `<code>${item.CODMOTIVO_RETORNO_PARA}</code> <span style="font-size:0.75rem; color:#64748b;">${motRetName}</span>` : ''}
              </td>
              <td>${actionButtons}</td>
            `;
          }
        }

        tr.innerHTML = trHtml;
        tbody.appendChild(tr);

        // 3. Renderizar Sub-linha de Detalhes expandida
        if (isExpanded) {
          const detailTr = document.createElement("tr");
          detailTr.className = "row-expanded-detail";
          
          let colsCount = 6;
          if (currentModule === 'funcoes' || currentModule === 'sindicatos') colsCount = 7;
          if (currentModule === 'secoes') colsCount = 3;
          
          let detailHtml = `
            <p style="margin: 0; font-size: 0.85rem; color: var(--color-text-muted);">
              📍 Sem detalhes adicionais cadastrados para este de-para. As alterações principais devem ser feitas clicando no ícone de edição.
            </p>
          `;

          if (currentModule === 'funcoes') {
            const obsText = item.OBSERVACAO || item.observacao || "";
            if (isEditing) {
              detailHtml = `
                <div style="font-family: 'Outfit', sans-serif; font-size: 0.85rem; display: flex; flex-direction: column; gap: 8px; width: 100%; padding: 12px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px;">
                  <label style="font-weight: 600; color: var(--color-primary); display: flex; align-items: center; gap: 6px; margin: 0;">
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    Anotar Observação sobre a Função:
                  </label>
                  <textarea id="edit-OBSERVACAO-${item.rowNum}" class="input-field" style="padding: 10px; font-family: 'Outfit', sans-serif; font-size: 0.85rem; height: 75px; resize: vertical; border: 1px solid #e2e8f0; border-radius: 6px; outline: none; background: #fff;" placeholder="Insira anotações ou necessidades específicas do de-para desta função...">${obsText}</textarea>
                  <div style="display:flex; align-items:center; gap: 8px; justify-content: flex-end; padding-top: 8px;">
                    <button class="row-btn row-btn-warning" onclick="setFuncaoRowAsPendingAnalysis(${item.rowNum})">P/ Análise</button>
                    <button class="row-btn row-btn-secondary" onclick="setFuncaoRowAsBaseCalculo(${item.rowNum})">Não Importar</button>
                  </div>
                </div>
              `;
            } else {
              const obsLabel = obsText.trim() 
                ? `<div style="display:flex; flex-direction:column; gap:6px;">
                     <strong style="color: var(--color-primary); font-weight:600; display:flex; align-items:center; gap:6px;">
                       <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                       Observação Cadastrada:
                     </strong>
                     <span style="color: #475569; line-height: 1.4; white-space: pre-wrap;">${obsText}</span>
                   </div>` 
                : `<span style="font-style: italic; color: #94a3b8; display:flex; align-items:center; gap:6px;">
                     <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                     Nenhuma observação cadastrada para esta função. Clique no ícone de lápis para editar.
                   </span>`;
              detailHtml = `
                <div style="font-family: 'Outfit', sans-serif; font-size: 0.85rem; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #f1f5f9; width: 100%;">
                  ${obsLabel}
                </div>
              `;
            }
          } else if (currentModule === 'secoes') {
            const obsText = item.OBSERVACAO || item.observacao || "";
            if (isEditing) {
              detailHtml = `
                <div style="font-family: 'Outfit', sans-serif; font-size: 0.85rem; display: flex; flex-direction: column; gap: 8px; width: 100%; padding: 12px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px;">
                  <label style="font-weight: 600; color: var(--color-primary); display: flex; align-items: center; gap: 6px; margin: 0;">
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    Anotar Observação sobre a Seção:
                  </label>
                  <textarea id="edit-OBSERVACAO-${item.rowNum}" class="input-field" style="padding: 10px; font-family: 'Outfit', sans-serif; font-size: 0.85rem; height: 75px; resize: vertical; border: 1px solid #e2e8f0; border-radius: 6px; outline: none; background: #fff;" placeholder="Insira justificativas ou observações sobre o mapeamento desta seção...">${obsText}</textarea>
                  <div style="display:flex; align-items:center; gap: 8px; justify-content: flex-end; padding-top: 8px;">
                    <button class="row-btn row-btn-warning" onclick="setSecaoRowAsPendingAnalysis(${item.rowNum})">P/ Análise</button>
                    <button class="row-btn row-btn-secondary" onclick="setSecaoRowAsNaoImportar(${item.rowNum})">Não Importar</button>
                  </div>
                </div>
              `;
            } else {
              const obsLabel = obsText.trim() 
                ? `<div style="display:flex; flex-direction:column; gap:6px;">
                     <strong style="color: var(--color-primary); font-weight:600; display:flex; align-items:center; gap:6px;">
                       <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                       Observação Cadastrada:
                     </strong>
                     <span style="color: #475569; line-height: 1.4; white-space: pre-wrap;">${obsText}</span>
                   </div>` 
                : `<span style="font-style: italic; color: #94a3b8; display:flex; align-items:center; gap:6px;">
                     <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                     Nenhuma observação cadastrada para esta seção. Clique no ícone de lápis para editar.
                   </span>`;
              detailHtml = `
                <div style="font-family: 'Outfit', sans-serif; font-size: 0.85rem; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #f1f5f9; width: 100%;">
                  ${obsLabel}
                </div>
              `;
            }
          }


          // Adicionar campos customizados (extras)
          let customFieldsHtml = '';
          const modKey = (currentModule.startsWith('dados_rm_') ? currentModule.toUpperCase() : 'ZDEPARA_' + currentModule.toUpperCase());
          const official = OFFICIAL_HEADERS[modKey] || [];
          const ignoreKeys = [
            'rowNum', 'codigoParaFichaMes1', 'codigoParaFichaMes2', 'codigoParaVerbasFerias', 
            'observacao', 'OBSERVACAO', 'coligadaPara', 'COLIGADA_PARA', 'codigoPara', 'CODIGO_PARA',
            'hasDivergencia', 'hasDivergenciaDuplicidade', 'hasDivergenciaTipo', 'isOrphan', 'nomeRm'
          ];
          
          Object.keys(item).forEach(k => {
            if (!official.includes(k) && !ignoreKeys.includes(k)) {
              const val = item[k];
              if (val !== undefined && val !== null) {
                if (isEditing) {
                  customFieldsHtml += `<div style="display:flex; flex-direction:column; gap:4px;">
                    <label style="font-size:0.75rem; color:#64748b; font-weight:600;">${k}</label>
                    <input type="text" class="input-field" id="edit-custom-${k}-${item.rowNum}" value="${val}" style="padding:6px; font-size:0.8rem; border:1px solid #cbd5e1; border-radius:4px;">
                  </div>`;
                } else {
                  customFieldsHtml += `<div style="background:#fff; border:1px solid #e2e8f0; padding:8px; border-radius:6px; min-width:120px;">
                    <div style="font-size:0.7rem; color:#94a3b8; font-weight:600; text-transform:uppercase; margin-bottom:4px;">${k}</div>
                    <div style="font-size:0.85rem; color:#334155;">${val}</div>
                  </div>`;
                }
              }
            }
          });
          
          if (customFieldsHtml) {
            const containerStyle = isEditing ? 'display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:12px; margin-top:16px; padding-top:16px; border-top:1px dashed #cbd5e1;' : 'display:flex; flex-wrap:wrap; gap:12px; margin-top:16px; padding-top:16px; border-top:1px dashed #cbd5e1;';
            detailHtml += `<div style="${containerStyle}">
              <div style="flex-basis:100%; font-weight:600; color:var(--bg-primary); font-size:0.85rem; margin-bottom:4px;">Campos Customizados</div>
              ${customFieldsHtml}
            </div>`;
          }
          detailTr.innerHTML = `
            <td colspan="${colsCount}">
              <div class="detail-subrow-content">
                ${detailHtml}
              </div>
            </td>
          `;
          tbody.appendChild(detailTr);
        }
      });
    }

    function handleTableScroll() {
      const wrapper = document.getElementById("scrollableTableWrapper");
      if (wrapper.scrollHeight - wrapper.scrollTop - wrapper.clientHeight < 50) {
        if (renderedCount < filteredData.length) {
          renderedCount += renderChunkSize;
          renderTableContent();
        }
      }
    }

    function toggleRowExpansion(rowNum) {
      if (editingRowNumber === rowNum) return;
      
      if (expandedRowNumbers.has(rowNum)) {
        expandedRowNumbers.delete(rowNum);
      } else {
        expandedRowNumbers.add(rowNum);
      }
      renderTableContent();
    }

    function startRowEdition(rowNum) {
      cancelRowEdition();
      editingRowNumber = rowNum;
      expandedRowNumbers.add(rowNum);
      renderTableContent();
    }

    function cancelRowEdition() {
      if (editingRowNumber !== null) {
        expandedRowNumbers.delete(editingRowNumber);
        editingRowNumber = null;
        renderTableContent();
      }
    }

    function setRowAsPendingAnalysis(rowNum) {
      document.getElementById(`edit-codigoPara-${rowNum}`).value = "P/ ANALISE";
      document.getElementById(`edit-nomeRm-${rowNum}`).value = "P/ ANALISE";
      toggleFichaInputs(rowNum, "P/ ANALISE");
    }

    function setRowAsBaseCalculo(rowNum) {
      document.getElementById(`edit-codigoPara-${rowNum}`).value = "NAO IMPORTAR";
      document.getElementById(`edit-nomeRm-${rowNum}`).value = "NAO IMPORTAR";
      toggleFichaInputs(rowNum, "NAO IMPORTAR");
    }

    function setFuncaoRowAsPendingAnalysis(rowNum) {
      const el = document.getElementById(`edit-CODIGO_PARA-${rowNum}`);
      if (el) el.value = "P/ ANALISE";
    }

    function setFuncaoRowAsBaseCalculo(rowNum) {
      const el = document.getElementById(`edit-CODIGO_PARA-${rowNum}`);
      if (el) el.value = "NAO IMPORTAR";
    }

    function handleCodRmInput(val, rowNum) {
      triggerTableAutocomplete(val, rowNum, 'codigoPara');
      toggleFichaInputs(rowNum, val);
    }

    function toggleFichaInputs(rowNum, val) {
      const f1 = document.getElementById(`edit-ficha1-${rowNum}`);
      const f2 = document.getElementById(`edit-ficha2-${rowNum}`);
      const fer = document.getElementById(`edit-ferias-${rowNum}`);
      
      if (!f1 || !f2 || !fer) return;

      if (val === "0076") {
        f1.disabled = true;
        f2.disabled = true;
        fer.disabled = true;
        
        f1.value = "0076";
        f2.value = "0077";
        fer.value = "0040";
        
        updateFichaDescription(rowNum, "ficha1", "0076");
        updateFichaDescription(rowNum, "ficha2", "0077");
        updateFichaDescription(rowNum, "ferias", "0040");
      } else if (val === "0041") {
        f1.disabled = true;
        f2.disabled = true;
        fer.disabled = true;
        
        f1.value = "0041";
        f2.value = "0042";
        fer.value = "0038";
        
        updateFichaDescription(rowNum, "ficha1", "0041");
        updateFichaDescription(rowNum, "ficha2", "0042");
        updateFichaDescription(rowNum, "ferias", "0038");
      } else {
        f1.disabled = true;
        f2.disabled = true;
        fer.disabled = true;
        
        f1.value = "";
        f2.value = "";
        fer.value = "";
        
        document.getElementById(`edit-nomeFicha1-${rowNum}`).value = "";
        document.getElementById(`edit-nomeFicha2-${rowNum}`).value = "";
        document.getElementById(`edit-nomeFerias-${rowNum}`).value = "";
      }
    }

    function updateFichaDescription(rowNum, fieldType, code) {
      const rmEvent = rmEvents.find(e => e.codigo === code);
      const desc = rmEvent ? rmEvent.descricao : "";
      
      if (fieldType === "ficha1") {
        document.getElementById(`edit-nomeFicha1-${rowNum}`).value = desc;
      } else if (fieldType === "ficha2") {
        document.getElementById(`edit-nomeFicha2-${rowNum}`).value = desc;
      } else if (fieldType === "ferias") {
        document.getElementById(`edit-nomeFerias-${rowNum}`).value = desc;
      }
    }

    function triggerTableAutocomplete(val, rowNum, fieldType) {
      const listId = `table-autocomplete-${fieldType}-${rowNum}`;
      const listElement = document.getElementById(listId);
      listElement.innerHTML = "";
      
      let labelInputId = `edit-nomeRm-${rowNum}`;
      if (fieldType === "ficha1") labelInputId = `edit-nomeFicha1-${rowNum}`;
      if (fieldType === "ficha2") labelInputId = `edit-nomeFicha2-${rowNum}`;
      if (fieldType === "ferias") labelInputId = `edit-nomeFerias-${rowNum}`;
      
      if (isCodeIgnored(val)) {
        document.getElementById(labelInputId).value = val;
        listElement.style.display = "none";
        return;
      }
      
      if (!val || val.length < 1) {
        listElement.style.display = "none";
        document.getElementById(labelInputId).value = "";
        return;
      }
      
      const term = val.toLowerCase();
      const matches = rmEvents.filter(ev => 
        ev.codigo.toLowerCase().includes(term) || 
        ev.descricao.toLowerCase().includes(term)
      ).slice(0, 8);
      
      if (matches.length === 0) {
        const li = document.createElement("li");
        li.className = "table-autocomplete-item";
        li.innerHTML = `
          <span style="font-size:0.75rem; color:var(--color-text-muted);">Não encontrado. </span>
          <button type="button" class="row-btn" style="font-size:0.75rem; padding: 2px 6px;" onclick="openNewRMEventModalInRow(${rowNum}, '${fieldType}')">
            Criar Evento RM
          </button>
        `;
        listElement.appendChild(li);
      } else {
        matches.forEach(ev => {
          const li = document.createElement("li");
          li.className = "table-autocomplete-item";
          li.innerText = `${ev.codigo} - ${ev.descricao} (${ev.tipo})`;
          li.onclick = () => {
            document.getElementById(`edit-${fieldType}-${rowNum}`).value = ev.codigo;
            document.getElementById(labelInputId).value = ev.descricao;
            listElement.style.display = "none";
            
            if (fieldType === "codigoPara") {
              toggleFichaInputs(rowNum, ev.codigo);
            }
          };
          listElement.appendChild(li);
        });
      }
      
      listElement.style.display = "block";
    }

    function closeAllAutocompletes() {
      document.querySelectorAll('.table-autocomplete-list').forEach(list => {
        list.style.display = "none";
      });
    }

    let activeRowIdForNewEvent = null;
    let activeFieldTypeForNewEvent = "";
    
    function openNewRMEventModalInRow(rowNum, fieldType) {
      activeRowIdForNewEvent = rowNum;
      activeFieldTypeForNewEvent = fieldType;
      
      const item = database.find(i => i.rowNum === rowNum);
      document.getElementById("modalDesc").value = item ? item.nomeDe : "";
      
      if (item && item.tipoEvento === "D-DESCONTO") {
        document.getElementById("modalTipo").value = "DESCONTO";
      } else {
        document.getElementById("modalTipo").value = "PROVENTO";
      }
      
      closeAllAutocompletes();
      document.getElementById("newRMEventModal").style.display = "flex";
    }

    function closeModal(modalId) {
      document.getElementById(modalId).style.display = "none";
    }


    function openGitHubConfigModal() {
      document.getElementById("ghTokenInput").value = localStorage.getItem("gh_pat") || "";
      document.getElementById("ghOwnerInput").value = localStorage.getItem("gh_owner") || "TOTVSGustavoFerreira";
      document.getElementById("ghRepoInput").value = localStorage.getItem("gh_repo") || "portal-depara-navarro";
      document.getElementById("githubConfigModal").style.display = "flex";
    }

    function unlockGitHubConfig() {
      const pass = prompt("Digite a senha do projeto para desbloquear as configurações:");
      if (pass === "TOTVS_DEPARA_2026") {
        document.getElementById("githubConfigWrapper").style.display = "flex";
        document.getElementById("githubConfigUnlockBtn").style.display = "none";
        showToast("Configurações do GitHub desbloqueadas com sucesso!", "success");
      } else {
        if (pass !== null) {
          showToast("Senha incorreta!", "error");
        }
      }
    }

    function toggleTokenVisibility() {
      const input = document.getElementById("wrapperGhTokenInput") || document.getElementById("ghTokenInput");
      if (input.type === "password") {
        input.type = "text";
      } else {
        input.type = "password";
      }
    }

    function saveGitHubConfig() {
      const isModal = document.getElementById("githubConfigModal") && document.getElementById("githubConfigModal").style.display !== "none";
      
      const token = isModal ? document.getElementById("ghTokenInput").value.trim() : document.getElementById("wrapperGhTokenInput").value.trim();
      const owner = isModal ? document.getElementById("ghOwnerInput").value.trim() : document.getElementById("wrapperGhOwnerInput").value.trim();
      const repo = isModal ? document.getElementById("ghRepoInput").value.trim() : document.getElementById("wrapperGhRepoInput").value.trim();
      
      localStorage.setItem("gh_pat", token);
      localStorage.setItem("gh_owner", owner);
      localStorage.setItem("gh_repo", repo);
      
      // Se houver um modal com as configs do Github, tentar fechar
      const modal = document.getElementById("githubConfigModal");
      if (modal) closeModal("githubConfigModal");
      
      showToast("Configurações do GitHub salvas com sucesso!", "success");
    }

    function commitChangesToGitHub(commitMessage, updatedDatabaseCallback, onSuccessCallback, fileCategory = 'all') {
      const pat = localStorage.getItem("gh_pat");
      const owner = localStorage.getItem("gh_owner") || "TOTVSGustavoFerreira";
      const repo = localStorage.getItem("gh_repo") || "portal-depara-navarro";
      
      if (!pat) {
        hideLoading();
        showToast("Por favor, configure o Token de Acesso do GitHub (ícone de engrenagem) para salvar alterações.", "error");
        openGitHubConfigModal();
        return;
      }
      
      let clientKey = SPREADSHEET_ID.toLowerCase();
      if (SPREADSHEET_ID.includes("docs.google.com")) {
        const matches = SPREADSHEET_ID.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (matches) clientKey = matches[1].toLowerCase();
      }

      // Aplicar as mudanças na memória antes de gerar os arquivos
      if (typeof updatedDatabaseCallback === 'function') {
        updatedDatabaseCallback();
      }

      rawJsonDatabase.config = rawJsonDatabase.config || {};
      rawJsonDatabase.config.ultimo_sincronismo = new Date().toISOString();
      
      // Categorias mapeadas
      const DB_SCHEMAS = {
        base: ['config', 'DADOS_RM_EVENTOS', 'DADOS_RM_SITUACAO', 'DADOS_RM_MOTIVOS', 'DADOS_RM_SECOES'],
        eventos_horarios: ['ZDEPARA_EVENTOS', 'ZDEPARA_HORARIO'],
        cadastros: [
          'ZDEPARA_COLIGADAS', 'ZDEPARA_FUNCOES', 'ZDEPARA_SINDICATOS', 'ZDEPARA_SECOES', 
          'ZDEPARA_SITUACAO', 'ZDEPARA_PERIODO_FOLHA', 'ZDEPARA_BANCOS', 'ZDEPARA_MOTIVO_FUNCAO', 
          'ZDEPARA_MOTIVO_SALARIO', 'ZDEPARA_MOTIVO_SECAO'
        ]
      };

      const categoriesToSave = fileCategory === 'all' ? Object.keys(DB_SCHEMAS) : [fileCategory];
      
      // Validação: não permitir salvar parcialmente no modo particionado se a base for monolítica
      if (rawJsonDatabase._sha && rawJsonDatabase._sha.monolith) {
         if (fileCategory !== 'all') {
           showToast("Sincronização abortada: Você está usando o banco antigo monolítico. Por favor, re-importe a planilha do Excel uma vez para converter o banco para o novo formato de alta performance.", "error");
           hideLoading();
           return;
         } else {
           // Se for 'all', significa que estamos migrando agora (ex: na importação)!
           // Então removemos a flag de monolith para não bloquear os próximos salvamentos
           delete rawJsonDatabase._sha.monolith;
         }
      }

      // Criar payload para cada categoria
      let payloads = [];
      try {
        payloads = categoriesToSave.map(cat => {
          const subset = {};
          DB_SCHEMAS[cat].forEach(key => {
            if (rawJsonDatabase[key] !== undefined) {
              subset[key] = rawJsonDatabase[key];
            }
          });
          const fileContent = JSON.stringify(subset, null, 2);
          
          if (cat === 'base' && fileContent.length < 50) {
             throw new Error("Arquivo base gerado está muito pequeno/corrompido");
          }
          
          return {
            cat: cat,
            filePath: `data/${clientKey}_${cat}.json`,
            contentBase64: safeBtoa(fileContent),
            sha: (rawJsonDatabase._sha && typeof rawJsonDatabase._sha === 'object') ? rawJsonDatabase._sha[cat] : null
          };
        });
      } catch(e) {
        hideLoading();
        showToast("Erro na preparação dos arquivos: " + e.message, "error");
        return;
      }

      const commitFile = (payload) => {
        const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${payload.filePath}`;
        
        const doPut = (shaToUse) => {
          return fetch(putUrl, {
            method: "PUT",
            headers: {
              "Authorization": `token ${pat}`,
              "Content-Type": "application/json",
              "Accept": "application/vnd.github.v3+json"
            },
            body: JSON.stringify({
              message: commitMessage,
              content: payload.contentBase64,
              sha: shaToUse
            })
          }).then(res => {
            if (!res.ok) return res.json().then(errData => { throw new Error(errData.message); });
            return res.json();
          }).then(response => {
            if (response.content && response.content.sha) {
              if (!rawJsonDatabase._sha || typeof rawJsonDatabase._sha !== 'object') rawJsonDatabase._sha = {};
              rawJsonDatabase._sha[payload.cat] = response.content.sha;
            }
          });
        };

        if (payload.sha) {
          return doPut(payload.sha).catch(err => {
            if (err.message && err.message.includes("does not match")) {
              const getUrl = `${putUrl}?t=${Date.now()}`;
              return fetch(getUrl, { headers: { "Authorization": `token ${pat}`, "Accept": "application/vnd.github.v3+json" } })
                .then(r => r.json())
                .then(info => doPut(info.sha));
            }
            throw err;
          });
        } else {
          // Arquivo novo ou faltando SHA em cache
          return doPut(null).catch(err => {
             // Se falhar porque ja existe mas nao tinhamos o SHA
             const getUrl = `${putUrl}?t=${Date.now()}`;
             return fetch(getUrl, { headers: { "Authorization": `token ${pat}`, "Accept": "application/vnd.github.v3+json" } })
                .then(r => { if(r.status === 404) return null; return r.json(); })
                .then(info => {
                  if (info && info.sha) return doPut(info.sha);
                  throw err;
                });
          });
        }
      };

      // Salvar sequencialmente para não estourar rate limit e não pesar muito no browser
      let promiseChain = Promise.resolve();
      payloads.forEach(p => {
        promiseChain = promiseChain.then(() => commitFile(p));
      });

      promiseChain.then(() => {
        hideLoading();
        showToast("Dados salvos e commitados no GitHub com sucesso!", "success");
        calculateLocalDiagnosticsAndStats();
        renderWarnings();
        updateDashboard();
        applyFilters();
        if (typeof onSuccessCallback === 'function') onSuccessCallback();
      }).catch(err => {
        hideLoading();
        showToast("Erro ao gravar no GitHub: " + err.message, "error");
      });
    }


    function deleteManualEvent(code) {
      showCustomConfirm(
        "Excluir Evento Manual",
        `Tem certeza que deseja excluir o evento criado código ${code}?`,
        function() {
          closeModal('diagnosticsModal');
          showLoading("Removendo evento manual...");
          
          commitChangesToGitHub(`Exclui evento manual ${code}`, () => {
            // Remover dos eventos RM cadastrados
            rmEvents = rmEvents.filter(ev => ev.codigo !== code);
            rawJsonDatabase.DADOS_RM_EVENTOS = rmEvents;
            
            // Limpar vínculos nas abas de de-para para consistência
            if (rawJsonDatabase.ZDEPARA_EVENTOS) {
              rawJsonDatabase.ZDEPARA_EVENTOS.forEach(item => {
                if (item.codigoPara === code) item.codigoPara = "";
                if (item.codigoParaFichaMes1 === code) item.codigoParaFichaMes1 = "";
                if (item.codigoParaFichaMes2 === code) item.codigoParaFichaMes2 = "";
                if (item.codigoParaVerbasFerias === code) item.codigoParaVerbasFerias = "";
              });
            }
          }, null, 'base');
        }
      );
    }

    function reorganizeSecoesManuais(targetColigada, targetFilial) {
      if (!rawJsonDatabase || !rawJsonDatabase.DADOS_RM_SECOES) return 0;

      const colStr = String(targetColigada || "1").trim();
      const filStr = String(targetFilial || "1").trim();

      const list = rawJsonDatabase.DADOS_RM_SECOES.filter(s => 
        String(s.COLIGADA).trim() === colStr && 
        String(s.FILIAL).trim() === filStr
      );

      const groups = {};
      list.forEach(s => {
        const parts = String(s.CODIGO).split('.');
        let parentPrefix = "";
        if (parts.length > 1) {
          const parentParts = parts.slice(0, parts.length - 1);
          parentPrefix = parentParts.join('.') + '.';
        }
        if (!groups[parentPrefix]) groups[parentPrefix] = [];
        groups[parentPrefix].push(s);
      });

      const codeMapping = {};

      Object.keys(groups).forEach(parentPrefix => {
        const groupSecs = groups[parentPrefix];
        const officialSecs = groupSecs.filter(s => !(String(s.DESCRICAO || "").includes("[INCLUSAO MANUAL]")));
        const manualSecs = groupSecs.filter(s => String(s.DESCRICAO || "").includes("[INCLUSAO MANUAL]"));

        if (manualSecs.length === 0) return;

        let maxOfficialSeq = 0;
        let padLen = 2;

        officialSecs.forEach(s => {
          const rest = parentPrefix ? String(s.CODIGO).substring(parentPrefix.length) : String(s.CODIGO);
          const seg = rest.split('.')[0];
          if (seg) {
            padLen = Math.max(padLen, seg.length);
            const num = parseInt(seg, 10);
            if (!isNaN(num) && num > maxOfficialSeq) maxOfficialSeq = num;
          }
        });

        manualSecs.sort((a, b) => {
          const restA = parentPrefix ? String(a.CODIGO).substring(parentPrefix.length) : String(a.CODIGO);
          const restB = parentPrefix ? String(b.CODIGO).substring(parentPrefix.length) : String(b.CODIGO);
          const numA = parseInt(restA, 10) || 0;
          const numB = parseInt(restB, 10) || 0;
          return numA - numB;
        });

        let currentSeq = maxOfficialSeq + 1;
        manualSecs.forEach(sec => {
          const oldCod = String(sec.CODIGO).trim();
          const nextSegment = String(currentSeq).padStart(padLen, '0');
          const newCod = `${parentPrefix}${nextSegment}`;
          if (oldCod !== newCod) {
            sec.CODIGO = newCod;
            codeMapping[`${colStr}_${filStr}_${oldCod}`] = newCod;
          }
          currentSeq++;
        });
      });

      if (Object.keys(codeMapping).length > 0 && rawJsonDatabase.ZDEPARA_SECOES) {
        rawJsonDatabase.ZDEPARA_SECOES.forEach(row => {
          const key = `${String(row.COLIGADA_PARA || '1').trim()}_${String(row.FILIAL_PARA || '1').trim()}_${String(row.CODIGO_PARA || '').trim()}`;
          if (codeMapping[key]) {
            row.CODIGO_PARA = codeMapping[key];
          }
        });
      }

      return Object.keys(codeMapping).length;
    }

    function triggerReorganizeSecoesManuais() {
      showCustomConfirm(
        "Reorganizar Numeração de Seções Manuais",
        "Deseja reorganizar sequencialmente os códigos de todas as seções manuais criadas para eliminar lacunas (gaps) na numeração? Os vínculos existentes na tabela De-Para serão atualizados automaticamente.",
        function() {
          showLoading("Reorganizando numeração das seções...");
          
          let totalAdjusted = 0;
          const uniqueCols = [...new Set((rawJsonDatabase.DADOS_RM_SECOES || []).map(s => String(s.COLIGADA || '1').trim()))];
          uniqueCols.forEach(col => {
            const uniqueFils = [...new Set((rawJsonDatabase.DADOS_RM_SECOES || []).filter(s => String(s.COLIGADA || '1').trim() === col).map(s => String(s.FILIAL || '1').trim()))];
            uniqueFils.forEach(fil => {
              totalAdjusted += reorganizeSecoesManuais(col, fil);
            });
          });

          commitChangesToGitHub("Reorganiza numeração sequencial das seções manuais", () => {
            showToast(`Reorganização concluída! ${totalAdjusted} seção(ões) tiveram a numeração ajustada sem deixar lacunas.`, "success");
            const modal = document.getElementById("diagnosticsModal");
            if (modal) modal.style.display = "none";
            calculateLocalDiagnosticsAndStats();
            renderWarnings();
            updateDashboard();
            applyFilters();
          }, null, 'base');
        }
      );
    }

    function deleteManualSecao(coligada, filial, codigo) {
      const colStr = String(coligada).trim();
      const filStr = String(filial).trim();
      const codStr = String(codigo).trim();

      showCustomConfirm(
        "Excluir Seção Manual",
        `Tem certeza que deseja excluir a seção manual [Col: ${colStr} | Fil: ${filStr}] ${codStr}? A numeração das seções manuais restantes será reorganizada automaticamente para evitar lacunas.`,
        function() {
          closeModal('diagnosticsModal');
          showLoading("Removendo seção manual e reorganizando códigos...");
          
          if (rawJsonDatabase && rawJsonDatabase.DADOS_RM_SECOES) {
            rawJsonDatabase.DADOS_RM_SECOES = rawJsonDatabase.DADOS_RM_SECOES.filter(s => 
              !(String(s.COLIGADA).trim() === colStr && String(s.FILIAL).trim() === filStr && String(s.CODIGO).trim() === codStr)
            );
          }

          if (rawJsonDatabase && rawJsonDatabase.ZDEPARA_SECOES) {
            rawJsonDatabase.ZDEPARA_SECOES.forEach(row => {
              if (String(row.COLIGADA_PARA || '1').trim() === colStr &&
                  String(row.FILIAL_PARA || '1').trim() === filStr &&
                  String(row.CODIGO_PARA || '').trim() === codStr) {
                row.CODIGO_PARA = "";
              }
            });
          }

          reorganizeSecoesManuais(colStr, filStr);

          commitChangesToGitHub(`Exclui e reorganiza seções manuais após remoção de ${codStr}`, () => {
            showToast(`Seção manual ${codStr} excluída e numeração reorganizada com sucesso!`, "success");
            calculateLocalDiagnosticsAndStats();
            renderWarnings();
            updateDashboard();
            applyFilters();
          }, null, 'base');
        }
      );
    }

    function submitNewRMEvent() {
      const desc = document.getElementById("modalDesc").value.trim();
      const tipo = document.getElementById("modalTipo").value;
      
      if (!desc) return;
      
      closeModal('newRMEventModal');
      showLoading("Criando novo evento e atualizando mapeamento...");
      
      // Encontrar o maior código numérico absoluto (desprezando códigos não numéricos)
      const numericCodes = rmEvents
        .map(e => parseInt(e.codigo, 10))
        .filter(n => !isNaN(n))
        .sort((a,b) => a - b);
      
      let nextCode = 1;
      if (numericCodes.length > 0) {
        nextCode = numericCodes[numericCodes.length - 1] + 1;
      }
      
      const newCodeStr = String(nextCode).padStart(4, '0');
      const finalDesc = `[INCLUSAO MANUAL] ${desc}`;
      const rowNum = activeRowIdForNewEvent;
      const fieldType = activeFieldTypeForNewEvent;
      
      // Ler os dados atuais da linha em edição ANTES de fechar o modal
      const item = database.find(i => i.rowNum === rowNum);
      
      // COMMIT ÚNICO E ATÔMICO: Salva o novo evento RM + a linha De-Para de uma só vez
      commitChangesToGitHub(`Cria evento RM manual ${newCodeStr} e mapeia linha ${rowNum}`, () => {
        // 1. Adicionar o novo evento à base de apoio RM
        const newEv = {
          codigo: newCodeStr,
          descricao: finalDesc,
          tipo: tipo
        };
        rmEvents.push(newEv);
        rawJsonDatabase.DADOS_RM_EVENTOS = rmEvents;
        
        // 2. Atualizar a linha De-Para na base de dados local (rawJsonDatabase)
        if (item) {
          const idx = database.findIndex(i => i.rowNum === rowNum);
          if (idx !== -1) {
            if (fieldType === "codigoPara") {
              database[idx].codigoPara = newCodeStr;
              database[idx].nomeRm = finalDesc;
            } else if (fieldType === "ficha1") {
              database[idx].codigoParaFichaMes1 = newCodeStr;
            } else if (fieldType === "ficha2") {
              database[idx].codigoParaFichaMes2 = newCodeStr;
            } else if (fieldType === "ferias") {
              database[idx].codigoParaVerbasFerias = newCodeStr;
            }
          }
        }
        rawJsonDatabase.ZDEPARA_EVENTOS = database;
        
        // 3. Atualizar os campos visuais na tela para refletir o mapeamento feito
        const fieldId = `edit-${fieldType}-${rowNum}`;
        const labelId = `edit-nomeRm-${rowNum}`;
        const inputEl = document.getElementById(fieldId);
        const labelEl = document.getElementById(labelId);
        if (inputEl) inputEl.value = newCodeStr;
        if (labelEl) labelEl.value = finalDesc;
        
        if (fieldType === "codigoPara") {
          toggleFichaInputs(rowNum, newCodeStr);
        }
        
        // 4. Fechar a linha de edição (não precisa de segundo salvamento)
        editingRowNumber = null;
        expandedRowNumbers.delete(rowNum);
      });
    }

    function createManualMotivo(selectElement) {
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '0'; overlay.style.left = '0';
      overlay.style.width = '100vw'; overlay.style.height = '100vh';
      overlay.style.backgroundColor = 'rgba(0,0,0,0.6)';
      overlay.style.zIndex = '9999';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';
      overlay.style.backdropFilter = 'blur(4px)';
      
      const modal = document.createElement('div');
      modal.style.backgroundColor = 'var(--bg-secondary)';
      modal.style.padding = '24px';
      modal.style.borderRadius = 'var(--border-radius-md)';
      modal.style.width = '420px';
      modal.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
      modal.style.color = 'var(--color-text-light)';
      
      const title = document.createElement('h3');
      title.innerText = "Criar Novo Motivo Manual";
      title.style.marginBottom = '12px';
      
      const p = document.createElement('p');
      p.innerText = "Digite o nome da restrição (ex: AFASTAMENTO TEMPORARIO):";
      p.style.marginBottom = '16px'; 
      p.style.fontSize = '0.9rem';
      p.style.color = 'var(--color-text-muted)';
      
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'input-field';
      input.style.width = '100%'; input.style.marginBottom = '24px';
      
      const btnContainer = document.createElement('div');
      btnContainer.style.display = 'flex'; btnContainer.style.justifyContent = 'flex-end'; btnContainer.style.gap = '12px';
      
      const btnCancel = document.createElement('button');
      btnCancel.innerText = "Cancelar";
      btnCancel.className = 'btn';
      btnCancel.style.backgroundColor = 'transparent'; btnCancel.style.border = '1px solid rgba(255,255,255,0.2)';
      
      const btnSave = document.createElement('button');
      btnSave.innerText = "Criar e Aplicar";
      btnSave.className = 'btn btn-primary';
      
      btnContainer.appendChild(btnCancel); btnContainer.appendChild(btnSave);
      modal.appendChild(title); modal.appendChild(p); modal.appendChild(input); modal.appendChild(btnContainer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      
      input.focus();
      
      const closeModal = () => { document.body.removeChild(overlay); };
      
      btnCancel.onclick = () => {
        selectElement.value = "";
        closeModal();
      };
      
      btnSave.onclick = () => {
        const motivoName = input.value;
        if (!motivoName || !motivoName.trim()) {
          selectElement.value = "";
          closeModal();
          return;
        }
        
        if (!rawJsonDatabase.DADOS_RM_MOTIVOS) rawJsonDatabase.DADOS_RM_MOTIVOS = [];
        const motivos = rawJsonDatabase.DADOS_RM_MOTIVOS;

        let maxCod = 0;
        motivos.forEach(m => {
          const cod = parseInt(m.CODCLIENTE, 10);
          if (!isNaN(cod) && cod <= 90 && cod > maxCod) { maxCod = cod; }
        });

        const nextCod = String(maxCod + 1).padStart(2, '0');
        const finalName = `[INCLUSAO MANUAL] ${motivoName.trim().toUpperCase()}`;

        motivos.push({ CODCLIENTE: nextCod, DESCRICAO: finalName });

        // Atualiza todos os selects de motivo em tela para incluir a nova opção
        document.querySelectorAll('select[id^="edit-CODMOTIVO_"]').forEach(sel => {
          const opt = document.createElement('option');
          opt.value = nextCod;
          opt.text = `${nextCod} - ${finalName}`;
          // Inserir logo antes da última opção (que é "+ Criar Novo Motivo Manual")
          const newOptIndex = sel.options.length > 0 ? sel.options.length - 1 : 0;
          sel.add(opt, sel.options[newOptIndex]);
        });
        
        selectElement.value = nextCod;
        closeModal();
        
        showToast(`Motivo '${finalName}' criado com código ${nextCod}! Salvando na nuvem...`, "success");
        
        // Extrai a linha que deve ser salva
        const parts = selectElement.id.split('-');
        const rowNum = parseInt(parts[parts.length - 1], 10);
        
        // Primeiro salva a nova base de motivos na nuvem (categoria 'base')
        commitChangesToGitHub(`Criação de Motivo Manual: ${nextCod}`, () => {}, () => {
           // Só depois de salvar a base com sucesso (onSuccessCallback), dispara o salvamento da linha,
           // que chamará internamente outro commit para 'cadastros', evitando conflito de concorrência (409)
           if (!isNaN(rowNum)) {
              saveRowEdition(rowNum);
           }
        }, 'base');
      };
    }

    function createManualSecao(selectElement, empresaDe, filialDe) {
      if (!rawJsonDatabase) rawJsonDatabase = {};
      if (!rawJsonDatabase.DADOS_RM_SECOES) rawJsonDatabase.DADOS_RM_SECOES = [];

      let targetColigada = "1";
      let targetFilial = "1";

      if (empresaDe !== undefined && rawJsonDatabase.ZDEPARA_COLIGADAS) {
        const empNum = parseInt(empresaDe, 10);
        const mappedCol = rawJsonDatabase.ZDEPARA_COLIGADAS.find(c => {
          const cEmpNum = parseInt(c.EMPRESA_DE, 10);
          if (!isNaN(empNum) && !isNaN(cEmpNum)) {
            return cEmpNum === empNum;
          }
          return String(c.EMPRESA_DE).trim() === String(empresaDe).trim();
        });
        if (mappedCol && mappedCol.CODCOLIGADA) {
          targetColigada = String(mappedCol.CODCOLIGADA).trim();
          targetFilial = String(mappedCol.CODFILIAL_PARA || mappedCol.FILIAL_PARA || "1").trim();
        }
      }

      const secoesTarget = rawJsonDatabase.DADOS_RM_SECOES.filter(s => 
        String(s.COLIGADA).trim() === targetColigada && 
        String(s.FILIAL).trim() === targetFilial
      );

      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '0'; overlay.style.left = '0';
      overlay.style.width = '100vw'; overlay.style.height = '100vh';
      overlay.style.backgroundColor = 'rgba(0,0,0,0.6)';
      overlay.style.zIndex = '9999';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';
      overlay.style.backdropFilter = 'blur(4px)';
      
      const modal = document.createElement('div');
      modal.style.backgroundColor = 'var(--bg-secondary)';
      modal.style.padding = '24px';
      modal.style.borderRadius = 'var(--border-radius-md)';
      modal.style.width = '480px';
      modal.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
      modal.style.color = 'var(--color-text-light)';
      
      const title = document.createElement('h3');
      title.innerText = `Criar Nova Seção Manual [Col: ${targetColigada} | Fil: ${targetFilial}]`;
      title.style.marginBottom = '12px';

      const labelParent = document.createElement('label');
      labelParent.innerText = "1. Selecione o Nível Pai (Sintético):";
      labelParent.style.fontSize = '0.85rem'; labelParent.style.fontWeight = '600'; labelParent.style.display = 'block'; labelParent.style.marginBottom = '6px';

      const parentSelect = document.createElement('select');
      parentSelect.className = 'input-field';
      parentSelect.style.width = '100%'; parentSelect.style.padding = '8px'; parentSelect.style.marginBottom = '12px'; parentSelect.style.backgroundColor = '#1e293b'; parentSelect.style.color = '#fff';

      parentSelect.innerHTML = `<option value="">[ RAIZ ] - Criar nova estrutura principal</option>`;
      secoesTarget.forEach(s => {
        parentSelect.innerHTML += `<option value="${s.CODIGO}">${s.CODIGO} - ${s.DESCRICAO}</option>`;
      });

      const labelCod = document.createElement('label');
      labelCod.innerText = "2. Código Sugerido (Editável):";
      labelCod.style.fontSize = '0.85rem'; labelCod.style.fontWeight = '600'; labelCod.style.display = 'block'; labelCod.style.marginBottom = '6px';

      const inputCod = document.createElement('input');
      inputCod.type = 'text';
      inputCod.className = 'input-field';
      inputCod.style.width = '100%'; inputCod.style.padding = '8px'; inputCod.style.marginBottom = '12px'; inputCod.style.backgroundColor = '#fff'; inputCod.style.color = '#000';

      const labelDesc = document.createElement('label');
      labelDesc.innerText = "3. Descrição da Nova Seção:";
      labelDesc.style.fontSize = '0.85rem'; labelDesc.style.fontWeight = '600'; labelDesc.style.display = 'block'; labelDesc.style.marginBottom = '6px';

      const inputDesc = document.createElement('input');
      inputDesc.type = 'text';
      inputDesc.className = 'input-field';
      inputDesc.placeholder = "Ex: DEPARTAMENTO DE VENDAS";
      inputDesc.style.width = '100%'; inputDesc.style.padding = '8px'; inputDesc.style.marginBottom = '16px'; inputDesc.style.backgroundColor = '#fff'; inputDesc.style.color = '#000';

      function updateSuggestedCode() {
        const selectedVal = parentSelect.value;
        if (!selectedVal) {
          let maxRoot = 0;
          let padLen = 2;
          secoesTarget.forEach(s => {
            const rootPart = String(s.CODIGO).split('.')[0];
            padLen = Math.max(padLen, rootPart.length);
            const num = parseInt(rootPart, 10);
            if (!isNaN(num) && num > maxRoot) maxRoot = num;
          });
          const nextRoot = String(maxRoot + 1).padStart(padLen, '0');
          inputCod.value = nextRoot;
          return;
        }

        const directPrefix = selectedVal + '.';
        const hasChildren = secoesTarget.some(s => String(s.CODIGO).startsWith(directPrefix));

        let parentPrefix = "";
        if (hasChildren) {
          parentPrefix = directPrefix;
        } else {
          const parts = selectedVal.split('.');
          if (parts.length > 1) {
            parts.pop();
            parentPrefix = parts.join('.') + '.';
          } else {
            parentPrefix = "";
          }
        }

        if (!parentPrefix) {
          let maxRoot = 0;
          let padLen = 2;
          secoesTarget.forEach(s => {
            const rootPart = String(s.CODIGO).split('.')[0];
            padLen = Math.max(padLen, rootPart.length);
            const num = parseInt(rootPart, 10);
            if (!isNaN(num) && num > maxRoot) maxRoot = num;
          });
          inputCod.value = String(maxRoot + 1).padStart(padLen, '0');
          return;
        }

        const siblings = secoesTarget.filter(s => String(s.CODIGO).startsWith(parentPrefix));
        
        let maxSeq = 0;
        let padLen = 2;

        siblings.forEach(s => {
          const rest = String(s.CODIGO).substring(parentPrefix.length);
          const nextSegment = rest.split('.')[0];
          if (nextSegment) {
            padLen = Math.max(padLen, nextSegment.length);
            const num = parseInt(nextSegment, 10);
            if (!isNaN(num) && num > maxSeq) maxSeq = num;
          }
        });

        const nextSeq = String(maxSeq + 1).padStart(padLen, '0');
        inputCod.value = `${parentPrefix}${nextSeq}`;
      }

      parentSelect.onchange = updateSuggestedCode;
      updateSuggestedCode();

      const btnContainer = document.createElement('div');
      btnContainer.style.display = 'flex'; btnContainer.style.justifyContent = 'flex-end'; btnContainer.style.gap = '8px';
      
      const btnCancel = document.createElement('button');
      btnCancel.className = 'row-btn row-btn-secondary';
      btnCancel.innerText = 'Cancelar';
      
      const btnSave = document.createElement('button');
      btnSave.className = 'row-btn row-btn-primary';
      btnSave.innerText = 'Salvar Nova Seção';
      
      btnContainer.appendChild(btnCancel);
      btnContainer.appendChild(btnSave);
      
      modal.appendChild(title);
      modal.appendChild(labelParent);
      modal.appendChild(parentSelect);
      modal.appendChild(labelCod);
      modal.appendChild(inputCod);
      modal.appendChild(labelDesc);
      modal.appendChild(inputDesc);
      modal.appendChild(btnContainer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      
      const closeModal = () => { document.body.removeChild(overlay); };
      
      btnCancel.onclick = () => {
        selectElement.value = "";
        closeModal();
      };
      
      btnSave.onclick = () => {
        const newCod = inputCod.value ? inputCod.value.trim() : "";
        const newDesc = inputDesc.value ? inputDesc.value.trim() : "";

        if (!newCod || !newDesc) {
          showToast("Preencha o Código e a Descrição da nova seção.", "error");
          return;
        }

        const existsExact = secoesTarget.some(s => String(s.CODIGO).trim() === newCod);
        if (existsExact) {
          showToast(`Código duplicado! A seção '${newCod}' já existe nesta Coligada/Filial. Informe um código único.`, "error");
          return;
        }

        if (parentSelect.value && newCod === parentSelect.value) {
          showToast(`Você informou apenas o código da pasta pai (${newCod}). É necessário incluir a seção analítica completa.`, "error");
          return;
        }

        const finalDesc = `[INCLUSAO MANUAL] ${newDesc.toUpperCase()}`;

        rawJsonDatabase.DADOS_RM_SECOES.push({
          COLIGADA: targetColigada,
          FILIAL: targetFilial,
          CODIGO: newCod,
          DESCRICAO: finalDesc
        });

        const optionVal = `${targetColigada}|${targetFilial}|${newCod}`;

        document.querySelectorAll('select[id^="edit-CODIGO_PARA-"]').forEach(sel => {
          const opt = document.createElement('option');
          opt.value = optionVal;
          opt.text = `[Col: ${targetColigada} | Fil: ${targetFilial}] ${newCod} - ${finalDesc}`;
          const newOptIndex = sel.options.length > 0 ? sel.options.length - 1 : 0;
          sel.add(opt, sel.options[newOptIndex]);
        });

        selectElement.value = optionVal;
        closeModal();

        showToast(`Seção '${newCod} - ${finalDesc}' criada com sucesso!`, "success");

        const parts = selectElement.id.split('-');
        const rowNum = parseInt(parts[parts.length - 1], 10);

        commitChangesToGitHub(`Criação de Seção Manual: ${newCod}`, () => {}, () => {
           if (!isNaN(rowNum)) {
              saveRowEdition(rowNum, optionVal);
           }
        }, 'base');
      };
    }

    function saveRowEdition(rowNum, overrideOptionVal) {
      const item = database.find(i => i.rowNum === rowNum);
      if (!item) return;
      
      let updatedData = {};
      
      // Capturar todos os campos customizados editados
      const customInputs = document.querySelectorAll(`input[id^="edit-custom-"][id$="-${rowNum}"]`);
      customInputs.forEach(input => {
        const fieldName = input.id.split('-')[2];
        updatedData[fieldName] = input.value;
      });

      let commitMessage = `Atualiza de-para linha ${rowNum}`;
      
      if (currentModule === 'eventos') {
        const codigoPara = document.getElementById(`edit-codigoPara-${rowNum}`).value;
        const codigoParaFichaMes1 = document.getElementById(`edit-ficha1-${rowNum}`).value;
        const codigoParaFichaMes2 = document.getElementById(`edit-ficha2-${rowNum}`).value;
        const codigoParaVerbasFerias = document.getElementById(`edit-ferias-${rowNum}`).value;
        const observacao = document.getElementById(`edit-obs-${rowNum}`).value;
        const applyToAllMatches = document.getElementById(`edit-chkBulk-${rowNum}`)?.checked || false;
        
        updatedData = {
          coligadaPara: item.coligadaPara,
          COLIGADA_PARA: item.coligadaPara,
          codigoPara: codigoPara,
          CODIGO_PARA: codigoPara,
          codigoParaFichaMes1: codigoParaFichaMes1,
          CODIGO_PARA_FICHA_MES1: codigoParaFichaMes1,
          codigoParaFichaMes2: codigoParaFichaMes2,
          CODIGO_PARA_FICHA_MES2: codigoParaFichaMes2,
          codigoParaVerbasFerias: codigoParaVerbasFerias,
          CODIGO_PARA_VERBAS_FERIAS: codigoParaVerbasFerias,
          observacao: observacao,
          OBSERVACAO: observacao
        };

        commitMessage = `Atualiza mapeamento eventos linha ${rowNum} - ${item.nomeDe}`;

        showLoading("Salvando mapeamento...");
        commitChangesToGitHub(commitMessage, () => {
          const idx = database.findIndex(i => i.rowNum === rowNum);
          if (idx !== -1) {
            Object.assign(database[idx], updatedData);
          }
          
          if (applyToAllMatches) {
            database.forEach(otherItem => {
              if (otherItem.rowNum !== rowNum && 
                  otherItem.nomeDe === item.nomeDe && 
                  otherItem.tipoEvento === item.tipoEvento) {
                otherItem.codigoPara = codigoPara;
                otherItem.CODIGO_PARA = codigoPara;
                otherItem.codigoParaFichaMes1 = codigoParaFichaMes1;
                otherItem.CODIGO_PARA_FICHA_MES1 = codigoParaFichaMes1;
                otherItem.codigoParaFichaMes2 = codigoParaFichaMes2;
                otherItem.CODIGO_PARA_FICHA_MES2 = codigoParaFichaMes2;
                otherItem.codigoParaVerbasFerias = codigoParaVerbasFerias;
                otherItem.CODIGO_PARA_VERBAS_FERIAS = codigoParaVerbasFerias;
                otherItem.observacao = observacao;
                otherItem.OBSERVACAO = observacao;
              }
            });
          }
          rawJsonDatabase.ZDEPARA_EVENTOS = database;
          editingRowNumber = null;
          expandedRowNumbers.delete(rowNum);
        }, null, 'eventos_horarios');
      } 
      else if (currentModule === 'coligadas') {
        const codColigada = document.getElementById(`edit-CODCOLIGADA-${rowNum}`).value;
        const codFilialPara = document.getElementById(`edit-CODFILIAL_PARA-${rowNum}`).value;
        const cnpjVal = document.getElementById(`edit-CNPJ-${rowNum}`) ? document.getElementById(`edit-CNPJ-${rowNum}`).value : (item.CNPJ || '');
        updatedData = { CODCOLIGADA: codColigada, CODFILIAL_PARA: codFilialPara, CNPJ: cnpjVal };
        commitMessage = `Atualiza coligada linha ${rowNum} - ${item.NOME_DE || item.NOME || ''}`;

        showLoading("Salvando coligada...");
        commitChangesToGitHub(commitMessage, () => {
          const idx = database.findIndex(i => i.rowNum === rowNum);
          if (idx !== -1) Object.assign(database[idx], updatedData);
          rawJsonDatabase.ZDEPARA_COLIGADAS = database;
          editingRowNumber = null;
          expandedRowNumbers.delete(rowNum);
        }, null, 'cadastros');
      } 
      else if (currentModule === 'funcoes') {
        const coligadaPara = document.getElementById(`edit-COLIGADA_PARA-${rowNum}`).value;
        const codigoPara = document.getElementById(`edit-CODIGO_PARA-${rowNum}`).value;
        const observacao = document.getElementById(`edit-OBSERVACAO-${rowNum}`).value;
        updatedData = { 
          COLIGADA_PARA: coligadaPara, 
          coligadaPara: coligadaPara,
          CODIGO_PARA: codigoPara, 
          codigoPara: codigoPara,
          OBSERVACAO: observacao,
          observacao: observacao
        };
        commitMessage = `Atualiza função linha ${rowNum} - ${item.NOME_DE}`;

        showLoading("Salvando função...");
        commitChangesToGitHub(commitMessage, () => {
          const idx = database.findIndex(i => i.rowNum === rowNum);
          if (idx !== -1) Object.assign(database[idx], updatedData);
          rawJsonDatabase.ZDEPARA_FUNCOES = database;
          editingRowNumber = null;
          expandedRowNumbers.delete(rowNum);
        }, null, 'cadastros');
      } 
      else if (currentModule === 'sindicatos') {
        const coligadaPara = document.getElementById(`edit-COLIGADA_PARA-${rowNum}`).value;
        const codigoPara = document.getElementById(`edit-CODIGO_PARA-${rowNum}`).value;
        updatedData = { COLIGADA_PARA: coligadaPara, CODIGO_PARA: codigoPara };
        commitMessage = `Atualiza sindicato linha ${rowNum} - ${item.NOME_DE}`;

        showLoading("Salvando sindicato...");
        commitChangesToGitHub(commitMessage, () => {
          const idx = database.findIndex(i => i.rowNum === rowNum);
          if (idx !== -1) Object.assign(database[idx], updatedData);
          rawJsonDatabase.ZDEPARA_SINDICATOS = database;
          editingRowNumber = null;
          expandedRowNumbers.delete(rowNum);
        }, null, 'cadastros');
      } 
      else if (currentModule === 'secoes') {
        const aglutinadoEl = document.getElementById(`edit-CODIGO_PARA-${rowNum}`);
        const aglutinado = overrideOptionVal || (aglutinadoEl ? aglutinadoEl.value : '');
        const observacao = document.getElementById(`edit-OBSERVACAO-${rowNum}`) ? document.getElementById(`edit-OBSERVACAO-${rowNum}`).value : (item.OBSERVACAO || '');
        
        let coligadaPara = item.COLIGADA_PARA || '';
        let filialPara = item.FILIAL_PARA || '';
        let codigoPara = item.CODIGO_PARA || '';
        
        if (aglutinado && aglutinado.includes('|')) {
          const parts = aglutinado.split('|');
          coligadaPara = parts[0] || '';
          filialPara = parts[1] || '';
          codigoPara = parts[2] || '';
        } else if (aglutinado) {
          codigoPara = aglutinado;
        } else {
          codigoPara = '';
        }
        
        updatedData = { 
          COLIGADA_PARA: coligadaPara, 
          FILIAL_PARA: filialPara, 
          CODIGO_PARA: codigoPara,
          OBSERVACAO: observacao
        };
        commitMessage = `Atualiza seção linha ${rowNum} - ${item.NOME_DE}`;

        showLoading("Salvando seção...");
        commitChangesToGitHub(commitMessage, () => {
          const idx = database.findIndex(i => i.rowNum === rowNum);
          if (idx !== -1) Object.assign(database[idx], updatedData);
          rawJsonDatabase.ZDEPARA_SECOES = database;
          editingRowNumber = null;
          expandedRowNumbers.delete(rowNum);
        }, null, 'cadastros');
      } 
      else if (currentModule === 'situacao') {
        const codSituacao = document.getElementById(`edit-CODSITUACAO_PARA-${rowNum}`).value;
        const codMotivo = document.getElementById(`edit-CODMOTIVO_PARA-${rowNum}`).value;
        const codRetorno = document.getElementById(`edit-CODSITUACAO_RETORNO_PARA-${rowNum}`).value;
        const codMotivoRet = document.getElementById(`edit-CODMOTIVO_RETORNO_PARA-${rowNum}`).value;
        
        updatedData = { 
          CODSITUACAO_PARA: codSituacao, 
          CODMOTIVO_PARA: codMotivo,
          CODSITUACAO_RETORNO_PARA: codRetorno,
          CODMOTIVO_RETORNO_PARA: codMotivoRet
        };
        commitMessage = `Atualiza situação linha ${rowNum} - ${item.NOME_DE}`;

        showLoading("Salvando situação...");
        commitChangesToGitHub(commitMessage, () => {
          const idx = database.findIndex(i => i.rowNum === rowNum);
          if (idx !== -1) Object.assign(database[idx], updatedData);
          rawJsonDatabase.ZDEPARA_SITUACAO = database;
          editingRowNumber = null;
          expandedRowNumbers.delete(rowNum);
        }, null, 'cadastros');
      }
    }

let pendingImportContext = [];

    function openColumnMappingModal() {
      const selectedCheckboxes = document.querySelectorAll('input[name="importTabCheckbox"]:checked');
      if (selectedCheckboxes.length === 0) {
        showToast("Você precisa selecionar pelo menos uma aba para importar.", "error");
        return;
      }
      
      if (!rawJsonDatabase) rawJsonDatabase = {};
      if (!rawJsonDatabase.CONFIG_ALIASES) rawJsonDatabase.CONFIG_ALIASES = {};
      
      closeModal('importSelectionModal');
      
      const container = document.getElementById('columnMappingContainer');
      container.innerHTML = '';
      pendingImportContext = [];

      selectedCheckboxes.forEach(cb => {
        const key = cb.value;
        const sheetName = cb.getAttribute("data-sheetname");
        
        try {
          const ws = tempImportWorkbook.Sheets[sheetName];
          if (ws) {
            // Pegar apenas os headers (primeira linha)
            const headers = XLSX.utils.sheet_to_json(ws, { header: 1 })[0] || [];
            
            pendingImportContext.push({
              key,
              sheetName,
              excelHeaders: headers
            });
            
            const officialHeaders = OFFICIAL_HEADERS[key] || [];
            
            // Container para esta aba
            const abaBlock = document.createElement('div');
            abaBlock.className = 'mapping-aba-block';
            abaBlock.style.cssText = 'background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;';
            
            let html = `
              <div style="background: #f8fafc; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: var(--bg-primary); display: flex; justify-content: space-between; align-items: center;">
                <span>Aba: ${sheetName}</span>
                <span style="font-size: 0.75rem; color: #64748b; font-weight: normal;">${headers.length} colunas no Excel</span>
              </div>
              <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
            `;
            
            // Para cada header oficial, tentar achar a melhor correspondência (Fuzzy Match básico para pre-seleção)
            const mappedExcelHeaders = new Set();
            
            officialHeaders.forEach(off => {
              const cleanOff = off.toUpperCase().replace(/[\s_-]/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              let bestMatch = "";
              
              // Se tiver alias no config, dar preferencia
              if (rawJsonDatabase.CONFIG_ALIASES && rawJsonDatabase.CONFIG_ALIASES[key] && rawJsonDatabase.CONFIG_ALIASES[key][off]) {
                 bestMatch = rawJsonDatabase.CONFIG_ALIASES[key][off];
                 if (headers.includes(bestMatch)) {
                     mappedExcelHeaders.add(bestMatch);
                 } else {
                     bestMatch = ""; // não achou a coluna alias nessa planilha atual
                 }
              }
              
              // Se não achou por alias, tenta fuzzy
              if (!bestMatch) {
                for (let h of headers) {
                  const cleanH = h.toUpperCase().replace(/[\s_-]/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                  if (cleanOff === cleanH || cleanOff.includes(cleanH) || cleanH.includes(cleanOff)) {
                    bestMatch = h;
                    mappedExcelHeaders.add(h);
                    break;
                  }
                }
              }
              
              let options = `<option value="">-- Não Mapear (ficará em branco) --</option>`;
              headers.forEach(h => {
                options += `<option value="${h}" ${h === bestMatch ? 'selected' : ''}>${h}</option>`;
              });
              
              html += `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 0.85rem;">
                  <div style="flex: 1; color: #334155; font-weight: 500;">
                    ${off} <span style="color:red">*</span>
                  </div>
                  <div style="color: #cbd5e1;">➡️</div>
                  <div style="flex: 1;">
                    <select id="map_${key}_${off}" class="input-field mapping-select" data-key="${key}" data-official="${off}" style="padding: 6px; font-size: 0.8rem; height: auto;">
                      ${options}
                    </select>
                  </div>
                </div>
              `;
            });
            
            // Campos desconhecidos (Customizados)
            const unknownHeaders = headers.filter(h => !mappedExcelHeaders.has(h));
            if (unknownHeaders.length > 0) {
              html += `<hr style="border: 0; border-top: 1px dashed #cbd5e1; margin: 12px 0;">`;
              html += `<div style="font-weight: 600; color: #475569; font-size: 0.85rem; margin-bottom: 8px;">Colunas Extras / Customizadas</div>`;
              
              unknownHeaders.forEach((uh, i) => {
                html += `
                  <div style="display: flex; align-items: center; gap: 12px; font-size: 0.85rem; padding-left: 8px;">
                    <input type="checkbox" id="custom_${key}_${i}" value="${uh}" data-key="${key}" class="custom-field-checkbox" style="width:16px; height:16px; cursor:pointer;" checked>
                    <label for="custom_${key}_${i}" style="cursor:pointer; flex: 1;">
                      <span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${uh}</span>
                      <span style="color: #64748b; font-size: 0.75rem; margin-left: 6px;">(Importar como customizado)</span>
                    </label>
                  </div>
                `;
              });
            }
            
            html += `</div>`;
            abaBlock.innerHTML = html;
            container.appendChild(abaBlock);
          }
        } catch (err) {
          console.error(err);
        }
      });
      
      document.getElementById("columnMappingModal").style.display = "flex";
    }

    function confirmColumnMappingAndImport() {
      closeModal('columnMappingModal');
      
      const progressModal = document.getElementById("progressModal");
      const progressTitle = document.getElementById("progressTitle");
      const progressLabel = document.getElementById("progressLabel");
      const progressBarFill = document.getElementById("progressBarFill");
      const progressPercentage = document.getElementById("progressPercentage");
      const progressLog = document.getElementById("progressLog");
      
      progressLog.innerHTML = "";
      progressTitle.innerText = "Importando Planilha Excel";
      progressModal.style.display = "flex";

      if (!rawJsonDatabase) rawJsonDatabase = {};
      if (!rawJsonDatabase.CONFIG_ALIASES) rawJsonDatabase.CONFIG_ALIASES = {};

      const totalAbas = pendingImportContext.length;
      let abasProcessadas = 0;
      
      pendingImportContext.forEach((ctx) => {
        const key = ctx.key;
        const sheetName = ctx.sheetName;
        
        progressLabel.innerText = `Processando aba ${sheetName}...`;
        
        try {
          const ws = tempImportWorkbook.Sheets[sheetName];
          if (ws) {
            let rawJson = XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" });
            
            // Coletar mapeamentos da tela
            const officialHeaders = OFFICIAL_HEADERS[key] || [];
            const mappings = {}; // { oficial: colunaDoExcel }
            if (!rawJsonDatabase.CONFIG_ALIASES[key]) rawJsonDatabase.CONFIG_ALIASES[key] = {};

            officialHeaders.forEach(off => {
              const sel = document.getElementById(`map_${key}_${off}`);
              if (sel && sel.value) {
                mappings[off] = sel.value;
                // Salvar como alias para o futuro
                rawJsonDatabase.CONFIG_ALIASES[key][off] = sel.value;
              }
            });
            
            // Coletar colunas customizadas selecionadas
            const customFieldsToKeep = new Set();
            const checkboxes = document.querySelectorAll(`.custom-field-checkbox[data-key="${key}"]:checked`);
            checkboxes.forEach(cb => customFieldsToKeep.add(cb.value));

            // Aplicar mapeamento linha a linha
            const finalJson = [];
            
            rawJson.forEach((row, idx) => {
              const newRow = { rowNum: idx + 1 };
              
              // 1. Preencher oficiais
              officialHeaders.forEach(off => {
                const excelColName = mappings[off];
                if (excelColName && row[excelColName] !== undefined) {
                  newRow[off] = row[excelColName];
                } else {
                  newRow[off] = "";
                  if (idx === 0) progressLog.innerHTML += `   ❌ [Aba ${sheetName}]: Coluna "${off}" ficou vazia.\n`;
                }
              });
              
              // 2. Preencher customizados
              customFieldsToKeep.forEach(cf => {
                if (row[cf] !== undefined) {
                  newRow[cf] = row[cf];
                }
              });
              
              finalJson.push(newRow);
            });
            
            rawJsonDatabase[key] = finalJson;
            progressLog.innerHTML += `Aba [${sheetName}]: ${finalJson.length} registros processados e mapeados.\n`;
          }
        } catch (err) {
          progressLog.innerHTML += `Aba [${sheetName}]: Erro de leitura - ${err.message}.\n`;
        }

        abasProcessadas++;
        const pct = Math.round((abasProcessadas / totalAbas) * 100);
        progressBarFill.style.width = `${pct}%`;
        progressPercentage.innerText = `${pct}%`;
      });

      normalizeDatabaseProperties(rawJsonDatabase);
      progressLog.innerHTML += `Propriedades e customizações normalizadas com sucesso.\n`;

      const pat = localStorage.getItem("gh_pat");
      if (pat) {
        progressLabel.innerText = "Enviando alterações para o repositório GitHub...";
        progressLog.innerHTML += "Iniciando commit de sincronização...\n";

        commitChangesToGitHub(`Importação com mapeamento customizado via Excel - ${tempImportFileName}`, () => {}, () => {
          let secondsLeft = 15;
          progressLabel.innerText = `Organizando os dados... Aguarde um momento. (${secondsLeft}s)`;
          progressBarFill.style.width = "100%";
          const intv = setInterval(() => {
            secondsLeft--;
            progressLabel.innerText = `Organizando os dados... Aguarde um momento. (${secondsLeft}s)`;
            if (secondsLeft <= 0) {
              clearInterval(intv);
              closeModal("progressModal");
              showToast("Sincronização concluída com sucesso!", "success");
              switchMenu('eventos');
            }
          }, 1000);
        }, 'all');
      } else {
        setTimeout(() => {
          closeModal("progressModal");
          showToast("Base carregada apenas localmente. Configure o GitHub para persistir os dados.", "warning");
          switchMenu('eventos');
        }, 2000);
      }
    }


  