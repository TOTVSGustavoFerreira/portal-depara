
    // --- ESTADO GLOBAL DO HUB ---
    let hubConfig = {
      owner: localStorage.getItem('hub_owner') || 'TOTVSGustavoFerreira',
      token: localStorage.getItem('hub_token') || '',
      pin: localStorage.getItem('hub_pin') || '1234'
    };

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

    function initHub() {
      document.getElementById('configOwner').value = hubConfig.owner;
      document.getElementById('configToken').value = hubConfig.token;
      document.getElementById('configPin').value = hubConfig.pin;
      loadClientDataFromGitHub();
      renderClients();
    }

    // --- CARREGAR DADOS EM TEMPO REAL VIA GITHUB API ---
    async function loadClientDataFromGitHub() {
      // 1. Auto-descoberta dinâmica de todos os repositórios da conta (que começam com portal-depara-)
      try {
        const headers = hubConfig.token ? { 'Authorization': `token ${hubConfig.token}` } : {};
        const repoRes = await fetch(`https://api.github.com/users/${hubConfig.owner}/repos?per_page=100&t=${Date.now()}`, { headers });
        if (repoRes.ok) {
          const repos = await repoRes.json();
          // Filtra repositórios de clientes (exclui o master 'portal-depara')
          const clientRepos = repos.filter(r => r.name.startsWith('portal-depara-') && r.name !== 'portal-depara');
          
          if (clientRepos.length > 0) {
            const discoveredClients = [];
            for (let r of clientRepos) {
              const rawSlug = r.name.replace(/^portal-depara-/, '');
              const cleanName = rawSlug.split('-').map(w => w.toUpperCase()).join(' ');
              
              let existing = clientList.find(c => c.repo === r.name);
              discoveredClients.push({
                name: existing ? existing.name : cleanName,
                repo: r.name,
                status: 'pending',
                progress: 0,
                events: 0, coligadas: 0, funcoes: 0, sindicatos: 0, secoes: 0, situacao: 0,
                totalCount: 0, totalMappedCount: 0,
                updated: new Date(r.updated_at).toLocaleDateString('pt-BR')
              });
            }
            clientList = discoveredClients;
            localStorage.setItem('hub_client_list', JSON.stringify(clientList));
          }
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
            const res = await fetch(`https://api.github.com/repos/${hubConfig.owner}/${client.repo}/contents/${path}`, {
              headers: { 'Authorization': `token ${hubConfig.token}` }
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
            
            const evMapped = ev.filter(i => i.CODIGO_PARA && i.CODIGO_PARA !== 'CRIAR').length;
            const colMapped = col.filter(i => i.CODCOLIGADA).length;
            const funcMapped = func.filter(i => i.CODIGO_PARA && i.CODIGO_PARA !== 'CRIAR').length;
            const sindMapped = sind.filter(i => i.CODIGO_PARA && i.CODIGO_PARA !== 'CRIAR').length;
            const secMapped = sec.filter(i => i.CODIGO_PARA && i.CODIGO_PARA !== 'CRIAR').length;
            const sitMapped = sit.filter(i => i.CODSITUACAO_PARA).length;
            
            const totalItems = ev.length + col.length + func.length + sind.length + sec.length + sit.length;
            const totalMapped = evMapped + colMapped + funcMapped + sindMapped + secMapped + sitMapped;

            client.evTotal = ev.length; client.evMapped = evMapped;
            client.colTotal = col.length; client.colMapped = colMapped;
            client.funcTotal = func.length; client.funcMapped = funcMapped;
            client.sindTotal = sind.length; client.sindMapped = sindMapped;
            client.secTotal = sec.length; client.secMapped = secMapped;
            client.sitTotal = sit.length; client.sitMapped = sitMapped;

            client.progress = totalItems > 0 ? Math.round((totalMapped / totalItems) * 100) : 0;
            client.events = ev.length > 0 ? Math.round((evMapped / ev.length) * 100) : 0;
            client.coligadas = col.length > 0 ? Math.round((colMapped / col.length) * 100) : 0;
            client.funcoes = func.length > 0 ? Math.round((funcMapped / func.length) * 100) : 0;
            client.sindicatos = sind.length > 0 ? Math.round((sindMapped / sind.length) * 100) : 0;
            client.secoes = sec.length > 0 ? Math.round((secMapped / sec.length) * 100) : 0;
            client.situacao = sit.length > 0 ? Math.round((sitMapped / sit.length) * 100) : 0;
            
            client.totalCount = totalItems;
            client.totalMappedCount = totalMapped;

            client.status = client.progress === 100 ? 'completed' : (client.progress > 0 ? 'progress' : 'pending');
          }
        } catch (e) {
          console.warn(`Não foi possível atualizar em tempo real para ${client.repo}`, e);
        }
      }
      localStorage.setItem('hub_client_list', JSON.stringify(clientList));
      renderClients();
    }

    // --- RENDERIZAR GRID E KPIS 360° ---
    function renderClients() {
      const grid = document.getElementById('clientsGrid');
      const search = document.getElementById('searchInput').value.toLowerCase().trim();
      grid.innerHTML = '';

      let totalMappedSum = 0;
      let totalItemsSum = 0;
      let completedCount = 0;
      let progressCount = 0;
      let pendingCount = 0;

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

        const evTotal = c.evTotal || c.eventsCount || 0;
        const colTotal = c.colTotal || 0;
        const funcTotal = c.funcTotal || 0;
        const sindTotal = c.sindTotal || 0;
        const secTotal = c.secTotal || 0;
        const sitTotal = c.sitTotal || 0;

        card.innerHTML = `
          <div>
            <div class="card-header">
              <div>
                <div class="client-name">${c.name}</div>
                <div class="client-repo">${c.repo}</div>
              </div>
              <span class="status-badge ${badgeClass}">${badgeText}</span>
            </div>

            <div class="progress-section">
              <div class="progress-header">
                <span>Progresso Geral</span>
                <span>${c.totalMappedCount || 0}/${c.totalCount || 0} (${c.progress || 0}%)</span>
              </div>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${c.progress || 0}%"></div>
              </div>
            </div>

            <div class="modules-breakdown">
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

    // --- PROVISIONAR NOVO CLIENTE VIA GITHUB API (1 CLIQUE) ---
    async function createClientProject() {
      const name = document.getElementById('newClientName').value.trim();
      const repo = document.getElementById('newClientRepo').value.trim();

      if (!name || !repo) {
        showToast("Preencha o Nome da Empresa e o Repositório.", "error");
        return;
      }

      showToast("Provisionando novo cliente na nuvem...", "info");

      if (hubConfig.token) {
        try {
          const res = await fetch(`https://api.github.com/user/repos`, {
            method: 'POST',
            headers: {
              'Authorization': `token ${hubConfig.token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: repo,
              description: `Base de dados De-Para TOTVS RM - ${name}`,
              private: false
            })
          });

          if (res.ok) {
            showToast(`Repositório '${repo}' criado com sucesso no GitHub!`, "success");
          }
        } catch (e) {
          console.warn("Criação de repositório via API pulada/ajustada.", e);
        }
      }

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

      localStorage.setItem('hub_client_list', JSON.stringify(clientList));
      closeNewClientModal();
      renderClients();
      showToast(`Cliente '${name}' adicionado ao Hub com sucesso!`, "success");
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
      localStorage.setItem('hub_token', hubConfig.token);
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
  