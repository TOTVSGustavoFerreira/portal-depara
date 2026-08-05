
    // --- ESTADO GLOBAL DO HUB ---
    let hubConfig = {
      owner: localStorage.getItem('hub_owner') || 'TOTVSGustavoFerreira',
      token: localStorage.getItem('hub_token') || '',
      pin: localStorage.getItem('hub_pin') || '1234'
    };

    let clientList = JSON.parse(localStorage.getItem('hub_client_list')) || [
      { name: 'Navarro', repo: 'portal-depara-navarro', status: 'progress', progress: 88, events: 80, secoes: 70, funcoes: 69, updated: 'Recente' },
      { name: 'SPO Tecnologia', repo: 'portal-depara-spotecnologia', status: 'progress', progress: 45, events: 40, secoes: 30, funcoes: 20, updated: 'Há 1 dia' }
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
      if (!hubConfig.token) return;

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
            const sec = content.ZDEPARA_SECOES || [];
            const func = content.ZDEPARA_FUNCOES || [];
            
            const evMapped = ev.filter(i => i.CODIGO_PARA && i.CODIGO_PARA !== 'CRIAR').length;
            const secMapped = sec.filter(i => i.CODIGO_PARA).length;
            const funcMapped = func.filter(i => i.CODIGO_PARA).length;
            
            const totalItems = ev.length + sec.length + func.length;
            const totalMapped = evMapped + secMapped + funcMapped;
            
            client.progress = totalItems > 0 ? Math.round((totalMapped / totalItems) * 100) : 0;
            client.events = ev.length > 0 ? Math.round((evMapped / ev.length) * 100) : 0;
            client.secoes = sec.length > 0 ? Math.round((secMapped / sec.length) * 100) : 0;
            client.funcoes = func.length > 0 ? Math.round((funcMapped / func.length) * 100) : 0;
            client.status = client.progress === 100 ? 'completed' : (client.progress > 0 ? 'progress' : 'pending');
          }
        } catch (e) {
          console.warn(`Não foi possível atualizar em tempo real para ${client.repo}`, e);
        }
      }
      renderClients();
    }

    // --- RENDERIZAR GRID E KPIS 360° ---
    function renderClients() {
      const grid = document.getElementById('clientsGrid');
      const search = document.getElementById('searchInput').value.toLowerCase().trim();
      grid.innerHTML = '';

      let totalMappedSum = 0;
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
        totalMappedSum += (c.progress || 0);
      });

      document.getElementById('kpiTotalClients').innerText = clientList.length;
      document.getElementById('kpiCompleted').innerText = completedCount;
      document.getElementById('kpiInProgress').innerText = progressCount;
      document.getElementById('kpiTotalRecords').innerText = `${totalMappedSum}% Mapeado`;

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
                <span>${c.progress || 0}%</span>
              </div>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${c.progress || 0}%"></div>
              </div>
            </div>

            <div class="modules-breakdown">
              <div class="module-item"><span>Eventos:</span><strong>${c.events || 0}%</strong></div>
              <div class="module-item"><span>Seções:</span><strong>${c.secoes || 0}%</strong></div>
              <div class="module-item"><span>Funções:</span><strong>${c.funcoes || 0}%</strong></div>
              <div class="module-item"><span>Status:</span><strong>${c.updated || 'Ativo'}</strong></div>
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
  