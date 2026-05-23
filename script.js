/* =============================================================
   MARLIFT SERVICE - Sistema OS v3.0
   ============================================================= */

let clientes = [];
let fotos = [];
let horFoto = null;
let assinatura = null;
let assinaturaBase64 = null;
let timerInt = null;
let timerSeg = 0;
let timerStatus = 'parado';
let tLog = [];
let sigCtx = null;
let sigDrawing = false;
let cfg = {};
let isLocked = false;
let editingOSId = null;
let viewingOS = null;
let ultimaOSSalva = null;
let deferredPrompt = null;
let calAno = new Date().getFullYear();
let calMes = new Date().getMonth();
const PASSWORD_CORRETA = "123456";
const MAX_FOTOS = 40;

/* ===== PWA INSTALL ===== */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('btnInstall');
  if (btn) btn.style.display = 'flex';
});

function instalarPWA() {
  if (!deferredPrompt) {
    toast('Use o menu do navegador e selecione "Instalar app" ou "Adicionar à tela inicial"', 'info');
    return;
  }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(r => {
    if (r.outcome === 'accepted') toast('App instalado com sucesso!', 'success');
    deferredPrompt = null;
    const btn = document.getElementById('btnInstall');
    if (btn) btn.style.display = 'none';
  });
}

/* ===== SERVICE WORKER ===== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW registrado:', reg.scope))
      .catch(err => console.log('SW falhou:', err));
  });
}

/* ===== OFFLINE / ONLINE MONITOR ===== */
function atualizarStatusOnline() {
  const badge = document.getElementById('offlineBadge');
  if (!badge) return;
  if (navigator.onLine) {
    badge.style.display = 'none';
    processarFilaSync();
  } else {
    badge.style.display = 'flex';
  }
}
window.addEventListener('online', atualizarStatusOnline);
window.addEventListener('offline', atualizarStatusOnline);

/* ===== FILA DE SINCRONIZAÇÃO OFFLINE ===== */
function getFilaSync() {
  return JSON.parse(localStorage.getItem('os_sync_queue') || '[]');
}
function setFilaSync(fila) {
  localStorage.setItem('os_sync_queue', JSON.stringify(fila));
  atualizarSyncStatusBar();
}
function adicionarNaFila(tipo, dados) {
  const fila = getFilaSync();
  fila.push({ tipo, dados, ts: Date.now() });
  setFilaSync(fila);
}
function atualizarSyncStatusBar() {
  const fila = getFilaSync();
  const bar = document.getElementById('syncStatusBar');
  const txt = document.getElementById('syncStatusTxt');
  if (!bar || !txt) return;
  if (fila.length > 0) {
    bar.style.display = 'flex';
    txt.textContent = 'Fila de sincronização: ' + fila.length + ' item(ns) pendente(s)';
  } else {
    bar.style.display = 'none';
  }
}

function processarFilaSync() {
  const url = cfg.googleScript;
  if (!url || !navigator.onLine) return;
  const fila = getFilaSync();
  if (fila.length === 0) return;

  // Processar itens um a um
  const item = fila[0];
  let payload;
  if (item.tipo === 'cliente') {
    payload = { action: 'saveCliente', cliente: item.dados };
  } else if (item.tipo === 'sync') {
    payload = { action: 'sync', data: item.dados };
  } else {
    // Remove item desconhecido
    setFilaSync(fila.slice(1));
    processarFilaSync();
    return;
  }

  fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(() => {
    const novaFila = getFilaSync();
    novaFila.shift();
    setFilaSync(novaFila);
    if (novaFila.length > 0) setTimeout(processarFilaSync, 800);
    else toast('Sincronização concluída!', 'success');
  }).catch(() => {
    // Mantém na fila para tentar depois
  });
}

/* ===== LOGIN ===== */
function fazerLogin() {
  const input = document.getElementById('pinInput');
  const pin = input.value;
  if (pin === PASSWORD_CORRETA) {
    sessionStorage.setItem('logado', 'true');
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').classList.add('visible');
    carregarRascunho();
    renderDashboard();
    toast('Bem-vindo ao Marlift Service!', 'success');
  } else {
    toast('Senha incorreta!', 'error');
    input.value = '';
    input.focus();
  }
}

function fazerLogout() {
  if (confirm('Deseja sair do sistema?')) {
    sessionStorage.removeItem('logado');
    location.reload();
  }
}

/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('logado') === 'true') {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').classList.add('visible');
    carregarRascunho();
  } else {
    setTimeout(() => document.getElementById('pinInput').focus(), 300);
  }
  carregarCfg();
  carregarClientes();
  atualizarSelectCli();
  renderClientList();
  renderHist();
  renderDashboard();
  renderCalendario();
  prog();
  atualizarDataHora();
  atualizarNumOS();
  atualizarStatusOnline();
  atualizarSyncStatusBar();
  document.querySelectorAll('.modal').forEach(m =>
    m.addEventListener('click', e => { if (e.target === m) fecharModal(); })
  );
  document.getElementById('pinInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') fazerLogin();
  });
});

/* ===== CONFIG ===== */
function carregarCfg() {
  const raw = localStorage.getItem('os_cfg');
  cfg = raw ? JSON.parse(raw) : { empresa: 'MARLIFT SERVICE', cnpj: '', tel: '', end: '', proxOS: 1, googleScript: '' };
  f('cfEmpresa', cfg.empresa);
  f('cfCnpj', cfg.cnpj);
  f('cfTel', cfg.tel);
  f('cfEnd', cfg.end);
  f('cfProxOS', cfg.proxOS || 1);
  f('cfGoogleScript', cfg.googleScript || '');
  const el = document.getElementById('hdrEmpresa');
  if (el) el.textContent = (cfg.empresa || 'MARLIFT SERVICE').toUpperCase();
}

function salvarCfg() {
  cfg.empresa = g('cfEmpresa');
  cfg.cnpj = g('cfCnpj');
  cfg.tel = g('cfTel');
  cfg.end = g('cfEnd');
  cfg.proxOS = parseInt(g('cfProxOS')) || 1;
  cfg.googleScript = g('cfGoogleScript');
  localStorage.setItem('os_cfg', JSON.stringify(cfg));
  const el = document.getElementById('hdrEmpresa');
  if (el) el.textContent = (cfg.empresa || 'MARLIFT SERVICE').toUpperCase();
  atualizarNumOS();
}

/* ===== GOOGLE SHEETS ===== */
function toggleScriptCode() {
  const box = document.getElementById('scriptCodeBox');
  const btn = document.getElementById('btnMostrarScript');
  if (box.style.display === 'none') {
    box.style.display = 'block';
    btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Ocultar Código';
  } else {
    box.style.display = 'none';
    btn.innerHTML = '<i class="fa-solid fa-code"></i> Ver Código Google Apps Script';
  }
}

function copiarScript() {
  const pre = document.getElementById('scriptCodePre');
  if (!pre) return;
  navigator.clipboard.writeText(pre.textContent).then(() => {
    toast('Código copiado para a área de transferência!', 'success');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = pre.textContent;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Código copiado!', 'success');
  });
}

function testarGoogleScript() {
  const url = cfg.googleScript;
  if (!url) { toast('Configure a URL do Google Apps Script primeiro.', 'error'); return; }
  if (!navigator.onLine) { toast('Sem conexão. Teste quando estiver online.', 'error'); return; }
  fetch(url + '?action=ping', { mode: 'no-cors' })
    .then(() => toast('Conexão enviada! Verifique a planilha.', 'success'))
    .catch(() => toast('Erro na conexão. Verifique a URL.', 'error'));
}

function sincronizarGoogle() {
  const url = cfg.googleScript;
  if (!url) { toast('Configure a URL do Google Apps Script primeiro.', 'error'); return; }
  const hist = JSON.parse(localStorage.getItem('os_historico') || '[]');
  if (hist.length === 0) { toast('Nenhuma OS para sincronizar.', 'error'); return; }

  const dados = hist.map(o => ({
    numero: o.numero, data: o.data, cliente: o.cliNome, cnpj: o.cliCnpj,
    endereco: o.cliEnd, tecnico: o.tecNome, marca: o.eqMarca, modelo: o.eqModelo,
    serie: o.eqSerie, horimetro: o.horimetro, tipo: o.tipoChamado,
    defeito: o.defeito, servico: o.servico, pecas: o.pecas, status: o.status, tempo: o.tempo
  }));

  if (!navigator.onLine) {
    adicionarNaFila('sync', dados);
    toast('Offline — dados salvos na fila de sincronização.', 'info');
    return;
  }

  fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sync', data: dados })
  }).then(() => toast('Dados enviados para a planilha!', 'success'))
    .catch(() => {
      adicionarNaFila('sync', dados);
      toast('Erro — adicionado à fila de sincronização.', 'info');
    });
}

/* ===== TABS ===== */
function switchTab(id) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const nt = document.querySelector('.nav-tab[data-tab="' + id + '"]');
  if (nt) nt.classList.add('active');
  document.querySelectorAll('.bnav-item').forEach(t => t.classList.remove('active'));
  const bn = document.querySelector('.bnav-item[data-tab="' + id + '"]');
  if (bn) bn.classList.add('active');
  const progWrap = document.getElementById('progBarWrap');
  if (progWrap) progWrap.style.display = id === 'tab-os' ? 'block' : 'none';
  if (id === 'tab-hist') renderHist();
  if (id === 'tab-cfg') { carregarCfg(); renderClientList(); atualizarSyncStatusBar(); calcularAlertasHorimetro(); }
  if (id === 'tab-dash') renderDashboard();
  if (id === 'tab-agenda') renderCalendario();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ===== DASHBOARD ===== */
function renderDashboard() {
  const hist = JSON.parse(localStorage.getItem('os_historico') || '[]');
  const now = new Date();
  const dashDate = document.getElementById('dashDate');
  if (dashDate) dashDate.textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const concluidas = hist.filter(o => o.status === 'Concluido' || o.status === 'Concluído');
  const pendentes = hist.filter(o => o.status !== 'Concluido' && o.status !== 'Concluído');
  const agendadas = hist.filter(o => o.agendaData && new Date(o.agendaData) >= new Date(now.toDateString()));

  const stTotal = document.getElementById('statTotal');
  const stDone = document.getElementById('statDone');
  const stPending = document.getElementById('statPending');
  const stSched = document.getElementById('statSched');
  if (stTotal) stTotal.textContent = hist.length;
  if (stDone) stDone.textContent = concluidas.length;
  if (stPending) stPending.textContent = pendentes.length;
  if (stSched) stSched.textContent = agendadas.length;

  const agEl = document.getElementById('dashAgendamentos');
  if (agEl) {
    const proxAg = agendadas.sort((a, b) => new Date(a.agendaData) - new Date(b.agendaData)).slice(0, 5);
    if (proxAg.length === 0) {
      agEl.innerHTML = '<div class="agenda-empty"><i class="fa-solid fa-calendar-xmark"></i> Nenhum agendamento próximo</div>';
    } else {
      agEl.innerHTML = proxAg.map(o => {
        const dt = new Date(o.agendaData + 'T' + (o.agendaHora || '08:00'));
        const isAgendado = o.status === 'Agendado';
        return '<div class="agenda-item">' +
          '<div class="agenda-item-date">' + dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + '<br>' + (o.agendaHora || '') + '</div>' +
          '<div class="agenda-item-info"><div class="agenda-item-name">' + esc(o.cliNome) + '</div>' +
          '<div class="agenda-item-meta">' + esc(o.eqMarca || '') + ' ' + esc(o.eqModelo || '') + ' — ' + esc(o.tipoChamado || '') + '</div></div>' +
          '<div class="agenda-item-actions">' +
          (isAgendado ? '<button class="btn btn-atendimento-sm" onclick="carregarOSParaAtendimento(\'' + o.id + '\')"><i class="fa-solid fa-play-circle"></i> Atender</button>' : '') +
          '<button class="btn btn-ghost btn-sm" onclick="verOS(\'' + o.id + '\')"><i class="fa-solid fa-eye"></i></button>' +
          '</div></div>';
      }).join('');
    }
  }

  const recEl = document.getElementById('dashRecentes');
  if (recEl) {
    const recentes = hist.slice(0, 5);
    if (recentes.length === 0) {
      recEl.innerHTML = '<div class="agenda-empty"><i class="fa-solid fa-folder-open"></i> Nenhuma OS registrada</div>';
    } else {
      recEl.innerHTML = recentes.map(os => {
        const dt = new Date(os.data);
        return '<div class="agenda-item" style="cursor:pointer" onclick="verOS(\'' + os.id + '\')">' +
          '<div class="agenda-item-date">' + fmtNum(os.numero) + '</div>' +
          '<div class="agenda-item-info"><div class="agenda-item-name">' + esc(os.cliNome) + '</div>' +
          '<div class="agenda-item-meta">' + dt.toLocaleDateString('pt-BR') + ' - ' + esc(os.status || '') + '</div></div></div>';
      }).join('');
    }
  }
}

