
    // --- ESTADO GLOBAL DO HUB ---
    let hubConfig = {
      owner: localStorage.getItem('hub_owner') || localStorage.getItem('gh_owner') || 'TOTVSGustavoFerreira',
      token: localStorage.getItem('hub_token') || localStorage.getItem('gh_pat') || '',
      pin: localStorage.getItem('hub_pin') || '1234'
    };

    // Sincroniza PAT do Hub com o Portal De-Para
    if (hubConfig.token) {
      localStorage.setItem('hub_token', hubConfig.token);
      localStorage.setItem('gh_pat', hubConfig.token);
    }
    if (hubConfig.owner) {
      localStorage.setItem('hub_owner', hubConfig.owner);
      localStorage.setItem('gh_owner', hubConfig.owner);
    }

    let clientList = JSON.parse(localStorage.getItem('hub_client_list')) || [
      { name: 'SPO Tecnologia', repo: 'portal-depara-spotecnologia', status: 'progress', progress: 45, events: 40, coligadas: 100, funcoes: 20, sindicatos: 0, secoes: 30, situacao: 100, totalCount: 0, totalMappedCount: 0, updated: 'Há 1 dia' },
      { name: 'BARI AUTOMOVEIS', repo: 'portal-depara-bari-automoveis', status: 'completed', progress: 100, events: 100, coligadas: 100, funcoes: 100, sindicatos: 100, secoes: 100, situacao: 100, totalCount: 0, totalMappedCount: 0, updated: 'Criado Agora' }
    ];

    let currentFilter = 'all';

    // --- AUTENTICAÇÃO POR SENHA (PIN MESTRE) ---
    function verifyPin() {
      const pin = document.getElementById('pinInput').value;
      if (pin === hubConfig.pin) {
        localStorage.setItem('hub_session_auth', 'true');
        document.getElementById('loginOverlay').style.display = 'none';
        showToast("Acesso concedido ao Hub 360°!", "success");
        initHub();
      } else {
        showToast("Senha Mestra incorreta! Tente novamente.", "error");
      }
    }

    function logoutHub() {
      localStorage.removeItem('hub_session_auth');
      document.getElementById('pinInput').value = '';
      document.getElementById('loginOverlay').style.display = 'flex';
      showToast("Sessão encerrada. Hub bloqueado.", "info");
    }

    function checkAuthOnLoad() {
      if (localStorage.getItem('hub_session_auth') === 'true') {
        document.getElementById('loginOverlay').style.display = 'none';
        initHub();
      }
    }
    window.addEventListener('DOMContentLoaded', checkAuthOnLoad);

    const defaultClients = [
      { name: 'SPO Tecnologia', repo: 'portal-depara-spotecnologia' },
      { name: 'BARI AUTOMOVEIS', repo: 'portal-depara-bari-automoveis' }
    ];

    function ensureDefaultClients() {
      if (!Array.isArray(clientList)) clientList = [];
      defaultClients.forEach(def => {
        if (!clientList.some(c => c.repo === def.repo)) {
          clientList.push({
            name: def.name,
            repo: def.repo,
            status: 'pending',
            progress: 0,
            events: 0, coligadas: 0, funcoes: 0, sindicatos: 0, secoes: 0, situacao: 0,
            totalCount: 0, totalMappedCount: 0,
            updated: 'Ativo'
          });
        }
      });
    }

    function initHub() {
      ensureDefaultClients();
      document.getElementById('configOwner').value = hubConfig.owner;
      document.getElementById('configToken').value = hubConfig.token;
      document.getElementById('configPin').value = hubConfig.pin;
      loadClientDataFromGitHub();
      renderClients();
    }

    // --- CARREGAR DADOS EM TEMPO REAL VIA GITHUB API ---
    async function loadClientDataFromGitHub() {
      ensureDefaultClients();

      // 1. Auto-descoberta dinâmica sem apagar clientes da lista
      try {
        const headers = hubConfig.token ? { 'Authorization': `token ${hubConfig.token}` } : {};
        const repoRes = await fetch(`https://api.github.com/users/${hubConfig.owner}/repos?per_page=100&t=${Date.now()}`, { headers });
        if (repoRes.ok) {
          const repos = await repoRes.json();
          const clientRepos = repos.filter(r => r.name.startsWith('portal-depara-') && r.name !== 'portal-depara');
          
          clientRepos.forEach(r => {
            if (!clientList.some(c => c.repo === r.name)) {
              const rawSlug = r.name.replace(/^portal-depara-/, '');
              const cleanName = rawSlug.split('-').map(w => w.toUpperCase()).join(' ');
              clientList.push({
                name: cleanName,
                repo: r.name,
                status: 'pending',
                progress: 0,
                events: 0, coligadas: 0, funcoes: 0, sindicatos: 0, secoes: 0, situacao: 0,
                totalCount: 0, totalMappedCount: 0,
                updated: new Date(r.updated_at).toLocaleDateString('pt-BR')
              });
            }
          });
          localStorage.setItem('hub_client_list', JSON.stringify(clientList));
        }
      } catch (err) {
        console.warn("Auto-descoberta de repositórios via GitHub API falhou:", err);
      }

      for (let client of clientList) {
        try {
          const clientSlug = client.repo.replace(/^portal-depara-/, '').toLowerCase().trim();
          const candidatePaths = [
            `data/${clientSlug}_eventos_horarios.json`,
            `data/${clientSlug}_cadastros.json`,
            `data/${clientSlug}_base.json`,
            `data/${clientSlug}.json`,
            `database.json`
          ];

          let content = {};
          for (let path of candidatePaths) {
            try {
              const rawRes = await fetch(`https://raw.githubusercontent.com/${hubConfig.owner}/${client.repo}/main/${path}?t=${Date.now()}`);
              if (rawRes.ok) {
                const parsed = await rawRes.json();
                content = { ...content, ...parsed };
                continue;
              }
            } catch (errRaw) {}

            const res = await fetch(`https://api.github.com/repos/${hubConfig.owner}/${client.repo}/contents/${path}`, {
              headers: hubConfig.token ? { 'Authorization': `token ${hubConfig.token}` } : {}
            });
            if (res.ok) {
              const data = await res.json();
              if (data && data.content) {
                const parsed = JSON.parse(decodeURIComponent(escape(atob(data.content))));
                content = { ...content, ...parsed };
              }
            }
          }

          if (Object.keys(content).length > 0) {
            const ev = content.ZDEPARA_EVENTOS || [];
            const col = content.ZDEPARA_COLIGADAS || [];
            const func = content.ZDEPARA_FUNCOES || [];
            const sind = content.ZDEPARA_SINDICATOS || [];
            const sec = content.ZDEPARA_SECOES || [];
            const sit = content.ZDEPARA_SITUACAO || [];
            
            const isMapped = (item) => {
              if (item.codigoPara && item.codigoPara.trim() !== "" && item.codigoPara !== "CRIAR") return true;
              if (item.CODIGO_PARA && String(item.CODIGO_PARA).trim() !== "" && String(item.CODIGO_PARA) !== "CRIAR") return true;
              if (item.CODCOLIGADA && String(item.CODCOLIGADA).trim() !== "") return true;
              return false;
            };

            const evMapped = ev.filter(isMapped).length;
            const colMapped = col.filter(isMapped).length;
            const funcMapped = func.filter(isMapped).length;
            const sindMapped = sind.filter(isMapped).length;
            const secMapped = sec.filter(isMapped).length;
            const sitMapped = sit.filter(isMapped).length;

            const totalCount = ev.length + col.length + func.length + sind.length + sec.length + sit.length;
            const totalMappedCount = evMapped + colMapped + funcMapped + sindMapped + secMapped + sitMapped;
            
            const calcPct = (m, t) => t > 0 ? Math.round((m / t) * 100) : 100;

            client.events = calcPct(evMapped, ev.length);
            client.coligadas = calcPct(colMapped, col.length);
            client.funcoes = calcPct(funcMapped, func.length);
            client.sindicatos = calcPct(sindMapped, sind.length);
            client.secoes = calcPct(secMapped, sec.length);
            client.situacao = calcPct(sitMapped, sit.length);

            client.evTotal = ev.length; client.evMapped = evMapped;
            client.colTotal = col.length; client.colMapped = colMapped;
            client.funcTotal = func.length; client.funcMapped = funcMapped;
            client.sindTotal = sind.length; client.sindMapped = sindMapped;
            client.secTotal = sec.length; client.secMapped = secMapped;
            client.sitTotal = sit.length; client.sitMapped = sitMapped;

            client.totalCount = totalCount;
            client.totalMappedCount = totalMappedCount;
            client.progress = totalCount > 0 ? Math.round((totalMappedCount / totalCount) * 100) : 0;
            
            if (client.progress === 100) client.status = 'completed';
            else if (client.progress > 0) client.status = 'progress';
            else client.status = 'pending';
          }
        } catch (e) {
          console.warn(`Erro ao carregar dados em tempo real do repositório '${client.repo}':`, e);
        }
      }

      renderClients();
    }

    // --- RENDERIZAR GRID E KPIS 360° ---
    function renderClients() {
      const grid = document.getElementById('clientsGrid');
      const search = document.getElementById('searchClients').value.toLowerCase();
      grid.innerHTML = '';

      let completedCount = 0;
      let progressCount = 0;
      let pendingCount = 0;
      let totalMappedSum = 0;
      let totalItemsSum = 0;

      let filtered = clientList.filter(c => {
        const matchesSearch = c.name.toLowerCase().includes(search) || c.repo.toLowerCase().includes(search);
        if (currentFilter === 'completed') return matchesSearch && c.status === 'completed';
        if (currentFilter === 'progress') return matchesSearch && c.status === 'progress';
        if (currentFilter === 'pending') return matchesSearch && c.status === 'pending';
        return matchesSearch;
      });

      clientList.forEach(c => {
        if (c.status === 'completed') completedCount++;
        else if (c.status === 'progress') progressCount++;
        else pendingCount++;
        totalMappedSum += (c.totalMappedCount || 0);
        totalItemsSum += (c.totalCount || 0);
      });

      document.getElementById('kpiTotalClients').innerText = clientList.length;
      document.getElementById('kpiCompleted').innerText = completedCount;
      document.getElementById('kpiInProgress').innerText = progressCount;
      document.getElementById('kpiTotalRecords').innerText = `${totalMappedSum.toLocaleString('pt-BR')} Itens`;

      if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--color-text-muted);">Nenhum cliente encontrado com os filtros atuais.</div>`;
        return;
      }

      filtered.forEach(c => {
        const card = document.createElement('div');
        card.className = 'client-card';

        let badgeClass = 'pending';
        let badgeText = '🟡 Não Iniciado';
        if (c.status === 'completed') { badgeClass = 'completed'; badgeText = '🟢 Concluído (100%)'; }
        else if (c.status === 'progress') { badgeClass = 'progress'; badgeText = '🔵 Em Andamento'; }

        const portalUrl = `index.html?repo=${c.repo}`;

        const evTotal = c.evTotal || 0;
        const colTotal = c.colTotal || 0;
        const funcTotal = c.funcTotal || 0;
        const sindTotal = c.sindTotal || 0;
        const secTotal = c.secTotal || 0;
        const sitTotal = c.sitTotal || 0;

        card.innerHTML = `
          <div class="card-header">
            <div>
              <div class="client-name">${c.name}</div>
              <div class="client-repo">${c.repo}</div>
            </div>
            <span class="status-badge ${badgeClass}">${badgeText}</span>
          </div>

          <div class="card-body">
            <div class="progress-container">
              <div class="progress-info">
                <span class="progress-title">Progresso Geral</span>
                <span class="progress-val">${c.totalMappedCount || 0}/${c.totalCount || 0} (${c.progress || 0}%)</span>
              </div>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${c.progress || 0}%"></div>
              </div>
            </div>

            <div class="module-breakdown">
              <div class="module-item"><span>Eventos:</span><strong>${c.evMapped || 0}/${evTotal} (${c.events || 0}%)</strong></div>
              <div class="module-item"><span>Coligadas:</span><strong>${c.colMapped || 0}/${colTotal} (${c.coligadas || 0}%)</strong></div>
              <div class="module-item"><span>Funções:</span><strong>${c.funcMapped || 0}/${funcTotal} (${c.funcoes || 0}%)</strong></div>
              <div class="module-item"><span>Sindicatos:</span><strong>${c.sindMapped || 0}/${sindTotal} (${c.sindicatos || 0}%)</strong></div>
              <div class="module-item"><span>Seções:</span><strong>${c.secMapped || 0}/${secTotal} (${c.secoes || 0}%)</strong></div>
              <div class="module-item"><span>Situação:</span><strong>${c.sitMapped || 0}/${sitTotal} (${c.situacao || 0}%)</strong></div>
            </div>
          </div>

          <div class="card-footer">
            <a href="${portalUrl}" target="_blank" class="btn-card-action btn-primary">
              🚀 Abrir Portal De-Para
            </a>
            <button class="btn-card-action btn-secondary" onclick="deleteClient('${c.repo}')" style="color: #ef4444; border-color: rgba(239,68,68,0.3);">
              🗑️ Excluir
            </button>
          </div>
        `;
        grid.appendChild(card);
      });
    }

    function setFilter(filter, el) {
      currentFilter = filter;
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      el.classList.add('active');
      renderClients();
    }

    function autoSlug() {
      const name = document.getElementById('newClientName').value;
      const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      document.getElementById('newClientRepo').value = slug ? `portal-depara-${slug}` : '';
    }

    // --- HELPER PARA SALVAR ARQUIVO JSON NO REPOSITÓRIO GITHUB ---
    async function commitJsonFileToRepo(repo, path, contentObj, commitMsg) {
      const token = hubConfig.token || localStorage.getItem("gh_pat") || "";
      if (!token) return false;
      try {
        const jsonStr = JSON.stringify(contentObj, null, 2);
        const utf8Bytes = new TextEncoder().encode(jsonStr);
        let binary = '';
        for (let i = 0; i < utf8Bytes.length; i++) {
          binary += String.fromCharCode(utf8Bytes[i]);
        }
        const base64Content = btoa(binary);

        let sha = null;
        try {
          const getRes = await fetch(`https://api.github.com/repos/${hubConfig.owner}/${repo}/contents/${path}`, {
            headers: { 'Authorization': `token ${token}` }
          });
          if (getRes.ok) {
            const existingData = await getRes.json();
            sha = existingData.sha;
          }
        } catch (e) {}

        const putBody = {
          message: commitMsg,
          content: base64Content
        };
        if (sha) putBody.sha = sha;

        const putRes = await fetch(`https://api.github.com/repos/${hubConfig.owner}/${repo}/contents/${path}`, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(putBody)
        });
        return putRes.ok;
      } catch (err) {
        console.error("Erro ao subir arquivo JSON para o GitHub:", path, err);
        return false;
      }
    }

    // --- PROVISIONAR NOVO CLIENTE E IMPORTAR DADOS DO EXCEL VIA GITHUB API (1 CLIQUE) ---
    async function createClientProject() {
      const nameInput = document.getElementById('newClientName');
      const repoInput = document.getElementById('newClientRepo');
      const fileInput = document.getElementById('newClientFile');

      const name = nameInput.value.trim();
      const repo = repoInput.value.trim();

      if (!name || !repo) {
        showToast("Preencha o Nome da Empresa e o Repositório.", "error");
        return;
      }

      const token = hubConfig.token || localStorage.getItem("gh_pat") || "";
      if (!token) {
        showToast("Por favor, configure o Token do GitHub nas configurações do Hub primeiro.", "error");
        return;
      }

      showToast("Provisionando repositório no GitHub...", "info");

      // 1. Criar repositório no GitHub via API se ainda não existir
      try {
        await fetch(`https://api.github.com/user/repos`, {
          method: 'POST',
          headers: {
            'Authorization': `token ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: repo,
            description: `Base de dados De-Para TOTVS RM - ${name}`,
            private: false,
            auto_init: true
          })
        });
      } catch (e) {
        console.warn("Criação de repositório via API ajustada.", e);
      }

      // Aguarda 1.5s para inicialização do repositório no GitHub
      await new Promise(r => setTimeout(r, 1500));

      const clientSlug = repo.replace(/^portal-depara-/, '').toLowerCase().trim();
      let rawDatabase = {
        config: [{ empresa: name, repositorio: repo }],
        ZDEPARA_EVENTOS: [],
        ZDEPARA_COLIGADAS: [],
        ZDEPARA_FUNCOES: [],
        ZDEPARA_SINDICATOS: [],
        ZDEPARA_SECOES: [],
        ZDEPARA_SITUACAO: [],
        DADOS_RM_EVENTOS: []
      };

      // 2. Se houver planilha Excel selecionada no modal, ler e processar todas as abas
      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        showToast("Processando planilha Excel e extraindo abas...", "info");
        try {
          const file = fileInput.files[0];
          const arrayBuffer = await file.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });

          rawDatabase = {};
          workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            rawDatabase[sheetName] = json;
          });

          if (!rawDatabase.config) {
            rawDatabase.config = [{ empresa: name, repositorio: repo }];
          }
        } catch (errExcel) {
          console.error("Erro ao ler planilha Excel no Hub:", errExcel);
          showToast("Aviso: Falha ao ler Excel, criando base zerada padrão.", "error");
        }
      }

      showToast("Enviando base de dados para o GitHub do cliente...", "info");

      // 3. Separar em 3 arquivos JSON (base, eventos_horarios, cadastros)
      const baseKeys = ['config', 'DADOS_RM_EVENTOS', 'DADOS_RM_SITUACAO', 'DADOS_RM_MOTIVOS', 'DADOS_RM_SECOES'];
      const evHorKeys = ['ZDEPARA_EVENTOS', 'ZDEPARA_HORARIO'];

      const fileBaseData = {};
      const fileEvHorData = {};
      const fileCadData = {};

      Object.keys(rawDatabase).forEach(sheetName => {
        if (baseKeys.includes(sheetName)) {
          fileBaseData[sheetName] = rawDatabase[sheetName];
        } else if (evHorKeys.includes(sheetName)) {
          fileEvHorData[sheetName] = rawDatabase[sheetName];
        } else {
          fileCadData[sheetName] = rawDatabase[sheetName];
        }
      });

      // 4. Salvar os 3 arquivos JSON no repositório do GitHub do cliente
      await commitJsonFileToRepo(repo, `data/${clientSlug}_base.json`, fileBaseData, `Inicialização da base de dados - ${name}`);
      await commitJsonFileToRepo(repo, `data/${clientSlug}_eventos_horarios.json`, fileEvHorData, `Inicialização de eventos e horários - ${name}`);
      await commitJsonFileToRepo(repo, `data/${clientSlug}_cadastros.json`, fileCadData, `Inicialização de cadastros de-para - ${name}`);

      showToast(`Portal e base de dados de '${name}' criados com sucesso!`, "success");

      const existingIdx = clientList.findIndex(c => c.repo === repo);
      if (existingIdx !== -1) {
        clientList[existingIdx].name = name;
        clientList[existingIdx].updated = 'Criado Agora';
      } else {
        clientList.push({
          name: name,
          repo: repo,
          status: 'pending',
          progress: 0,
          events: 0,
          secoes: 0,
          funcoes: 0,
          updated: 'Criado Agora'
        });
      }

      localStorage.setItem('hub_client_list', JSON.stringify(clientList));
      closeNewClientModal();
      loadClientDataFromGitHub();
    }

    function deleteClient(repo) {
      if (confirm(`Deseja remover o cliente '${repo}' da lista do Hub? (Os dados no GitHub permanecerão intocados).`)) {
        clientList = clientList.filter(c => c.repo !== repo);
        localStorage.setItem('hub_client_list', JSON.stringify(clientList));
        renderClients();
        showToast("Cliente removido do Hub.", "info");
      }
    }

    function openNewClientModal() { document.getElementById('newClientModal').style.display = 'flex'; }
    function closeNewClientModal() { document.getElementById('newClientModal').style.display = 'none'; }
    function openConfigModal() { document.getElementById('configModal').style.display = 'flex'; }
    function closeConfigModal() { document.getElementById('configModal').style.display = 'none'; }

    function saveConfig() {
      hubConfig.owner = document.getElementById('configOwner').value.trim();
      hubConfig.token = document.getElementById('configToken').value.trim();
      hubConfig.pin = document.getElementById('configPin').value.trim();

      localStorage.setItem('hub_owner', hubConfig.owner);
      localStorage.setItem('gh_owner', hubConfig.owner);
      localStorage.setItem('hub_token', hubConfig.token);
      localStorage.setItem('gh_pat', hubConfig.token);
      localStorage.setItem('hub_pin', hubConfig.pin);

      closeConfigModal();
      showToast("Configurações do Hub salvas com sucesso!", "success");
      loadClientDataFromGitHub();
    }

    function showToast(msg, type = "info") {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = `<span>${type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️')}</span> <span>${msg}</span>`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3500);
    }
  