/* ===== LISTA FILTRADA DO DASHBOARD ===== */
function abrirListaFiltrada(filtro) {
  const hist = JSON.parse(localStorage.getItem('os_historico') || '[]');
  const now = new Date();
  let lista = [];
  let titulo = '';

  if (filtro === 'todas') {
    lista = hist;
    titulo = '<i class="fa-solid fa-file-lines"></i> Todas as OS (' + hist.length + ')';
  } else if (filtro === 'concluidas') {
    lista = hist.filter(o => o.status === 'Concluido' || o.status === 'Concluído');
    titulo = '<i class="fa-solid fa-circle-check"></i> OS Concluídas (' + lista.length + ')';
  } else if (filtro === 'pendentes') {
    lista = hist.filter(o => o.status !== 'Concluido' && o.status !== 'Concluído');
    titulo = '<i class="fa-solid fa-clock"></i> OS Pendentes (' + lista.length + ')';
  } else if (filtro === 'agendadas') {
    lista = hist.filter(o => o.agendaData && new Date(o.agendaData) >= new Date(now.toDateString()));
    titulo = '<i class="fa-solid fa-calendar-check"></i> OS Agendadas (' + lista.length + ')';
  }

  const titleEl = document.getElementById('modalListaTitulo');
  if (titleEl) titleEl.innerHTML = titulo;

  const body = document.getElementById('modalListaBody');
  if (!body) return;

  if (lista.length === 0) {
    body.innerHTML = '<div class="os-empty"><i class="fa-solid fa-folder-open"></i><p>Nenhuma OS nesta categoria.</p></div>';
  } else {
    const statusBadge = {
      'Concluído': 'badge-green', 'Concluido': 'badge-green',
      'Pendente': 'badge-orange', 'Aguardando Peça': 'badge-blue',
      'Orçamento Enviado': 'badge-purple', 'Agendado': 'badge-blue'
    };
    body.innerHTML = lista.map(os => {
      const dt = new Date(os.data);
      const isAgendado = os.status === 'Agendado';
      return '<div class="os-card' + (isAgendado ? ' os-card-agendado' : '') + '">' +
        '<div class="os-card-top"><div class="os-card-info">' +
        '<div class="os-num">' + fmtNum(os.numero) + ' — ' + dt.toLocaleDateString('pt-BR') + '</div>' +
        '<div class="os-cliente">' + esc(os.cliNome) + '</div>' +
        '<div class="os-meta">' + esc(os.eqMarca || '') + ' ' + esc(os.eqModelo || '') + (os.agendaData ? ' — 📅 ' + os.agendaData : '') + '</div>' +
        '<div class="os-tags"><span class="badge ' + (statusBadge[os.status] || 'badge-gray') + '">' + esc(os.status || '--') + '</span></div>' +
        '</div></div>' +
        '<div class="os-actions">' +
        (isAgendado ? '<button class="btn btn-atendimento-sm btn-sm" onclick="fecharModal();carregarOSParaAtendimento(\'' + os.id + '\')"><i class="fa-solid fa-play-circle"></i> Atender</button>' : '') +
        '<button class="btn btn-ghost btn-sm" onclick="fecharModal();verOS(\'' + os.id + '\')"><i class="fa-solid fa-eye"></i> Ver</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="fecharModal();gerarPDFPorId(\'' + os.id + '\')"><i class="fa-solid fa-file-pdf"></i> PDF</button>' +
        '</div></div>';
    }).join('');
  }
  abrirModal('modalListaFiltrada');
}

/* ===== CALENDÁRIO ===== */
function renderCalendario() {
  const hist = JSON.parse(localStorage.getItem('os_historico') || '[]');
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const titulo = document.getElementById('calTitulo');
  if (titulo) titulo.textContent = meses[calMes] + ' ' + calAno;

  const grid = document.getElementById('calGrid');
  if (!grid) return;

  // Mapear OS por data
  const osPorDia = {};
  hist.forEach(os => {
    if (!os.agendaData) return;
    const d = os.agendaData;
    if (!osPorDia[d]) osPorDia[d] = [];
    osPorDia[d].push(os);
  });

  const primeiroDia = new Date(calAno, calMes, 1).getDay();
  const diasNoMes = new Date(calAno, calMes + 1, 0).getDate();
  const hoje = new Date();
  const hojeStr = hoje.toISOString().slice(0, 10);

  let html = '';
  // Células vazias antes do primeiro dia
  for (let i = 0; i < primeiroDia; i++) {
    html += '<div class="cal-cell cal-empty"></div>';
  }
  // Dias do mês
  for (let d = 1; d <= diasNoMes; d++) {
    const mes = String(calMes + 1).padStart(2, '0');
    const dia = String(d).padStart(2, '0');
    const dateStr = calAno + '-' + mes + '-' + dia;
    const hasOS = osPorDia[dateStr] && osPorDia[dateStr].length > 0;
    const isHoje = dateStr === hojeStr;
    let cls = 'cal-cell';
    if (isHoje) cls += ' cal-today';
    else if (hasOS) cls += ' cal-has-os';
    const badge = hasOS ? '<div class="cal-badge">' + osPorDia[dateStr].length + '</div>' : '';
    html += '<div class="' + cls + '" onclick="verDiaCalendario(\'' + dateStr + '\')">' +
      '<span class="cal-day-num">' + d + '</span>' + badge + '</div>';
  }
  grid.innerHTML = html;
  // Ocultar card de dia ao re-renderizar
  const dayCard = document.getElementById('calDayCard');
  if (dayCard) dayCard.style.display = 'none';
}

function mudarMesCalendario(delta) {
  calMes += delta;
  if (calMes < 0) { calMes = 11; calAno--; }
  if (calMes > 11) { calMes = 0; calAno++; }
  renderCalendario();
}

function verDiaCalendario(dateStr) {
  const hist = JSON.parse(localStorage.getItem('os_historico') || '[]');
  const osDia = hist.filter(os => os.agendaData === dateStr);

  // Destacar célula selecionada
  document.querySelectorAll('.cal-cell').forEach(c => c.classList.remove('cal-selected'));
  const parts = dateStr.split('-');
  const diaNum = parseInt(parts[2]);
  const cells = document.querySelectorAll('.cal-cell:not(.cal-empty)');
  let idx = 0;
  cells.forEach(c => {
    const n = parseInt(c.querySelector('.cal-day-num')?.textContent);
    if (n === diaNum) c.classList.add('cal-selected');
  });

  const dt = new Date(dateStr + 'T12:00:00');
  const titulo = document.getElementById('calDayTitle');
  const subtitulo = document.getElementById('calDaySubtitle');
  const lista = document.getElementById('calDayList');
  const card = document.getElementById('calDayCard');

  if (titulo) titulo.textContent = 'OS de ' + dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  if (subtitulo) subtitulo.textContent = osDia.length + ' OS agendada(s)';

  if (!lista || !card) return;

  if (osDia.length === 0) {
    lista.innerHTML = '<div class="os-empty"><i class="fa-solid fa-calendar-xmark"></i><p>Nenhuma OS agendada neste dia.</p></div>';
  } else {
    const statusBadge = {
      'Concluído': 'badge-green', 'Concluido': 'badge-green',
      'Pendente': 'badge-orange', 'Aguardando Peça': 'badge-blue',
      'Orçamento Enviado': 'badge-purple', 'Agendado': 'badge-blue'
    };
    lista.innerHTML = osDia.map(os => {
      const isAgendado = os.status === 'Agendado';
      return '<div class="os-card' + (isAgendado ? ' os-card-agendado' : '') + '">' +
        '<div class="os-card-top"><div class="os-card-info">' +
        '<div class="os-num">' + fmtNum(os.numero) + (os.agendaHora ? ' — ' + os.agendaHora : '') + '</div>' +
        '<div class="os-cliente">' + esc(os.cliNome) + '</div>' +
        '<div class="os-meta">' + esc(os.eqMarca || '') + ' ' + esc(os.eqModelo || '') + ' — Tec: ' + esc(os.tecNome || '--') + '</div>' +
        '<div class="os-tags"><span class="badge ' + (statusBadge[os.status] || 'badge-gray') + '">' + esc(os.status || '--') + '</span>' +
        (os.tipoChamado ? '<span class="badge badge-orange">' + esc(os.tipoChamado) + '</span>' : '') + '</div>' +
        (os.agendaObs ? '<div class="os-meta" style="margin-top:4px;color:var(--primary)"><i class="fa-solid fa-note-sticky"></i> ' + esc(os.agendaObs) + '</div>' : '') +
        '</div></div>' +
        '<div class="os-actions">' +
        (isAgendado ? '<button class="btn btn-atendimento-sm btn-sm" onclick="carregarOSParaAtendimento(\'' + os.id + '\')"><i class="fa-solid fa-play-circle"></i> Atender</button>' : '') +
        '<button class="btn btn-ghost btn-sm" onclick="verOS(\'' + os.id + '\')"><i class="fa-solid fa-eye"></i> Ver</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="gerarPDFPorId(\'' + os.id + '\')"><i class="fa-solid fa-file-pdf"></i> PDF</button>' +
        '</div></div>';
    }).join('');
  }

  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ===== PROGRESS BAR ===== */
function prog() {
  const checks = [!!g('cNome'), !!g('tNome'), !!g('eMarca'), !!g('tipo'), timerStatus !== 'parado', !!g('servico')];
  let first = checks.indexOf(false);
  checks.forEach((ok, i) => {
    const el = document.getElementById('ps' + (i + 1));
    if (!el) return;
    el.className = 'prog-step ' + (ok ? 'done' : i === first ? 'active' : '');
  });
}

/* ===== DATA/HORA ===== */
function atualizarDataHora() {
  const now = new Date();
  const el1 = document.getElementById('osData');
  const el2 = document.getElementById('osHora');
  if (el1) el1.textContent = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  if (el2) el2.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function atualizarNumOS() {
  const el = document.getElementById('osNum');
  if (el) el.textContent = '#' + String(cfg.proxOS || 1).padStart(6, '0');
}
function fmtNum(n) { return '#' + String(n).padStart(6, '0'); }

/* ===== BLOQUEIO ===== */
function bloquearOS() {
  isLocked = true;
  document.querySelectorAll('#tab-os input, #tab-os select, #tab-os textarea, #btnIni, #btnPau, #btnSalvar, #btnAbrirSig')
    .forEach(el => { el.disabled = true; });
  document.getElementById('btnPdf').disabled = false;
  document.getElementById('btnEditar').style.display = 'inline-flex';
  document.getElementById('btnAbrirSig').style.display = 'none';
}

function desbloquearOS() {
  if (!confirm('Isso desbloqueará a OS para edição. Continuar?')) return;
  isLocked = false;
  document.querySelectorAll('#tab-os input, #tab-os select, #tab-os textarea')
    .forEach(el => { el.disabled = false; });
  if (timerStatus === 'parado') document.getElementById('btnIni').disabled = false;
  if (timerStatus === 'rodando') document.getElementById('btnPau').disabled = false;
  document.getElementById('btnSalvar').disabled = false;
  document.getElementById('btnPdf').disabled = true;
  document.getElementById('btnEditar').style.display = 'none';
  document.getElementById('btnAbrirSig').style.display = 'inline-flex';
  toast('OS desbloqueada para edição.', 'warning');
}

/* ===== FOTO HORÍMETRO ===== */
function processarFotoHor(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.src = e.target.result;
    img.onload = () => {
      const c = document.createElement('canvas');
      const max = 1000, scale = img.width > max ? max / img.width : 1;
      c.width = img.width * scale; c.height = img.height * scale;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      horFoto = c.toDataURL('image/jpeg', 0.82);
      const prev = document.getElementById('horPrev');
      prev.src = horFoto; prev.classList.add('vis');
      document.getElementById('btnFotHor').style.display = 'none';
      document.getElementById('btnRmHor').style.display = 'flex';
      try { localStorage.setItem('os_hor_foto', horFoto); } catch(ex) {}
      toast('Foto do horímetro salva!', 'success');
    };
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function removerFotoHor() {
  horFoto = null;
  const prev = document.getElementById('horPrev');
  prev.src = ''; prev.classList.remove('vis');
  document.getElementById('btnFotHor').style.display = 'flex';
  document.getElementById('btnRmHor').style.display = 'none';
  localStorage.removeItem('os_hor_foto');
}

/* ===== CLIENTES ===== */
function carregarClientes() {
  const raw = localStorage.getItem('os_clientes');
  clientes = raw ? JSON.parse(raw) : [];
  // Migração: converter clientes com formato antigo (campos diretos) para novo (equipamentos:[])
  let migrou = false;
  clientes = clientes.map(c => {
    if (!c.equipamentos) {
      c.equipamentos = [{
        id: Date.now().toString() + Math.random().toString(36).substr(2,4),
        marca: c.marca || '', modelo: c.modelo || '',
        comb: c.comb || 'GLP', serie: c.serie || ''
      }];
      delete c.marca; delete c.modelo; delete c.comb; delete c.serie;
      migrou = true;
    }
    return c;
  });
  if (migrou) localStorage.setItem('os_clientes', JSON.stringify(clientes));
}
function salvarClientes() { localStorage.setItem('os_clientes', JSON.stringify(clientes)); }

/* Helper: retorna texto de marcas para um select */
function htmlMarcas(sel) {
  const marcas = ['TOYOTA','CLARK','HYSTER','YALE','STILL','HANGCHA','NISSAN','KOMATSU','MITSUBISHI','GOODSENSE','HELI','PALETRANS','OUTRA'];
  return '<option value="">Selecione...</option>' + marcas.map(m => `<option${m===sel?' selected':''}>${m}</option>`).join('');
}

/* Helper: retorna texto de combustíveis para um select */
function htmlCombs(sel) {
  return ['GLP','ELÉTRICA','DIESEL'].map(c => `<option${c===sel?' selected':''}>${c}</option>`).join('');
}

/* Gera HTML de uma linha de equipamento (novo cadastro) */
function renderEquipRow(eq, idx, total, container) {
  const eqId = eq ? eq.id : ('eq_' + Date.now() + Math.random().toString(36).substr(2,4));
  const div = document.createElement('div');
  div.className = 'equip-row';
  div.dataset.eqId = eqId;
  div.innerHTML =
    '<div class="equip-row-header">' +
      '<span class="equip-row-num"><i class="fa-solid fa-truck-ramp-box"></i> Equipamento ' + (idx+1) + '</span>' +
      (total > 1 ? '<button type="button" class="btn btn-danger btn-icon btn-xs" onclick="removerEquipRow(this,\''+container+'\')" title="Remover"><i class="fa-solid fa-trash"></i></button>' : '') +
    '</div>' +
    '<div class="row">' +
      '<div class="form-group"><label class="form-label">Marca <span class="required">*</span></label>' +
        '<select class="form-control eq-marca">' + htmlMarcas(eq ? eq.marca : '') + '</select></div>' +
      '<div class="form-group"><label class="form-label">Modelo <span class="required">*</span></label>' +
        '<input type="text" class="form-control eq-modelo" placeholder="CPY25" value="' + esc(eq ? eq.modelo : '') + '"></div>' +
    '</div>' +
    '<div class="row">' +
      '<div class="form-group"><label class="form-label">Combustível</label>' +
        '<select class="form-control eq-comb">' + htmlCombs(eq ? eq.comb : 'GLP') + '</select></div>' +
      '<div class="form-group"><label class="form-label">Nº de Série <span class="required">*</span></label>' +
        '<input type="text" class="form-control eq-serie" placeholder="E356-0023" value="' + esc(eq ? eq.serie : '') + '"></div>' +
    '</div>';
  div.dataset.eqIdVal = eqId;
  return div;
}

/* Renderiza todos os equipamentos em um container */
function renderEquipList(containerId, equipamentos) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  const list = (equipamentos && equipamentos.length > 0) ? equipamentos : [null];
  list.forEach((eq, i) => el.appendChild(renderEquipRow(eq, i, list.length, containerId)));
}

/* Adiciona nova linha de equipamento (modal novo) */
function adicionarEquipamentoCad() {
  const el = document.getElementById('cadEquipList');
  if (!el) return;
  const rows = el.querySelectorAll('.equip-row');
  // Renumerar botões de remoção
  const total = rows.length + 1;
  rows.forEach((r, i) => {
    const hdr = r.querySelector('.equip-row-header');
    if (hdr) {
      hdr.querySelector('.equip-row-num').innerHTML = '<i class="fa-solid fa-truck-ramp-box"></i> Equipamento ' + (i+1);
      if (!hdr.querySelector('.btn-danger')) {
        hdr.insertAdjacentHTML('beforeend', '<button type="button" class="btn btn-danger btn-icon btn-xs" onclick="removerEquipRow(this,\'cadEquipList\')" title="Remover"><i class="fa-solid fa-trash"></i></button>');
      }
    }
  });
  el.appendChild(renderEquipRow(null, rows.length, total, 'cadEquipList'));
}

/* Adiciona nova linha de equipamento (modal editar) */
function adicionarEquipamentoEdit() {
  const el = document.getElementById('editEquipList');
  if (!el) return;
  const rows = el.querySelectorAll('.equip-row');
  const total = rows.length + 1;
  rows.forEach((r, i) => {
    const hdr = r.querySelector('.equip-row-header');
    if (hdr) {
      hdr.querySelector('.equip-row-num').innerHTML = '<i class="fa-solid fa-truck-ramp-box"></i> Equipamento ' + (i+1);
      if (!hdr.querySelector('.btn-danger')) {
        hdr.insertAdjacentHTML('beforeend', '<button type="button" class="btn btn-danger btn-icon btn-xs" onclick="removerEquipRow(this,\'editEquipList\')" title="Remover"><i class="fa-solid fa-trash"></i></button>');
      }
    }
  });
  el.appendChild(renderEquipRow(null, rows.length, total, 'editEquipList'));
}

/* Remove uma linha de equipamento */
function removerEquipRow(btn, containerId) {
  const row = btn.closest('.equip-row');
  const el = document.getElementById(containerId);
  if (!el || el.querySelectorAll('.equip-row').length <= 1) return;
  row.remove();
  // Renumerar
  el.querySelectorAll('.equip-row').forEach((r, i) => {
    const num = r.querySelector('.equip-row-num');
    if (num) num.innerHTML = '<i class="fa-solid fa-truck-ramp-box"></i> Equipamento ' + (i+1);
    if (el.querySelectorAll('.equip-row').length === 1) {
      const delBtn = r.querySelector('.btn-danger');
      if (delBtn) delBtn.remove();
    }
  });
}

/* Lê equipamentos de um container de lista */
function lerEquipamentos(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return [];
  return Array.from(el.querySelectorAll('.equip-row')).map(row => ({
    id: row.dataset.eqIdVal || row.dataset.eqId || (Date.now().toString() + Math.random().toString(36).substr(2,4)),
    marca: row.querySelector('.eq-marca').value,
    modelo: row.querySelector('.eq-modelo').value.trim(),
    comb: row.querySelector('.eq-comb').value,
    serie: row.querySelector('.eq-serie').value.trim()
  }));
}

function atualizarSelectCli() {
  const sel = document.getElementById('selCliente');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Toque para selecionar o cliente —</option>';
  clientes.slice().sort((a, b) => a.nome.localeCompare(b.nome)).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    const equips = c.equipamentos || [];
    const eqInfo = equips.length === 1
      ? ' — ' + equips[0].marca + ' ' + equips[0].modelo
      : equips.length > 1 ? ' — ' + equips.length + ' equipamentos' : '';
    opt.textContent = c.nome + eqInfo;
    sel.appendChild(opt);
  });
}

/* Oculta/mostra painel de dados do cliente — mantido por compatibilidade */
function mostrarCardCliente(show) {}

/* Preenche painel de resumo somente-leitura + histórico (Feature 3) */
function preencherPainelResumo(c) {
  const painel = document.getElementById('painelResumoCliente');
  if (!painel) return;
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt || ''; };
  set('rsCliNome',  c.nome);
  set('rsCliCnpj',  c.cnpj  ? 'CNPJ: ' + c.cnpj : '');
  set('rsCliEnd',   c.end);
  set('rsCliTel',   c.tel   ? '📞 ' + c.tel  : '');
  set('rsEqMarca',  c.marca + (c.modelo ? ' ' + c.modelo : ''));
  set('rsEqModelo', '');
  set('rsEqSerie',  c.serie ? 'S/N: ' + c.serie : '');
  set('rsEqComb',   c.comb  ? '⛽ ' + c.comb   : '');
  painel.style.display = 'block';

  // Feature 3: mini-histórico
  preencherMiniHistorico(c.nome);
}

/* Feature 3: últimas 3 OS do cliente */
function preencherMiniHistorico(nomeCliente) {
  const histEl = document.getElementById('resumoHistorico');
  const listaEl = document.getElementById('resumoHistoricoLista');
  if (!histEl || !listaEl) return;

  const hist = JSON.parse(localStorage.getItem('os_historico') || '[]');
  const osCliente = hist
    .filter(os => (os.cliNome || '').toLowerCase() === (nomeCliente || '').toLowerCase())
    .slice(0, 3);

  if (osCliente.length === 0) { histEl.style.display = 'none'; return; }

  const statusCor = { 'Concluído':'#22c55e', 'Pendente':'#f59e0b', 'Agendado':'#3b82f6', 'Cancelado':'#ef4444' };
  listaEl.innerHTML = osCliente.map(os => {
    const dt = os.data ? new Date(os.data).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' }) : '—';
    const cor = statusCor[os.status] || '#888';
    return '<div class="mini-hist-item">' +
      '<span class="mini-hist-num">' + fmtNum(os.numero) + '</span>' +
      '<span class="mini-hist-dt">' + dt + '</span>' +
      '<span class="mini-hist-tipo">' + esc(os.tipoChamado || '—') + '</span>' +
      '<span class="mini-hist-status" style="color:' + cor + '">' + esc(os.status || '—') + '</span>' +
    '</div>';
  }).join('');
  histEl.style.display = 'block';
}

/* Lógica do Seletor: Decide entre Banco de Dados ou Manual */
function processarSelecaoCliente(id) {
  if (id === 'MANUAL') {
    limparCliente(true); // Limpa campos mas mantém o select
    document.getElementById('selCliente').value = 'MANUAL';
    document.getElementById('painelManual').style.display = 'block';
    _revelarCardsFluxo();
    toast('Modo Manual: Digite os dados do cliente e equipamento.', 'info');
  } else {
    const pManual = document.getElementById('painelManual');
    if (pManual) pManual.style.display = 'none';
    carregarCliente(id);
  }
}

/* Limpa cliente selecionado e volta ao passo 1 */
function limparCliente(isManual = false) {
  if (!isManual) {
    const sel = document.getElementById('selCliente');
    if (sel) sel.value = '';
  }

  // Limpar hidden fields (agora inputs visíveis no painel manual)
  ['cNome','cCnpj','cEnd','cContato','cTel','cEmail',
   'eMarca','eModelo','eComb','eSerie','eHor'].forEach(id => f(id, ''));

  // Ocultar badge, painel resumo e seletor de equipamento
  const badge = document.getElementById('clienteCarregadoBadge');
  if (badge) badge.style.display = 'none';
  const painel = document.getElementById('painelResumoCliente');
  if (painel) painel.style.display = 'none';
  const selEquip = document.getElementById('cardSelEquip');
  if (selEquip) selEquip.style.display = 'none';
  const pManual = document.getElementById('painelManual');
  if (pManual) pManual.style.display = 'none';

  // Ocultar todos os cards do fluxo
  ['cardHorimetro','cardTecnico','cardTriagem',
   'cardCronometro','cardRelatorio','cardFotos','cardEncerramento'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Voltar foco ao step 1
  const s1 = document.getElementById('cardBuscarCliente');
  if (s1) s1.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function carregarCliente(id) {
  if (!id) return;
  const c = clientes.find(x => x.id === id);
  if (!c) return;

  // Preencher hidden fields com dados do cliente
  f('cNome', c.nome); f('cCnpj', c.cnpj || ''); f('cEnd', c.end);
  f('cContato', c.contato || ''); f('cTel', c.tel || ''); f('cEmail', c.email || '');

  const equips = c.equipamentos || [];

  if (equips.length === 1) {
    // Único equipamento — preenche direto
    const eq = equips[0];
    f('eMarca', eq.marca); f('eModelo', eq.modelo); f('eComb', eq.comb); f('eSerie', eq.serie);
    const badge = document.getElementById('clienteCarregadoBadge');
    const nomeSpan = document.getElementById('clienteCarregadoNome');
    if (badge) badge.style.display = 'flex';
    if (nomeSpan) nomeSpan.textContent = c.nome + ' — ' + eq.marca + ' ' + eq.modelo;
    preencherPainelResumo({ nome: c.nome, cnpj: c.cnpj, end: c.end, tel: c.tel,
      marca: eq.marca, modelo: eq.modelo, serie: eq.serie, comb: eq.comb });
    const cardSel = document.getElementById('cardSelEquip');
    if (cardSel) cardSel.style.display = 'none';
    _revelarCardsFluxo();
    toast('"' + c.nome + '" carregado! Preencha o técnico e a triagem.', 'success');
  } else if (equips.length > 1) {
    // Múltiplos — mostrar seletor
    const badge = document.getElementById('clienteCarregadoBadge');
    const nomeSpan = document.getElementById('clienteCarregadoNome');
    if (badge) badge.style.display = 'flex';
    if (nomeSpan) nomeSpan.textContent = c.nome + ' — selecione o equipamento';
    // Mostrar painel resumo só com dados do cliente (sem equipamento)
    preencherPainelResumo({ nome: c.nome, cnpj: c.cnpj, end: c.end, tel: c.tel,
      marca: '', modelo: '', serie: '', comb: '' });

    // Preencher seletor de equipamento
    const selEl = document.getElementById('selEquipamento');
    if (selEl) {
      selEl.innerHTML = '<option value="">— Selecione o equipamento —</option>' +
        equips.map(eq => `<option value="${eq.id}">${eq.marca} ${eq.modelo} — S/N: ${eq.serie}</option>`).join('');
    }
    const cardSel = document.getElementById('cardSelEquip');
    if (cardSel) cardSel.style.display = 'block';

    // Ocultar cards de trabalho até selecionar equipamento
    ['cardHorimetro','cardTecnico','cardTriagem',
     'cardCronometro','cardRelatorio','cardFotos','cardEncerramento'].forEach(cid => {
      const el = document.getElementById(cid);
      if (el) el.style.display = 'none';
    });
    toast('"' + c.nome + '" — selecione o equipamento abaixo.', 'info');
  }

  autoSave(); prog();

  // Scroll suave até o painel resumo
  setTimeout(() => {
    const p = document.getElementById('painelResumoCliente');
    if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 250);
}

/* Chamado quando seleciona um equipamento específico do cliente (multi-equip) */
function selecionarEquipamento(eqId) {
  if (!eqId) return;
  const cliId = document.getElementById('selCliente').value;
  const c = clientes.find(x => x.id === cliId);
  if (!c) return;
  const equips = c.equipamentos || [];
  const eq = equips.find(e => e.id === eqId);
  if (!eq) return;

  f('eMarca', eq.marca); f('eModelo', eq.modelo); f('eComb', eq.comb); f('eSerie', eq.serie);

  const nomeSpan = document.getElementById('clienteCarregadoNome');
  if (nomeSpan) nomeSpan.textContent = c.nome + ' — ' + eq.marca + ' ' + eq.modelo;

  // Atualizar bloco de equipamento no painel resumo
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt || ''; };
  set('rsEqMarca', eq.marca + ' ' + eq.modelo);
  set('rsEqSerie',  eq.serie ? 'S/N: ' + eq.serie : '');
  set('rsEqComb',   eq.comb  ? '⛽ ' + eq.comb   : '');

  const cardSel = document.getElementById('cardSelEquip');
  if (cardSel) cardSel.style.display = 'none';

  _revelarCardsFluxo();
  autoSave(); prog();
  toast('Equipamento selecionado! Preencha o técnico e a triagem.', 'success');
  setTimeout(() => {
    const tec = document.getElementById('cardTecnico');
    if (tec) tec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 250);
}

/* Revela horímetro + técnico + triagem após seleção completa */
function _revelarCardsFluxo() {
  ['cardHorimetro','cardTecnico','cardTriagem'].forEach(cid => {
    const el = document.getElementById(cid);
    if (el) el.style.display = 'block';
  });
  setTimeout(() => {
    const tec = document.getElementById('cardTecnico');
    if (tec) tec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 250);
}

/* Feature 2: editar cadastro do cliente atual direto do painel resumo */
function editarClienteAtual() {
  const cliId = document.getElementById('selCliente') ? document.getElementById('selCliente').value : '';
  if (cliId) editarCliente(cliId);
}

/* Mostra cards de trabalho após "Iniciar Atendimento" */
function revelarCardsAtendimento() {
  ['cardCronometro','cardRelatorio','cardFotos','cardEncerramento'].forEach(cid => {
    const el = document.getElementById(cid);
    if (el) el.style.display = 'block';
  });
}

/* Ação: Iniciar Atendimento Agora (da triagem) */
function iniciarAtendimentoOS() {
  if (!g('tipo')) { toast('Selecione o tipo do chamado.', 'error'); return; }
  revelarCardsAtendimento();
  setTimeout(() => {
    const cr = document.getElementById('cardCronometro');
    if (cr) cr.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
  toast('Atendimento iniciado! Inicie o cronômetro.', 'success');
}

/* Ação: Salvar como Agendamento (da triagem) */
function salvarAgendamento() {
  if (!g('cNome')) { toast('Selecione um cliente primeiro.', 'error'); return; }
  if (!g('tipo'))  { toast('Selecione o tipo do chamado.', 'error'); return; }
  const agData = g('agendaData');
  if (!agData)     { toast('Informe a data do agendamento.', 'error'); return; }

  const hist = JSON.parse(localStorage.getItem('os_historico') || '[]');
  const os = {
    id: Date.now().toString(),
    numero: cfg.proxOS || 1,
    data: new Date().toISOString(),
    cliNome: g('cNome'), cliCnpj: g('cCnpj'), cliEnd: g('cEnd'),
    cliContato: g('cContato'), cliTel: g('cTel'), cliEmail: g('cEmail'),
    tecNome: g('tNome') || '', eqMarca: g('eMarca'), eqModelo: g('eModelo'),
    eqComb: g('eComb'), eqSerie: g('eSerie'), horimetro: g('eHor'),
    tipoChamado: g('tipo'), prioridade: g('prior'), defeito: g('defeito'),
    servico: '', pecas: '', obs: '', status: 'Agendado',
    agendaData: agData, agendaHora: g('agendaHora'), agendaObs: g('agendaObs'),
    tempo: '00:00:00', timerLog: [],
    fotos: [], horFoto: null, assinatura: null, assinado: false
  };
  hist.unshift(os);
  localStorage.setItem('os_historico', JSON.stringify(hist));

  cfg.proxOS = (cfg.proxOS || 1) + 1;
  localStorage.setItem('os_cfg', JSON.stringify(cfg));
  atualizarNumOS();

  renderDashboard();
  renderCalendario();

  // Mostrar confirmação
  const dtFmt = new Date(agData + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  toast('✅ OS agendada para ' + dtFmt + '!', 'success');

  // Limpar e voltar ao início
  setTimeout(() => {
    if (confirm('Agendamento salvo!\n\nDeseja iniciar uma nova OS?')) novaOS();
  }, 600);
}

/* Atualiza fluxo visual da triagem */
function atualizarFluxoTriagem() { prog(); }

function salvarCliente() {
  const nome = g('cadNome').trim();
  const end = g('cadEnd').trim();
  if (!nome || !end) { toast('Preencha Nome e Endereço (*)', 'error'); return; }

  const equipamentos = lerEquipamentos('cadEquipList');
  const invalido = equipamentos.find(e => !e.marca || !e.modelo || !e.serie);
  if (invalido || equipamentos.length === 0) { toast('Preencha Marca, Modelo e Série de todos os equipamentos (*)', 'error'); return; }

  const novo = {
    id: Date.now().toString(), nome, cnpj: g('cadCnpj'), end,
    contato: g('cadContato'), email: g('cadEmail'), tel: g('cadTel'),
    equipamentos
  };
  clientes.push(novo);
  salvarClientes();
  atualizarSelectCli();
  renderClientList();
  ['cadNome','cadCnpj','cadEnd','cadContato','cadEmail','cadTel'].forEach(id => f(id, ''));
  renderEquipList('cadEquipList', []);
  fecharModal();
  toast('"' + nome + '" cadastrado com sucesso!', 'success');

  if (cfg.googleScript) {
    if (navigator.onLine) {
      fetch(cfg.googleScript, { method:'POST', mode:'no-cors', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'saveCliente', cliente: novo }) }).catch(() => adicionarNaFila('cliente', novo));
    } else { adicionarNaFila('cliente', novo); }
  }
}

/* ===== EDITAR CLIENTE ===== */
function editarCliente(id) {
  const c = clientes.find(x => x.id === id);
  if (!c) return;
  f('editCliId', c.id);
  f('editCliNome', c.nome);
  f('editCliCnpj', c.cnpj || '');
  f('editCliTel', c.tel || '');
  f('editCliEnd', c.end);
  f('editCliContato', c.contato || '');
  f('editCliEmail', c.email || '');
  renderEquipList('editEquipList', c.equipamentos || []);
  abrirModal('modalEditCli');
}

function salvarEdicaoCliente() {
  const id = g('editCliId');
  if (!id) return;
  const nome = g('editCliNome').trim();
  const end = g('editCliEnd').trim();
  if (!nome || !end) { toast('Preencha Nome e Endereço (*)', 'error'); return; }

  const equipamentos = lerEquipamentos('editEquipList');
  const invalido = equipamentos.find(e => !e.marca || !e.modelo || !e.serie);
  if (invalido || equipamentos.length === 0) { toast('Preencha Marca, Modelo e Série de todos os equipamentos (*)', 'error'); return; }

  const idx = clientes.findIndex(x => x.id === id);
  if (idx < 0) return;
  clientes[idx] = {
    ...clientes[idx],
    nome, cnpj: g('editCliCnpj'), end,
    contato: g('editCliContato'), email: g('editCliEmail'),
    tel: g('editCliTel'), equipamentos
  };
  salvarClientes();
  atualizarSelectCli();
  renderClientList();
  fecharModal();

  // Se este cliente está selecionado na OS, atualizar painel resumo
  const selEl = document.getElementById('selCliente');
  if (selEl && selEl.value === id) {
    const c = clientes[idx];
    const eq = c.equipamentos[0] || {};
    preencherPainelResumo({ nome: c.nome, cnpj: c.cnpj, end: c.end, tel: c.tel,
      marca: eq.marca, modelo: eq.modelo, serie: eq.serie, comb: eq.comb });
  }
  toast('"' + nome + '" atualizado com sucesso!', 'success');
}

function renderClientList() {
  const el = document.getElementById('clientList');
  if (!el) return;
  el.innerHTML = '';
  if (clientes.length === 0) {
    el.innerHTML = '<div class="agenda-empty"><i class="fa-solid fa-users"></i> Nenhum cliente cadastrado.</div>';
    return;
  }
  clientes.slice().sort((a, b) => a.nome.localeCompare(b.nome)).forEach(c => {
    const equips = c.equipamentos || [];
    const eqMeta = equips.length === 1
      ? equips[0].marca + ' ' + equips[0].modelo + ' — S/N: ' + equips[0].serie
      : equips.length > 1 ? equips.length + ' equipamentos' : '—';
    const div = document.createElement('div');
    div.className = 'client-item';
    div.innerHTML =
      '<div class="client-item-info"><div class="client-name">' + esc(c.nome) + '</div>' +
      '<div class="client-meta">' + esc(eqMeta) + '</div></div>' +
      '<div class="client-btns">' +
      '<button class="btn btn-ghost btn-icon btn-sm" onclick="carregarCliente(\'' + c.id + '\');switchTab(\'tab-os\')" title="Usar na OS"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>' +
      '<button class="btn btn-outline btn-icon btn-sm" onclick="editarCliente(\'' + c.id + '\')" title="Editar"><i class="fa-solid fa-pen"></i></button>' +
      '<button class="btn btn-danger btn-icon btn-sm" onclick="excluirCliente(\'' + c.id + '\')" title="Excluir"><i class="fa-solid fa-trash"></i></button>' +
      '</div>';
    el.appendChild(div);
  });
}

function excluirCliente(id) {
  const c = clientes.find(x => x.id === id);
  if (!c || !confirm('Excluir o cliente "' + c.nome + '"?')) return;
  clientes = clientes.filter(x => x.id !== id);
  salvarClientes();
  atualizarSelectCli();
  renderClientList();
  toast('Cliente excluído.', 'success');
}

/* ===== RASCUNHO ===== */
const CAMPOS = ['cNome','cCnpj','cEnd','cContato','cTel','cEmail','tNome','eMarca','eModelo',
  'eComb','eSerie','eHor','tipo','prior','defeito','servico','pecas','obs','status',
  'agendaData','agendaHora','agendaObs'];

function autoSave() {
  if (isLocked) return;
  const d = {};
  CAMPOS.forEach(id => { const el = document.getElementById(id); if (el) d[id] = el.value; });
  d._ts = timerSeg; d._st = timerStatus; d._log = tLog; d._locked = isLocked;
  localStorage.setItem('os_rascunho', JSON.stringify(d));
}

function carregarRascunho() {
  const raw = localStorage.getItem('os_rascunho');
  if (!raw) return;
  const d = JSON.parse(raw);
  CAMPOS.forEach(id => { if (d[id] !== undefined) { const el = document.getElementById(id); if (el) el.value = d[id]; } });
  timerSeg = d._ts || 0;
  timerStatus = d._st || 'parado';
  tLog = d._log || [];
  atualizarTimerDisp();
  renderTimerLog();

  // Se há cliente no rascunho, revelar todos os cards do fluxo
  if (d['cNome']) {
    const badge = document.getElementById('clienteCarregadoBadge');
    const nomeSpan = document.getElementById('clienteCarregadoNome');
    if (badge) badge.style.display = 'flex';
    if (nomeSpan) nomeSpan.textContent = (d['cNome'] || '') + (d['eMarca'] ? ' — ' + d['eMarca'] + ' ' + (d['eModelo'] || '') : '');
    // Restaurar painel resumo a partir dos hidden fields
    preencherPainelResumo({
      nome: d['cNome'] || '', cnpj: d['cCnpj'] || '', end: d['cEnd'] || '',
      tel: d['cTel'] || '', marca: d['eMarca'] || '', modelo: d['eModelo'] || '',
      serie: d['eSerie'] || '', comb: d['eComb'] || ''
    });
    ['cardHorimetro','cardTecnico','cardTriagem',
     'cardCronometro','cardRelatorio','cardFotos','cardEncerramento'].forEach(cid => {
      const el = document.getElementById(cid);
      if (el) el.style.display = 'block';
    });
  }

  if (d._locked && localStorage.getItem('os_sig')) {
    const assRaw = localStorage.getItem('os_sig');
    if (assRaw) {
      assinatura = JSON.parse(assRaw);
      assinaturaBase64 = assinatura.img;
      exibirAssinatura();
    }
    bloquearOS();
  } else {
    const btnI = document.getElementById('btnIni'), btnP = document.getElementById('btnPau');
    if (timerStatus === 'finalizado') {
      if (btnI) { btnI.disabled = true; btnI.innerHTML = '<i class="fa-solid fa-lock"></i> Encerrado'; }
      if (btnP) btnP.disabled = true;
    } else if (timerStatus === 'pausado') {
      if (btnI) btnI.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Retomar';
      if (btnP) btnP.disabled = true;
    } else if (timerStatus === 'rodando') {
      timerStatus = 'parado';
      iniciarTimer();
    }
  }

  const fotosRaw = localStorage.getItem('os_fotos');
  if (fotosRaw) { fotos = JSON.parse(fotosRaw); renderFotos(); }

  const assRaw2 = localStorage.getItem('os_sig');
  if (assRaw2 && !assinatura) {
    assinatura = JSON.parse(assRaw2);
    assinaturaBase64 = assinatura.img;
    exibirAssinatura();
  }

  const horRaw = localStorage.getItem('os_hor_foto');
  if (horRaw) {
    horFoto = horRaw;
    const prev = document.getElementById('horPrev');
    if (prev) { prev.src = horRaw; prev.classList.add('vis'); }
    const bF = document.getElementById('btnFotHor'), bR = document.getElementById('btnRmHor');
    if (bF) bF.style.display = 'none';
    if (bR) bR.style.display = 'flex';
  }
  prog();
}

/* ===== CRONÔMETRO ===== */
function horaAtual() { return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function fmtTempo(s) { return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':'); }
function atualizarTimerDisp() { const el = document.getElementById('timerDisp'); if (el) el.textContent = fmtTempo(timerSeg); }

function renderTimerLog() {
  const el = document.getElementById('timerLog');
  if (!el) return;
  if (tLog.length === 0) {
    el.innerHTML = '<div class="timer-log-item" style="color:rgba(255,255,255,0.28)">Aguardando início...</div>';
    return;
  }
  el.innerHTML = tLog.map(item => {
    let extra = item.parcial ? ' <strong style="color:var(--warning)">(' + item.parcial + ')</strong>' : '';
    if (item.total) extra = ' <strong style="color:var(--success)">[TOTAL: ' + item.total + ']</strong>';
    return '<div class="timer-log-item">⏱ <strong>' + item.hora + '</strong> — ' + item.evento + extra + '</div>';
  }).join('');
  el.scrollTop = el.scrollHeight;
}

function iniciarTimer() {
  if (timerStatus === 'rodando') return;
  tLog.push({ evento: timerStatus === 'parado' ? 'Início do atendimento' : 'Retorno do atendimento', hora: horaAtual() });
  timerStatus = 'rodando';
  const btnI = document.getElementById('btnIni'), btnP = document.getElementById('btnPau');
  if (btnI) { btnI.disabled = true; btnI.innerHTML = '<i class="fa-solid fa-spinner spin"></i> Em andamento'; }
  if (btnP) btnP.disabled = false;
  timerInt = setInterval(() => { timerSeg++; atualizarTimerDisp(); if (timerSeg % 15 === 0) autoSave(); }, 1000);
  renderTimerLog(); prog(); autoSave();
}

function pausarTimer(motivo) {
  if (timerStatus !== 'rodando') return;
  clearInterval(timerInt);
  timerStatus = 'pausado';
  tLog.push({ evento: 'Pausa — ' + motivo, hora: horaAtual(), parcial: fmtTempo(timerSeg) });
  const btnI = document.getElementById('btnIni'), btnP = document.getElementById('btnPau');
  if (btnI) { btnI.disabled = false; btnI.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Retomar'; }
  if (btnP) btnP.disabled = true;
  renderTimerLog(); autoSave();
}

function finalizarTimer() {
  if (timerStatus === 'finalizado') return;
  if (timerInt) clearInterval(timerInt);
  timerStatus = 'finalizado';
  tLog.push({ evento: 'Atendimento finalizado', hora: horaAtual(), total: fmtTempo(timerSeg) });
  const btnI = document.getElementById('btnIni'), btnP = document.getElementById('btnPau');
  if (btnI) { btnI.disabled = true; btnI.innerHTML = '<i class="fa-solid fa-lock"></i> Encerrado'; }
  if (btnP) btnP.disabled = true;
  localStorage.setItem('os_tempo_final', fmtTempo(timerSeg));
  renderTimerLog(); prog(); autoSave();
}

function toggleMotivoOutro(val) {
  const wrap = document.getElementById('motivoOutroWrap');
  if (wrap) wrap.style.display = val === 'Outro' ? 'block' : 'none';
}

function confirmarPausa() {
  let motivo = g('motivoPausa');
  if (motivo === 'Outro') {
    motivo = g('motivoOutro').trim() || 'Outro motivo';
  }
  pausarTimer(motivo);
  fecharModal();
}

/* ===== FOTOS ===== */
function addFotos(input) {
  const files = Array.from(input.files);
  if (fotos.length + files.length > MAX_FOTOS) {
    toast('Limite de ' + MAX_FOTOS + ' fotos atingido!', 'error');
    return;
  }
  let processados = 0;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const c = document.createElement('canvas');
        const max = 1200, scale = img.width > max ? max / img.width : 1;
        c.width = img.width * scale; c.height = img.height * scale;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        fotos.push(c.toDataURL('image/jpeg', 0.80));
        processados++;
        if (processados === files.length) {
          try { localStorage.setItem('os_fotos', JSON.stringify(fotos)); } catch(ex) {}
          renderFotos();
          autoSave();
        }
      };
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function renderFotos() {
  const grid = document.getElementById('photosGrid');
  const cnt = document.getElementById('fotoCnt');
  if (!grid) return;
  if (cnt) cnt.textContent = fotos.length;
  const btn = '<div class="photo-add-btn" onclick="document.getElementById(\'inputFotos\').click()"><i class="fa-solid fa-camera-retro"></i><span>Câmera / Galeria</span></div>';
  grid.innerHTML = btn + fotos.map((src, i) =>
    '<div class="photo-item"><img src="' + src + '" alt="Foto ' + (i+1) + '" onclick="abrirLightbox(\'' + i + '\')">' +
    '<button class="photo-remove" onclick="removerFoto(' + i + ')">×</button></div>'
  ).join('');
}

function removerFoto(idx) {
  fotos.splice(idx, 1);
  try { localStorage.setItem('os_fotos', JSON.stringify(fotos)); } catch(ex) {}
  renderFotos();
}

function abrirLightbox(idx) {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lbImg');
  if (!lb || !img) return;
  const src = typeof idx === 'number' ? fotos[idx] : idx;
  if (!src) return;
  img.src = src;
  lb.classList.add('open');
}

function fecharLightbox() {
  const lb = document.getElementById('lightbox');
  if (lb) lb.classList.remove('open');
}

/* ===== ASSINATURA ===== */
function initSigCanvas() {
  const canvas = document.getElementById('sigCanvas');
  const wrap = document.getElementById('sigCanvasWrap');
  if (!canvas || !wrap) return;
  canvas.width = wrap.clientWidth || 320;
  canvas.height = wrap.clientHeight || 180;
  sigCtx = canvas.getContext('2d');
  sigCtx.strokeStyle = '#1e1e2e';
  sigCtx.lineWidth = 2.5;
  sigCtx.lineCap = 'round';
  sigCtx.lineJoin = 'round';
  canvas.addEventListener('mousedown', sigStart);
  canvas.addEventListener('mousemove', sigMove);
  canvas.addEventListener('mouseup', sigEnd);
  canvas.addEventListener('touchstart', sigStartT, { passive: false });
  canvas.addEventListener('touchmove', sigMoveT, { passive: false });
  canvas.addEventListener('touchend', sigEnd);
}

function sigStart(e) {
  sigDrawing = true;
  sigCtx.beginPath();
  const r = e.target.getBoundingClientRect();
  sigCtx.moveTo(e.clientX - r.left, e.clientY - r.top);
}
function sigMove(e) {
  if (!sigDrawing) return;
  const r = e.target.getBoundingClientRect();
  sigCtx.lineTo(e.clientX - r.left, e.clientY - r.top);
  sigCtx.stroke();
}
function sigEnd() { sigDrawing = false; }
function sigStartT(e) { e.preventDefault(); const t = e.touches[0]; sigStart({ target: e.target, clientX: t.clientX, clientY: t.clientY }); }
function sigMoveT(e) { e.preventDefault(); const t = e.touches[0]; sigMove({ target: e.target, clientX: t.clientX, clientY: t.clientY }); }
function clearSig() { if (sigCtx) sigCtx.clearRect(0, 0, sigCtx.canvas.width, sigCtx.canvas.height); }

function salvarSig() {
  const nome = g('sigNome').trim();
  const doc = g('sigDoc').trim();
  if (!nome || !doc) { toast('Preencha nome e documento do responsável.', 'error'); return; }
  const canvas = document.getElementById('sigCanvas');
  assinaturaBase64 = canvas.toDataURL('image/png');
  assinatura = { img: assinaturaBase64, nome, doc, ts: new Date().toISOString() };
  localStorage.setItem('os_sig', JSON.stringify(assinatura));
  exibirAssinatura();
  finalizarTimer();
  fecharModal();
  toast('Assinatura salva! Agora gere o PDF.', 'success');
  document.getElementById('btnPdf').disabled = false;
  bloquearOS();
}

function exibirAssinatura() {
  const prev = document.getElementById('sigPreview');
  if (!prev || !assinatura) return;
  prev.innerHTML = '<img src="' + assinatura.img + '" style="max-width:100%;max-height:100px;border-radius:6px">' +
    '<div style="font-size:11px;color:var(--gray);text-align:center;margin-top:4px">' +
    esc(assinatura.nome) + ' — ' + esc(assinatura.doc) + '</div>';
}

/* ===== SALVAR OS ===== */
function salvarOS(fromSignature) {
  if (!fromSignature && assinatura) {
    finalizarTimer();
    salvarOS(true);
    return;
  }
  if (!g('cNome')) { toast('Preencha o nome do cliente.', 'error'); return; }
  if (!g('tNome')) { toast('Preencha o nome do técnico.', 'error'); return; }
  if (!g('servico')) { toast('Preencha o serviço executado.', 'error'); return; }

  let hist = JSON.parse(localStorage.getItem('os_historico') || '[]');
  
  const osNumTxt = document.getElementById('osNum').textContent.replace('#','');
  const numAtual = editingOSId ? parseInt(osNumTxt) : (cfg.proxOS || 1);

  const os = {
    id: editingOSId || Date.now().toString(),
    numero: numAtual,
    data: new Date().toISOString(),
    cliNome: g('cNome'), cliCnpj: g('cCnpj'), cliEnd: g('cEnd'),
    cliContato: g('cContato'), cliTel: g('cTel'), cliEmail: g('cEmail'),
    tecNome: g('tNome'), eqMarca: g('eMarca'), eqModelo: g('eModelo'),
    eqComb: g('eComb'), eqSerie: g('eSerie'), horimetro: g('eHor'),
    tipoChamado: g('tipo'), prioridade: g('prior'), defeito: g('defeito'),
    servico: g('servico'), pecas: g('pecas'), obs: g('obs'), status: g('status'),
    agendaData: g('agendaData'), agendaHora: g('agendaHora'), agendaObs: g('agendaObs'),
    tempo: fmtTempo(timerSeg), timerLog: tLog,
    fotos, horFoto, assinatura, assinado: !!assinatura
  };

  if (editingOSId) {
    const idx = hist.findIndex(x => x.id === editingOSId);
    if (idx > -1) {
       os.data = hist[idx].data; // Mantém a data original
       hist[idx] = os;
    } else {
       hist.unshift(os);
    }
    editingOSId = null;
  } else {
    hist.unshift(os);
    cfg.proxOS = (cfg.proxOS || 1) + 1;
    localStorage.setItem('os_cfg', JSON.stringify(cfg));
    atualizarNumOS();
  }

  localStorage.setItem('os_historico', JSON.stringify(hist));
  ultimaOSSalva = os;

  ['os_rascunho','os_fotos','os_sig','os_tempo_final','os_hor_foto'].forEach(k => localStorage.removeItem(k));

  renderDashboard();
  renderCalendario();
  calcularAlertasHorimetro();

  const finEl = document.getElementById('finOSNum');
  if (finEl) finEl.textContent = fmtNum(os.numero) + ' — ' + esc(os.cliNome);
  abrirModal('modalFinalizada');
}

/* ===== NOVA OS ===== */
function novaOS() {
  if (isLocked && !confirm('Deseja iniciar uma nova OS? A OS atual ficará no histórico.')) return;
  // Reset form
  CAMPOS.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.value = 'Concluído';
  const priorEl = document.getElementById('prior');
  if (priorEl) priorEl.value = 'Normal';
  fotos = []; horFoto = null; assinatura = null; assinaturaBase64 = null;
  timerSeg = 0; timerStatus = 'parado'; tLog = [];
  isLocked = false;
  editingOSId = null;
  const pManual = document.getElementById('painelManual');
  if (pManual) pManual.style.display = 'none';

  // Reset timer UI
  const btnI = document.getElementById('btnIni'), btnP = document.getElementById('btnPau');
  if (btnI) { btnI.disabled = false; btnI.innerHTML = '<i class="fa-solid fa-play"></i> Iniciar'; }
  if (btnP) btnP.disabled = true;
  if (timerInt) { clearInterval(timerInt); timerInt = null; }
  atualizarTimerDisp();
  renderTimerLog();

  // Reset foto horímetro
  const prev = document.getElementById('horPrev');
  if (prev) { prev.src = ''; prev.classList.remove('vis'); }
  const bF = document.getElementById('btnFotHor'), bR = document.getElementById('btnRmHor');
  if (bF) bF.style.display = 'flex';
  if (bR) bR.style.display = 'none';

  // Reset assinatura
  const sigPrev = document.getElementById('sigPreview');
  if (sigPrev) sigPrev.innerHTML = '<div class="sig-placeholder"><i class="fa-solid fa-pen-nib" style="font-size:26px;opacity:0.25"></i><span>Toque para assinar</span></div>';

  // Reset botões encerramento
  const btnPdf = document.getElementById('btnPdf');
  if (btnPdf) btnPdf.disabled = true;
  const btnSalvar = document.getElementById('btnSalvar');
  if (btnSalvar) btnSalvar.disabled = false;
  const btnEdit = document.getElementById('btnEditar');
  if (btnEdit) btnEdit.style.display = 'none';
  const btnSig = document.getElementById('btnAbrirSig');
  if (btnSig) btnSig.style.display = 'inline-flex';

  // Re-enable all inputs
  document.querySelectorAll('#tab-os input, #tab-os select, #tab-os textarea')
    .forEach(el => { el.disabled = false; });

  // Resetar fluxo em etapas: ocultar todos exceto step1
  const badge = document.getElementById('clienteCarregadoBadge');
  if (badge) badge.style.display = 'none';
  const painelRes = document.getElementById('painelResumoCliente');
  if (painelRes) painelRes.style.display = 'none';
  const cardSelEquip = document.getElementById('cardSelEquip');
  if (cardSelEquip) cardSelEquip.style.display = 'none';
  const sel = document.getElementById('selCliente');
  if (sel) sel.value = '';
  ['cardHorimetro','cardTecnico','cardTriagem',
   'cardCronometro','cardRelatorio','cardFotos','cardEncerramento'].forEach(cid => {
    const el = document.getElementById(cid);
    if (el) el.style.display = 'none';
  });

  ['os_rascunho','os_fotos','os_sig','os_tempo_final','os_hor_foto'].forEach(k => localStorage.removeItem(k));
  renderFotos();
  atualizarDataHora();
  atualizarNumOS();
  prog();
  switchTab('tab-os');
  // Scroll ao topo do step 1
  setTimeout(() => {
    const s1 = document.getElementById('cardBuscarCliente');
    if (s1) s1.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}

/* ===== CARREGAR OS AGENDADA PARA ATENDIMENTO ===== */
function carregarOSParaAtendimento(id) {
  const hist = JSON.parse(localStorage.getItem('os_historico') || '[]');
  const os = hist.find(x => x.id === id);
  if (!os) { toast('OS não encontrada.', 'error'); return; }

  if (!confirm('Carregar OS ' + fmtNum(os.numero) + ' — ' + (os.cliNome || '') + '\npara atendimento agora?')) return;

  switchTab('tab-os');

  // Preencher hidden fields com dados do cadastro guardados na OS
  f('cNome', os.cliNome || ''); f('cCnpj', os.cliCnpj || ''); f('cEnd', os.cliEnd || '');
  f('cContato', os.cliContato || ''); f('cTel', os.cliTel || ''); f('cEmail', os.cliEmail || '');
  f('eMarca', os.eqMarca || ''); f('eModelo', os.eqModelo || '');
  f('eComb', os.eqComb || ''); f('eSerie', os.eqSerie || '');
  f('eHor', os.horimetro || '');
  f('tNome', os.tecNome || '');

  const tipoEl = document.getElementById('tipo');
  if (tipoEl) Array.from(tipoEl.options).forEach(opt => { if (opt.value === os.tipoChamado) tipoEl.value = opt.value; });
  const priorEl = document.getElementById('prior');
  if (priorEl) Array.from(priorEl.options).forEach(opt => { if (opt.value === os.prioridade) priorEl.value = opt.value; });
  f('defeito', os.defeito || '');
  f('agendaData', os.agendaData || ''); f('agendaHora', os.agendaHora || ''); f('agendaObs', os.agendaObs || '');

  // Mostrar badge de confirmação
  const badge = document.getElementById('clienteCarregadoBadge');
  const nomeSpan = document.getElementById('clienteCarregadoNome');
  if (badge) badge.style.display = 'flex';
  if (nomeSpan) nomeSpan.textContent = (os.cliNome || '') + ' — ' + (os.eqMarca || '') + ' ' + (os.eqModelo || '');

  // Restaurar painel resumo
  preencherPainelResumo({
    nome: os.cliNome || '', cnpj: os.cliCnpj || '', end: os.cliEnd || '',
    tel: os.cliTel || '', marca: os.eqMarca || '', modelo: os.eqModelo || '',
    serie: os.eqSerie || '', comb: os.eqComb || ''
  });

  // Revelar todos os cards
  ['cardHorimetro','cardTecnico','cardTriagem',
   'cardCronometro','cardRelatorio','cardFotos','cardEncerramento'].forEach(cid => {
    const el = document.getElementById(cid);
    if (el) el.style.display = 'block';
  });

  // Status como Pendente (em andamento)
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.value = 'Pendente';

  autoSave(); prog();
  toast('OS ' + fmtNum(os.numero) + ' carregada! Inicie o cronômetro.', 'success');

  setTimeout(() => {
    const cr = document.getElementById('cardCronometro');
    if (cr) cr.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 300);
}

/* ===== HISTÓRICO ===== */
function renderHist() {
  const el = document.getElementById('osList');
  const tot = document.getElementById('totalOS');
  if (!el) return;
  const hist = JSON.parse(localStorage.getItem('os_historico') || '[]');

  // Busca multi-campo incluindo S/N, modelo, série
  const q = (g('busca') || '').toLowerCase().trim();
  const filtroStatus = (document.getElementById('filtroStatus') || {}).value || '';
  const filtroTipo   = (document.getElementById('filtroTipo')   || {}).value || '';

  let filtered = hist;
  if (q) {
    filtered = filtered.filter(os =>
      (os.cliNome   || '').toLowerCase().includes(q) ||
      (os.eqMarca   || '').toLowerCase().includes(q) ||
      (os.eqModelo  || '').toLowerCase().includes(q) ||
      (os.eqSerie   || '').toLowerCase().includes(q) ||
      (os.tecNome   || '').toLowerCase().includes(q) ||
      (os.defeito   || '').toLowerCase().includes(q) ||
      (os.tipoChamado || '').toLowerCase().includes(q) ||
      (os.status    || '').toLowerCase().includes(q) ||
      String(os.numero || '').includes(q)
    );
  }
  if (filtroStatus) filtered = filtered.filter(os => os.status === filtroStatus);
  if (filtroTipo)   filtered = filtered.filter(os => os.tipoChamado === filtroTipo);

  // Chips de busca ativa
  const chipsEl = document.getElementById('histBuscaChips');
  if (chipsEl) {
    const chips = [];
    if (q) chips.push('<span class="hist-chip"><i class="fa-solid fa-magnifying-glass"></i> "' + esc(q) + '" <button onclick="limparBusca()">×</button></span>');
    if (filtroStatus) chips.push('<span class="hist-chip"><i class="fa-solid fa-circle-dot"></i> ' + esc(filtroStatus) + ' <button onclick="document.getElementById(\'filtroStatus\').value=\'\';renderHist()">×</button></span>');
    if (filtroTipo)   chips.push('<span class="hist-chip"><i class="fa-solid fa-tag"></i> ' + esc(filtroTipo)   + ' <button onclick="document.getElementById(\'filtroTipo\').value=\'\';renderHist()">×</button></span>');
    chipsEl.innerHTML = chips.join('');
    chipsEl.style.display = chips.length ? 'flex' : 'none';
  }

  if (tot) tot.textContent = hist.length;
  if (filtered.length === 0) {
    el.innerHTML = '<div class="os-empty"><i class="fa-solid fa-magnifying-glass"></i><p>' +
      (q || filtroStatus || filtroTipo ? 'Nenhum resultado encontrado.' : 'Nenhuma OS registrada.') + '</p></div>';
    return;
  }
  const statusBadge = {
    'Concluído':'badge-green','Concluido':'badge-green',
    'Pendente':'badge-orange','Aguardando Peça':'badge-blue',
    'Orçamento Enviado':'badge-purple','Agendado':'badge-blue'
  };
  const tipoBadge = {
    'Emergencial':'badge-red','Corretivo':'badge-orange',
    'Preventivo':'badge-green','Garantia':'badge-purple',
    'Orçamento':'badge-blue','Instalação':'badge-gray'
  };
  el.innerHTML = filtered.map(os => {
    const dt = new Date(os.data);
    const isAgendado = os.status === 'Agendado';
    // Destacar termo buscado (aplica regex no texto original, depois escapa cada segmento)
    const destaque = (txt) => {
      if (!q || !txt) return esc(txt || '');
      const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'gi');
      return txt.replace(re, '\x00$1\x00').split('\x00').map((parte, i) =>
        i % 2 === 1 ? '<mark class="busca-hl">' + esc(parte) + '</mark>' : esc(parte)
      ).join('');
    };
    return '<div class="os-card' + (isAgendado ? ' os-card-agendado' : '') + '">' +
      '<div class="os-card-top"><div class="os-card-info">' +
      '<div class="os-num">' + fmtNum(os.numero) + ' — ' + dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) + '</div>' +
      '<div class="os-cliente">' + destaque(os.cliNome) + '</div>' +
      '<div class="os-meta">' + destaque(os.eqMarca + ' ' + os.eqModelo) + (os.eqSerie ? ' <span class="os-serie">S/N: ' + destaque(os.eqSerie) + '</span>' : '') + (os.horimetro ? ' — ' + os.horimetro + 'h' : '') + ' — Tec: ' + esc(os.tecNome || '--') + '</div>' +
      '<div class="os-tags">' +
      '<span class="badge ' + (tipoBadge[os.tipoChamado] || 'badge-gray') + '">' + esc(os.tipoChamado||'--') + '</span>' +
      '<span class="badge ' + (statusBadge[os.status]   || 'badge-gray') + '">' + esc(os.status||'--')     + '</span>' +
      (os.assinado ? '<span class="badge badge-green"><i class="fa-solid fa-check"></i> Assinado</span>' : '') +
      '</div></div></div>' +
      '<div class="os-actions">' +
      (isAgendado ? '<button class="btn btn-atendimento-sm btn-sm" onclick="carregarOSParaAtendimento(\''+os.id+'\')"><i class="fa-solid fa-play-circle"></i> Atender</button>' : '') +
      '<button class="btn btn-ghost btn-sm" onclick="verOS(\''+os.id+'\')"><i class="fa-solid fa-eye"></i> Ver</button>' +
      '<button class="btn btn-outline btn-sm" onclick="editarOS(\''+os.id+'\')"><i class="fa-solid fa-pen"></i> Editar</button>' +
      '<button class="btn btn-secondary btn-sm" onclick="gerarPDFPorId(\''+os.id+'\')"><i class="fa-solid fa-file-pdf"></i> PDF</button>' +
      '<button class="btn btn-danger btn-sm" onclick="excluirOS(\''+os.id+'\')"><i class="fa-solid fa-trash"></i></button>' +
      '</div></div>';
  }).join('');
}

function limparBusca() {
  const b = document.getElementById('busca');
  if (b) b.value = '';
  renderHist();
}

function excluirOS(id) {
  if (!confirm('Excluir esta OS permanentemente?')) return;
  let hist = JSON.parse(localStorage.getItem('os_historico') || '[]');
  hist = hist.filter(x => x.id !== id);
  localStorage.setItem('os_historico', JSON.stringify(hist));
  renderHist();
  renderDashboard();
  renderCalendario();
  toast('OS excluída.', 'success');
}

function verOS(id) {
  const hist = JSON.parse(localStorage.getItem('os_historico') || '[]');
  const os = hist.find(x => x.id === id);
  if (!os) return;
  viewingOS = os;
  const body = document.getElementById('verOSBody');
  if (!body) return;
  const dt = new Date(os.data);
  body.innerHTML =
    '<div class="ver-section"><div class="ver-label">OS / Data</div><div class="ver-value">' + fmtNum(os.numero) + ' — ' + dt.toLocaleDateString('pt-BR') + '</div></div>' +
    '<div class="ver-section"><div class="ver-label">Cliente</div><div class="ver-value">' + esc(os.cliNome) + (os.cliCnpj ? '<br><span style="font-size:12px;color:var(--gray)">CNPJ: ' + esc(os.cliCnpj) + '</span>' : '') + '</div></div>' +
    '<div class="ver-section"><div class="ver-label">Técnico</div><div class="ver-value">' + esc(os.tecNome) + '</div></div>' +
    '<div class="ver-section"><div class="ver-label">Equipamento</div><div class="ver-value">' + esc(os.eqMarca) + ' ' + esc(os.eqModelo) + ' — S/N: ' + esc(os.eqSerie) + (os.horimetro ? '<br>Horímetro: ' + esc(os.horimetro) + 'h' : '') + '</div></div>' +
    '<div class="ver-section"><div class="ver-label">Tipo / Status</div><div class="ver-value">' + esc(os.tipoChamado || '--') + ' — ' + esc(os.status || '--') + '</div></div>' +
    '<div class="ver-section"><div class="ver-label">Defeito</div><div class="ver-value">' + esc(os.defeito || '--') + '</div></div>' +
    '<div class="ver-section"><div class="ver-label">Serviço Executado</div><div class="ver-value" style="white-space:pre-wrap">' + esc(os.servico || '--') + '</div></div>' +
    (os.pecas ? '<div class="ver-section"><div class="ver-label">Peças</div><div class="ver-value" style="white-space:pre-wrap">' + esc(os.pecas) + '</div></div>' : '') +
    '<div class="ver-section"><div class="ver-label">Tempo Total</div><div class="ver-value">' + esc(os.tempo || '00:00:00') + '</div></div>' +
    (os.agendaData ? '<div class="ver-section"><div class="ver-label">Agendamento</div><div class="ver-value">' + esc(os.agendaData) + (os.agendaHora ? ' às ' + esc(os.agendaHora) : '') + '</div></div>' : '') +
    ((os.fotos && os.fotos.length > 0) ? '<div class="ver-section"><div class="ver-label">Fotos (' + os.fotos.length + ')</div><div class="photos-grid" style="margin-top:6px">' + os.fotos.map((src, i) => '<div class="photo-item"><img src="' + src + '" onclick="abrirLightbox(\'' + src + '\')"></div>').join('') + '</div></div>' : '') +
    (os.assinatura ? '<div class="ver-section"><div class="ver-label">Assinatura</div><img src="' + os.assinatura.img + '" style="max-width:100%;max-height:80px;border-radius:6px"><div style="font-size:11px;color:var(--gray);margin-top:4px">' + esc(os.assinatura.nome) + ' — ' + esc(os.assinatura.doc) + '</div></div>' : '');
  abrirModal('modalVerOS');
}

function gerarPDFHistorico() {
  if (!viewingOS) return;
  _buildPDFFromOS(viewingOS);
  fecharModal();
}

function gerarPDFPorId(id) {
  const hist = JSON.parse(localStorage.getItem('os_historico') || '[]');
  const os = hist.find(x => x.id === id);
  if (!os) { toast('OS não encontrada.', 'error'); return; }
  _buildPDFFromOS(os);
}

function editarOS(id) {
  const hist = JSON.parse(localStorage.getItem('os_historico') || '[]');
  const os = hist.find(x => x.id === id);
  if (!os) return;

  fecharModal(); // Fecha lista do histórico ou "Ver OS" se estiver aberto
  switchTab('tab-os');
  editingOSId = id; // Marca como modo de edição
  
  // Força o modo manual para carregar os dados livremente
  const selCli = document.getElementById('selCliente');
  if (selCli) selCli.value = 'MANUAL';
  
  const pManual = document.getElementById('painelManual');
  if (pManual) pManual.style.display = 'block';
  
  const pResumo = document.getElementById('painelResumoCliente');
  if (pResumo) pResumo.style.display = 'none';
  
  const pEquip = document.getElementById('cardSelEquip');
  if (pEquip) pEquip.style.display = 'none';
  
  const badge = document.getElementById('clienteCarregadoBadge');
  if (badge) badge.style.display = 'none';

  // Preenche dados da OS
  document.getElementById('osNum').textContent = '#' + String(os.numero).padStart(6, '0');
  
  f('cNome', os.cliNome || ''); f('cCnpj', os.cliCnpj || ''); f('cEnd', os.cliEnd || '');
  f('cContato', os.cliContato || ''); f('cTel', os.cliTel || ''); f('cEmail', os.cliEmail || '');
  f('eMarca', os.eqMarca || ''); f('eModelo', os.eqModelo || '');
  f('eComb', os.eqComb || ''); f('eSerie', os.eqSerie || ''); f('eHor', os.horimetro || '');

  f('tNome', os.tecNome || '');
  f('tipo', os.tipoChamado || ''); f('prior', os.prioridade || 'Normal');
  f('defeito', os.defeito || '');
  f('agendaData', os.agendaData || ''); f('agendaHora', os.agendaHora || ''); f('agendaObs', os.agendaObs || '');
  f('servico', os.servico || ''); f('pecas', os.pecas || ''); f('obs', os.obs || '');
  f('status', os.status || 'Concluído');

  // Restaura cronômetro, fotos e assinatura
  const p = (os.tempo || '00:00:00').split(':');
  if(p.length === 3) timerSeg = (+p[0])*3600 + (+p[1])*60 + (+p[2]);
  atualizarTimerDisp();
  tLog = os.timerLog || []; renderTimerLog();
  fotos = os.fotos || []; renderFotos();
  assinatura = os.assinatura || null; exibirAssinatura();

  _revelarCardsFluxo();
  revelarCardsAtendimento();
  toast('Modo edição: Alterando OS #' + os.numero, 'warning');
}

function salvarEdicaoOS() {
  toast('A edição foi movida para a tela principal!', 'info');
}

/* ===== GERAR PDF DA ÚLTIMA OS ===== */
function gerarPDFUltimaOS() {
  if (!ultimaOSSalva) { toast('Nenhuma OS disponível para PDF.', 'error'); return; }
  _buildPDFFromOS(ultimaOSSalva);
  fecharModal();
}

/* ===== GERAR PDF (OS ATUAL) ===== */
function gerarPDF() {
  const osData = {
    numero: cfg.proxOS || 1, data: new Date().toISOString(),
    cliNome: g('cNome'), cliCnpj: g('cCnpj'), cliEnd: g('cEnd'),
    cliContato: g('cContato'), cliTel: g('cTel'), cliEmail: g('cEmail'),
    tecNome: g('tNome'), eqMarca: g('eMarca'), eqModelo: g('eModelo'),
    eqComb: g('eComb'), eqSerie: g('eSerie'), horimetro: g('eHor'),
    tipoChamado: g('tipo'), prioridade: g('prior'), defeito: g('defeito'),
    servico: g('servico'), pecas: g('pecas'), obs: g('obs'), status: g('status'),
    agendaData: g('agendaData'), agendaHora: g('agendaHora'),
    tempo: fmtTempo(timerSeg), timerLog: tLog,
    fotos, horFoto, assinatura
  };
  _buildPDFFromOS(osData);
}

/* ===================================================================
   FEATURE 2 — ALERTAS DE MANUTENÇÃO PREVENTIVA POR HORÍMETRO
   Intervalo padrão: 250h. Alerta amarelo ≥ 220h, vermelho ≥ 250h
   =================================================================== */
const PREV_INTERVALO = 250;   // horas entre preventivas
const PREV_AVISO     = 220;   // horas — zona de atenção

function calcularAlertasHorimetro() {
  const el = document.getElementById('alertasList');
  if (!el) return;
  const hist = JSON.parse(localStorage.getItem('os_historico') || '[]');
  if (hist.length === 0) { el.innerHTML = '<div class="agenda-empty"><i class="fa-solid fa-circle-check"></i> Nenhum alerta no momento.</div>'; return; }

  // Para cada equipamento único (por S/N), encontrar a última preventiva
  // e calcular horas desde então usando a última OS registrada
  const equipMap = {};
  hist.forEach(os => {
    const key = (os.eqSerie || (os.eqMarca + '_' + os.eqModelo + '_' + os.cliNome)).trim().toLowerCase();
    if (!equipMap[key]) equipMap[key] = { os: [], key, eqMarca: os.eqMarca, eqModelo: os.eqModelo, eqSerie: os.eqSerie, cliNome: os.cliNome };
    equipMap[key].os.push(os);
  });

  const alertas = [];
  Object.values(equipMap).forEach(eq => {
    const sorted = eq.os.slice().sort((a,b) => new Date(b.data) - new Date(a.data));
    const ultima  = sorted[0]; // OS mais recente deste equip
    const ultimaPreventiva = sorted.find(o => o.tipoChamado === 'Preventivo');

    const horAtual   = parseFloat(ultima.horimetro) || 0;
    const horPrev    = ultimaPreventiva ? (parseFloat(ultimaPreventiva.horimetro) || 0) : 0;
    const deltaH     = horAtual - horPrev;

    // Só alertar se tiver horímetro registrado
    if (!ultima.horimetro) return;
    if (deltaH < PREV_AVISO) return;

    const nivel = deltaH >= PREV_INTERVALO ? 'alerta-venc' : 'alerta-atencao';
    const icone = deltaH >= PREV_INTERVALO ? 'fa-triangle-exclamation' : 'fa-bell';
    const label = deltaH >= PREV_INTERVALO ? 'VENCIDA' : 'ATENÇÃO';
    const dias  = ultimaPreventiva ? Math.round((new Date(ultima.data) - new Date(ultimaPreventiva.data)) / 86400000) : null;

    alertas.push({ nivel, icone, label, deltaH, horAtual, horPrev, dias,
      cliNome: eq.cliNome, eqMarca: eq.eqMarca, eqModelo: eq.eqModelo, eqSerie: eq.eqSerie });
  });

  if (alertas.length === 0) {
    el.innerHTML = '<div class="agenda-empty"><i class="fa-solid fa-circle-check"></i> Nenhum equipamento com alerta pendente.</div>';
    return;
  }

  // Ordenar: vencidos primeiro
  alertas.sort((a,b) => b.deltaH - a.deltaH);

  el.innerHTML = alertas.map(a =>
    '<div class="alerta-item ' + a.nivel + '">' +
      '<div class="alerta-icone"><i class="fa-solid ' + a.icone + '"></i></div>' +
      '<div class="alerta-info">' +
        '<div class="alerta-titulo">' + esc(a.cliNome) + '</div>' +
        '<div class="alerta-sub">' + esc(a.eqMarca) + ' ' + esc(a.eqModelo) + (a.eqSerie ? ' — S/N: ' + esc(a.eqSerie) : '') + '</div>' +
        '<div class="alerta-detalhe">' +
          'Horímetro atual: <strong>' + a.horAtual + 'h</strong> — ' +
          'Desde última prev.: <strong>' + (a.horPrev ? a.horPrev + 'h' : 'nunca') + '</strong>' +
          (a.dias !== null ? ' (' + a.dias + ' dias)' : '') +
        '</div>' +
      '</div>' +
      '<span class="alerta-badge">' + a.label + '<br>' + Math.round(a.deltaH) + 'h</span>' +
    '</div>'
  ).join('');
}

/* ===================================================================
   FEATURE 3 — PDF RELATÓRIO COMPLETO POR CLIENTE
   =================================================================== */

/* Popula o select do modal e abre */
function abrirModal_RelCliente() {
  const sel = document.getElementById('relCliSelect');
  if (sel) {
    sel.innerHTML = '<option value="">— Selecione um cliente —</option>' +
      clientes.slice().sort((a,b) => a.nome.localeCompare(b.nome))
        .map(c => '<option value="' + c.id + '">' + esc(c.nome) + '</option>').join('');
  }
  const prev = document.getElementById('relCliPreview');
  if (prev) prev.style.display = 'none';
}

/* Preview rápido ao selecionar cliente no modal */
function previewRelCliente(cliId) {
  const prev   = document.getElementById('relCliPreview');
  const totEl  = document.getElementById('relCliTotal');
  const concEl = document.getElementById('relCliConcluidas');
  const tmpEl  = document.getElementById('relCliTempo');
  const listEl = document.getElementById('relCliOsList');
  if (!prev || !cliId) { if (prev) prev.style.display = 'none'; return; }

  const c = clientes.find(x => x.id === cliId);
  if (!c) return;

  const hist = JSON.parse(localStorage.getItem('os_historico') || '[]');
  const dataIni = document.getElementById('relDataIni') ? document.getElementById('relDataIni').value : '';
  const dataFim = document.getElementById('relDataFim') ? document.getElementById('relDataFim').value : '';

  let osCliente = hist.filter(os => (os.cliNome || '').toLowerCase() === c.nome.toLowerCase());
  if (dataIni) osCliente = osCliente.filter(os => os.data >= dataIni);
  if (dataFim) osCliente = osCliente.filter(os => os.data <= dataFim + 'T23:59:59');
  osCliente.sort((a,b) => new Date(b.data) - new Date(a.data));

  const concluidas = osCliente.filter(os => os.status === 'Concluído' || os.status === 'Concluido').length;
  // Somar tempos totais (formato hh:mm:ss)
  let totalSeg = 0;
  osCliente.forEach(os => {
    if (os.tempo) {
      const p = os.tempo.split(':');
      if (p.length === 3) totalSeg += (+p[0])*3600 + (+p[1])*60 + (+p[2]);
    }
  });
  const fmtT = totalSeg > 0 ? fmtTempo(totalSeg) : '—';

  totEl.textContent  = osCliente.length;
  concEl.textContent = concluidas;
  tmpEl.textContent  = fmtT;

  const statusBadge = { 'Concluído':'badge-green','Concluido':'badge-green','Pendente':'badge-orange','Agendado':'badge-blue','Aguardando Peça':'badge-blue' };
  listEl.innerHTML = osCliente.length === 0
    ? '<div class="agenda-empty" style="padding:12px">Nenhuma OS neste período.</div>'
    : osCliente.map(os => {
        const dt = new Date(os.data).toLocaleDateString('pt-BR');
        return '<div class="rel-os-mini-item">' +
          '<span class="rel-os-num">' + fmtNum(os.numero) + '</span>' +
          '<span class="rel-os-dt">' + dt + '</span>' +
          '<span class="rel-os-equip">' + esc((os.eqMarca||'') + ' ' + (os.eqModelo||'')) + '</span>' +
          '<span class="badge ' + (statusBadge[os.status] || 'badge-gray') + ' rel-os-st">' + esc(os.status||'—') + '</span>' +
        '</div>';
      }).join('');

  prev.style.display = 'block';
}

/* Gera PDF completo com todas as OS do cliente selecionado */
function gerarPDFCliente() {
  const cliId = (document.getElementById('relCliSelect') || {}).value;
  if (!cliId) { toast('Selecione um cliente.', 'error'); return; }
  const c = clientes.find(x => x.id === cliId);
  if (!c) return;

  const hist = JSON.parse(localStorage.getItem('os_historico') || '[]');
  const dataIni = document.getElementById('relDataIni') ? document.getElementById('relDataIni').value : '';
  const dataFim = document.getElementById('relDataFim') ? document.getElementById('relDataFim').value : '';
  let osCliente = hist.filter(os => (os.cliNome || '').toLowerCase() === c.nome.toLowerCase());
  if (dataIni) osCliente = osCliente.filter(os => os.data >= dataIni);
  if (dataFim) osCliente = osCliente.filter(os => os.data <= dataFim + 'T23:59:59');
  osCliente.sort((a,b) => new Date(a.data) - new Date(b.data));

  if (osCliente.length === 0) { toast('Nenhuma OS encontrada para este cliente.', 'error'); return; }

  toast('Gerando relatório PDF...', '');
  setTimeout(() => {
    try {
      _doPDFRelatorioCliente(c, osCliente, dataIni, dataFim);
      fecharModal();
    } catch(e) { console.error(e); toast('Erro ao gerar PDF: ' + e.message, 'error'); }
  }, 200);
}

function _doPDFRelatorioCliente(c, osList, dataIni, dataFim) {
  const jsPDF = window.jspdf.jsPDF;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, M = 12, C = W - M * 2;
  const empresa = (cfg.empresa || 'MARLIFT SERVICE').toUpperCase();
  let y = 0;

  function check(n) { if (y + n > 280) { doc.addPage(); y = M; } }
  function hex2rgb(h) { return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]; }
  function secao(titulo, corBg, corTxt) {
    check(10);
    const rgb = hex2rgb(corBg);
    doc.setFillColor(rgb[0],rgb[1],rgb[2]); doc.rect(M,y,C,7,'F');
    const trgb = hex2rgb(corTxt);
    doc.setTextColor(trgb[0],trgb[1],trgb[2]); doc.setFontSize(8.5); doc.setFont('helvetica','bold');
    doc.text(titulo, M+3, y+5); y += 7;
  }

  // ===== CAPA =====
  doc.setFillColor(30,30,46); doc.rect(0,0,W,38,'F');
  doc.setFillColor(255,102,0); doc.rect(0,35,W,3,'F');
  doc.setTextColor(255,102,0); doc.setFontSize(18); doc.setFont('helvetica','bold');
  doc.text(empresa, M, 13);
  doc.setTextColor(200,200,200); doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text('RELATÓRIO DE ATENDIMENTOS — ' + c.nome.toUpperCase(), M, 20);
  const periodo = (dataIni || dataFim)
    ? 'Período: ' + (dataIni || '—') + ' a ' + (dataFim || '—')
    : 'Todos os atendimentos';
  doc.text(periodo, M, 25.5);
  doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text('Total: ' + osList.length + ' OS', M, 31);
  y = 44;

  // ===== RESUMO DO CLIENTE =====
  secao('DADOS DO CLIENTE', '#ff6600', '#ffffff');
  check(24);
  doc.setDrawColor(229,231,235); doc.setLineWidth(0.3); doc.rect(M,y,C,22,'S');
  doc.setTextColor(30,30,46); doc.setFontSize(10); doc.setFont('helvetica','bold');
  doc.text(c.nome, M+3, y+6);
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(107,114,128);
  if (c.cnpj)    doc.text('CNPJ: ' + c.cnpj, M+3, y+11);
  if (c.end)     doc.text('End: '  + c.end,  M+3, y+16);
  const contLn = (c.contato ? 'Contato: '+c.contato+'  ' : '') + (c.tel ? 'Tel: '+c.tel : '');
  if (contLn)    doc.text(contLn, M+3, y+21);
  y += 25;

  // ===== SUMÁRIO ESTATÍSTICO =====
  secao('RESUMO ESTATÍSTICO', '#1e1e2e', '#ffffff');
  check(22);
  const concl = osList.filter(o => o.status==='Concluído'||o.status==='Concluido').length;
  const emerg = osList.filter(o => o.tipoChamado==='Emergencial').length;
  const prev  = osList.filter(o => o.tipoChamado==='Preventivo').length;
  let totalSeg = 0;
  osList.forEach(os => { if (os.tempo) { const p=os.tempo.split(':'); if(p.length===3) totalSeg+=(+p[0])*3600+(+p[1])*60+(+p[2]); }});
  doc.setDrawColor(229,231,235); doc.rect(M,y,C,20,'S');
  doc.setTextColor(30,30,46); doc.setFont('helvetica','normal'); doc.setFontSize(9);
  doc.text('Total de OS: '      + osList.length + '   Concluídas: ' + concl + '   Pendentes: ' + (osList.length - concl), M+3, y+6);
  doc.text('Emergenciais: '     + emerg + '   Preventivas: ' + prev, M+3, y+12);
  doc.text('Tempo total de atendimento: ' + (totalSeg > 0 ? fmtTempo(totalSeg) : '—'), M+3, y+18);
  y += 23;

  // ===== LISTA DE OS =====
  secao('ORDENS DE SERVIÇO', '#ff6600', '#ffffff');
  osList.forEach((os, idx) => {
    check(36);
    const dt  = new Date(os.data);
    const hdr = fmtNum(os.numero) + ' — ' + dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    // Linha divisória entre OS
    if (idx > 0) { doc.setDrawColor(229,231,235); doc.setLineWidth(0.2); doc.line(M,y,M+C,y); y += 3; }

    // Cabeçalho da OS
    doc.setFillColor(248,249,250); doc.rect(M,y,C,7,'F');
    doc.setTextColor(30,30,46); doc.setFontSize(8.5); doc.setFont('helvetica','bold');
    doc.text(hdr, M+3, y+5);
    // Status
    const statusColors = {'Concluído':'#10b981','Concluido':'#10b981','Pendente':'#f59e0b','Aguardando Peça':'#3b82f6','Orçamento Enviado':'#6d28d9','Agendado':'#3b82f6'};
    const srgb = hex2rgb(statusColors[os.status] || '#6b7280');
    doc.setFillColor(srgb[0],srgb[1],srgb[2]); doc.roundedRect(M+C-32, y+1, 32, 5.5, 1,1,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(7); doc.setFont('helvetica','bold');
    doc.text((os.status||'—').toUpperCase(), M+C-16, y+5, {align:'center'});
    y += 9;

    doc.setTextColor(60,60,80); doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
    const eqTxt = (os.eqMarca||'') + ' ' + (os.eqModelo||'') + (os.eqSerie ? ' — S/N: '+os.eqSerie : '') + (os.horimetro ? ' — '+os.horimetro+'h' : '');
    doc.text('Equip: ' + eqTxt + '  |  Tec: ' + (os.tecNome||'—') + '  |  Tipo: ' + (os.tipoChamado||'—'), M+3, y+4);
    y += 7;
    if (os.defeito) {
      const dl = doc.splitTextToSize('Defeito: ' + os.defeito, C-6);
      dl.slice(0,2).forEach((l,i) => doc.text(l, M+3, y+i*4.5));
      y += dl.slice(0,2).length * 4.5 + 1;
    }
    if (os.servico) {
      const sl = doc.splitTextToSize('Serviço: ' + os.servico, C-6);
      sl.slice(0,3).forEach((l,i) => doc.text(l, M+3, y+i*4));
      y += sl.slice(0,3).length * 4 + 1;
    }
    if (os.tempo) { doc.text('Tempo: ' + os.tempo, M+3, y); y += 5; }
    y += 2;
  });

  // ===== RODAPÉ =====
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(30,30,46); doc.rect(0,287,W,10,'F');
    doc.setTextColor(200,200,200); doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text(empresa + ' — Relatório gerado em ' + new Date().toLocaleDateString('pt-BR'), M, 293);
    doc.text('Pág. ' + i + ' / ' + pageCount, W-M, 293, {align:'right'});
  }

  const nomeSanitizado = c.nome.replace(/[^a-zA-Z0-9\s]/g,'').replace(/\s+/g,'_').substring(0,30);
  doc.save('Relatorio_' + nomeSanitizado + '_' + new Date().toISOString().slice(0,10) + '.pdf');
}

/* ===== PDF BUILDER ===== */
function _buildPDFFromOS(os) {
  const btn = document.getElementById('btnPdf');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner spin"></i> Gerando PDF...'; }
  setTimeout(() => {
    try { _doPDF(os); }
    catch (err) { console.error('PDF Error:', err); toast('Erro ao gerar PDF: ' + err.message, 'error'); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Gerar e Baixar PDF'; } }
  }, 200);
}

function _doPDF(os) {
  const jsPDF = window.jspdf.jsPDF;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const now = new Date(os.data || new Date());
  const numOS = fmtNum(os.numero || 1);
  const empresa = (cfg.empresa || 'MARLIFT SERVICE').toUpperCase();
  const W = 210, M = 12, C = W - M * 2;
  let y = 0;

  function hex2rgb(h) { return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]; }
  function check(n) { if (y + n > 280) { doc.addPage(); y = M; } }
  function campo(label, valor, x2, y2, w2) {
    doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(107,114,128);
    doc.text(label, x2, y2);
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(30,30,46);
    doc.text(valor || '--', x2, y2 + 4.5);
  }

  // ===== CABEÇALHO =====
  doc.setFillColor(30, 30, 46); doc.rect(0, 0, W, 32, 'F');
  doc.setFillColor(255, 102, 0); doc.rect(0, 29, W, 3, 'F');
  doc.setTextColor(255, 102, 0); doc.setFontSize(18); doc.setFont('helvetica','bold');
  doc.text(empresa, M, 12);
  doc.setTextColor(200, 200, 200); doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text('ORDEM DE SERVIÇO', M, 18);
  if (cfg.cnpj) doc.text('CNPJ: ' + cfg.cnpj, M, 23);
  if (cfg.tel) doc.text('Tel: ' + cfg.tel, M, 27.5);
  doc.setFillColor(255, 102, 0); doc.roundedRect(W - M - 42, 5, 42, 16, 3, 3, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.setFont('helvetica','bold');
  doc.text(numOS, W - M - 21, 14.5, { align: 'center' });
  doc.setFontSize(7.5); doc.setFont('helvetica','normal');
  doc.text(now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), W - M - 21, 18.5, { align: 'center' });
  y = 36;

  // ===== STATUS BADGE =====
  const statusColors = {
    'Concluído': '#10b981', 'Concluido': '#10b981',
    'Pendente': '#f59e0b', 'Aguardando Peça': '#3b82f6', 'Orçamento Enviado': '#6d28d9'
  };
  const sColor = statusColors[os.status] || '#6b7280';
  const srgb = hex2rgb(sColor);
  doc.setFillColor(srgb[0], srgb[1], srgb[2]);
  const statusText = 'STATUS: ' + (os.status || 'N/A').toUpperCase();
  doc.roundedRect(M, y, 60, 8, 2, 2, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica','bold');
  doc.text(statusText, M + 3, y + 5.5);
  y += 12;

  // Secao helper
  function secao(titulo, corBg, corTxt) {
    check(10);
    const rgb = hex2rgb(corBg);
    doc.setFillColor(rgb[0], rgb[1], rgb[2]); doc.rect(M, y, C, 7, 'F');
    const trgb = hex2rgb(corTxt);
    doc.setTextColor(trgb[0], trgb[1], trgb[2]); doc.setFontSize(8.5); doc.setFont('helvetica','bold');
    doc.text(titulo, M + 3, y + 5);
    y += 7;
  }

  // ===== CLIENTE =====
  secao('CLIENTE', '#ff6600', '#ffffff');
  check(28);
  doc.setDrawColor(229,231,235); doc.setLineWidth(0.3); doc.rect(M, y, C, 26, 'S');
  doc.setTextColor(30,30,46); doc.setFontSize(11); doc.setFont('helvetica','bold');
  doc.text(os.cliNome || '--', M + 3, y + 6);
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(107,114,128);
  if (os.cliCnpj) doc.text('CNPJ: ' + os.cliCnpj, M + 3, y + 11);
  if (os.cliEnd) { const endLines = doc.splitTextToSize('End: ' + os.cliEnd, C - 6); doc.text(endLines[0], M + 3, y + 16); }
  const contLine = (os.cliContato ? 'Contato: ' + os.cliContato + '  ' : '') + (os.cliTel ? 'Tel: ' + os.cliTel : '');
  if (contLine) doc.text(contLine, M + 3, y + 21);
  if (os.cliEmail) doc.text('E-mail: ' + os.cliEmail, M + 3, y + 25);
  y += 29;

  // ===== TÉCNICO E EQUIPAMENTO =====
  secao('TÉCNICO E EQUIPAMENTO', '#1e1e2e', '#ffffff');
  check(24);
  doc.setDrawColor(229,231,235); doc.rect(M, y, C, 22, 'S');
  doc.setTextColor(30,30,46); doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text('Técnico: ' + (os.tecNome || '--'), M + 3, y + 6);
  doc.setFont('helvetica','normal');
  doc.text('Equipamento: ' + (os.eqMarca || '') + ' ' + (os.eqModelo || '') + '  |  Combustível: ' + (os.eqComb || '--'), M + 3, y + 12);
  doc.text('Nº de Série: ' + (os.eqSerie || '--') + '  |  Horímetro: ' + (os.horimetro || '--') + 'h', M + 3, y + 18);
  y += 25;

  // ===== HORÍMETRO FOTO =====
  if (os.horFoto) {
    secao('FOTO DO HORÍMETRO', '#1e1e2e', '#ffffff');
    const hW = 60, hH = 45;
    check(hH + 4);
    try { doc.addImage(os.horFoto, 'JPEG', M, y, hW, hH); } catch(ex) {}
    y += hH + 4;
  }

  // ===== CHAMADO =====
  secao('CHAMADO', '#fee2e2', '#b91c1c');
  check(20);
  doc.setDrawColor(229,231,235); doc.rect(M, y, C, 18, 'S');
  doc.setTextColor(30,30,46); doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text('Tipo: ' + (os.tipoChamado || '--') + '  |  Prioridade: ' + (os.prioridade || '--'), M + 3, y + 6);
  doc.setFont('helvetica','normal');
  const defLines = doc.splitTextToSize('Defeito: ' + (os.defeito || '--'), C - 6);
  defLines.slice(0, 2).forEach((l, i) => doc.text(l, M + 3, y + 12 + i * 4.5));
  y += 21;

  // ===== AGENDAMENTO =====
  if (os.agendaData) {
    secao('AGENDAMENTO', '#dbeafe', '#1d4ed8');
    check(14);
    doc.setDrawColor(229,231,235); doc.rect(M, y, C, 12, 'S');
    doc.setTextColor(30,30,46); doc.setFontSize(9); doc.setFont('helvetica','normal');
    doc.text('Data: ' + os.agendaData + (os.agendaHora ? '  Hora: ' + os.agendaHora : ''), M + 3, y + 6);
    if (os.agendaObs) doc.text('Obs: ' + os.agendaObs, M + 3, y + 11);
    y += 15;
  }

  // ===== SERVIÇO EXECUTADO =====
  secao('SERVIÇO EXECUTADO', '#ff6600', '#ffffff');
  const srvLines = doc.splitTextToSize(os.servico || '--', C - 6);
  const srvH = srvLines.length * 4.5 + 6;
  check(srvH);
  doc.setDrawColor(229,231,235); doc.rect(M, y, C, srvH, 'S');
  doc.setTextColor(30,30,46); doc.setFont('helvetica','normal'); doc.setFontSize(9);
  srvLines.forEach((l, i) => doc.text(l, M + 3, y + 5 + i * 4.5));
  y += srvH + 3;

  // ===== PEÇAS =====
  if (os.pecas) {
    secao('PEÇAS APLICADAS', '#1e1e2e', '#ffffff');
    const pecLines = doc.splitTextToSize(os.pecas, C - 6);
    const pecH = pecLines.length * 4.5 + 6;
    check(pecH);
    doc.setDrawColor(229,231,235); doc.rect(M, y, C, pecH, 'S');
    doc.setTextColor(30,30,46); doc.setFont('helvetica','normal'); doc.setFontSize(9);
    pecLines.forEach((l, i) => doc.text(l, M + 3, y + 5 + i * 4.5));
    y += pecH + 3;
  }

  // ===== OBSERVAÇÕES =====
  if (os.obs) {
    secao('OBSERVAÇÕES / RECOMENDAÇÕES', '#fef3c7', '#92400e');
    const obsLines = doc.splitTextToSize(os.obs, C - 6);
    const obsH = obsLines.length * 4.5 + 6;
    check(obsH);
    doc.setDrawColor(229,231,235); doc.rect(M, y, C, obsH, 'S');
    doc.setTextColor(30,30,46); doc.setFont('helvetica','normal'); doc.setFontSize(9);
    obsLines.forEach((l, i) => doc.text(l, M + 3, y + 5 + i * 4.5));
    y += obsH + 3;
  }

  // ===== REGISTRO DE TEMPO (CRONÔMETRO COMPLETO) =====
  secao('REGISTRO DE TEMPO — CRONÔMETRO', '#1e1e2e', '#ffffff');
  const logEntries = os.timerLog || [];
  const logH = Math.max(20, logEntries.length * 4.5 + 16);
  check(logH);
  doc.setFillColor(40, 40, 60); doc.rect(M, y, C, logH, 'F');
  doc.setTextColor(255, 102, 0); doc.setFontSize(16); doc.setFont('courier', 'bold');
  doc.text(os.tempo || '00:00:00', M + 4, y + 11);
  doc.setTextColor(180, 180, 180); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
  let ly = y + 17;
  logEntries.forEach(item => {
    if (ly + 5 > y + logH - 1) return;
    let txt = item.hora + ' — ' + item.evento;
    if (item.parcial) txt += ' (' + item.parcial + ')';
    if (item.total) txt += ' [TOTAL: ' + item.total + ']';
    doc.text(txt, M + 4, ly); ly += 4.5;
  });
  y += logH + 3;

  // ===== FOTOS (TODAS SEM LIMITE) =====
  const osFotos = os.fotos || [];
  if (osFotos.length > 0) {
    secao('FOTOS DE EVIDÊNCIA (' + osFotos.length + ')', '#ff6600', '#ffffff');
    y += 2;
    const fW = (C - 8) / 3, fH = fW * 0.75;
    // Processar todas as fotos em grupos de 3
    for (let i = 0; i < osFotos.length; i++) {
      const col = i % 3;
      if (col === 0 && i > 0) {
        y += fH + 4;
        check(fH + 4);
      }
      if (col === 0) check(fH + 4);
      const fx = M + col * (fW + 4);
      try { doc.addImage(osFotos[i], 'JPEG', fx, y, fW, fH); } catch(ex) {}
    }
    y += fH + 6;
  }

  // ===== ASSINATURA =====
  check(44);
  doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.4);
  doc.rect(M, y, C, 40, 'S');
  doc.setTextColor(107, 114, 128); doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
  doc.text('ASSINATURA DO CLIENTE / RESPONSÁVEL', M + 3, y + 6);
  if (os.assinatura && os.assinatura.img) {
    try { doc.addImage(os.assinatura.img, 'PNG', M + 3, y + 9, 75, 30); } catch(ex) {}
  } else {
    doc.setDrawColor(200, 200, 200);
    doc.line(M + 5, y + 23, M + C / 2 - 5, y + 23);
    doc.setTextColor(180, 180, 180); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('Assinatura do responsável', M + 3, y + 30);
  }
  doc.setTextColor(30, 30, 46); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  const respNome = (os.assinatura && os.assinatura.nome) ? os.assinatura.nome : '--';
  doc.text(respNome, M + 3, y + 33);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(107, 114, 128);
  const respDoc = (os.assinatura && os.assinatura.doc) ? 'RG/CPF: ' + os.assinatura.doc : 'RG/CPF: --';
  doc.text(respDoc, M + 3, y + 38);
  y += 43;

  // ===== RODAPÉ EM TODAS AS PÁGINAS =====
  const totalPages = doc.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    doc.setFillColor(30, 30, 46); doc.rect(0, 286, W, 11, 'F');
    doc.setTextColor(140, 140, 140); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text(empresa + ' — Emitido em ' + now.toLocaleDateString('pt-BR') + ' — ' + numOS, W / 2, 292, { align: 'center' });
    doc.setTextColor(255, 102, 0);
    doc.text(pg + ' / ' + totalPages, W - M, 292);
  }

  const nomeArq = 'OS-' + numOS.replace('#', '') + '_' + (os.cliNome || 'cliente').replace(/\s+/g, '-').substring(0, 20) + '.pdf';
  doc.save(nomeArq);
  toast('PDF gerado com ' + totalPages + ' página(s)! Verifique seus Downloads.', 'success');
}

/* ===== GPS ===== */
function abrirGps() {
  const end = g('cEnd');
  if (!end) { toast('Preencha o endereço primeiro.', 'error'); return; }
  window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(end), '_blank');
}

/* ===== LIMPAR TUDO ===== */
function limparTudo() {
  if (!confirm('APAGAR TODOS os dados do sistema? Esta ação é IRREVERSÍVEL!')) return;
  ['os_cfg','os_clientes','os_historico','os_rascunho','os_fotos','os_sig','os_tempo_final','os_hor_foto','os_sync_queue']
    .forEach(k => localStorage.removeItem(k));
  location.reload();
}

/* ===== MODAIS ===== */
function abrirModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('open');
  if (id === 'modalSig') setTimeout(initSigCanvas, 150);
  // Inicializar lista de equipamentos ao abrir modal de novo cliente
  if (id === 'modalCli') {
    const cadList = document.getElementById('cadEquipList');
    if (cadList && cadList.children.length === 0) renderEquipList('cadEquipList', []);
  }
  // Inicializar select de clientes no modal de relatório
  if (id === 'modalRelCliente') abrirModal_RelCliente();
}
function fecharModal() {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
}

/* ===== TOAST ===== */
function toast(msg, type) {
  type = type || '';
  const c = document.getElementById('toastWrap');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
  t.innerHTML = '<span>' + icon + '</span> ' + msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0'; t.style.transition = 'opacity 0.3s';
    setTimeout(() => t.remove(), 320);
  }, 3500);
}

/* ===== MÁSCARAS ===== */
function mascaraCnpj(el) {
  let v = el.value.replace(/\D/g, '').substring(0, 14);
  v = v.replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
  el.value = v;
}
function mascaraTel(el) {
  let v = el.value.replace(/\D/g, '').substring(0, 11);
  v = v.length <= 10
    ? v.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1) $2-$3')
    : v.replace(/^(\d{2})(\d{5})(\d{0,4})$/, '($1) $2-$3');
  el.value = v; autoSave();
}

/* ===== HELPERS ===== */
function g(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function f(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tagName === 'DIV' || el.tagName === 'SPAN') el.textContent = val;
  else el.value = val;
}
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
