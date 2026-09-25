/* =========================================================
   SDR CONTROL — Vegas Vigilância e Segurança
   1. Constantes   2. Utilitários   3. Dados (adapter + DB)
   4. Auth         5. Regras de negócio   6. Demo
   7. UI base      8. Views          9. Formulários/modais
   10. WhatsApp    11. PDF/CSV       12. Notificações  13. Boot
   ========================================================= */
'use strict';

/* ---------- 1. CONSTANTES ---------- */
const PREFIX = 'sdrc_';
const COLLECTIONS = ['usuarios', 'clientes', 'visitas', 'orcamentos', 'notificacoes'];

const ST_CLI = {
  novo:             { l: 'Novo',              c: '#3cd4ff' },
  contato:          { l: 'Contato realizado', c: '#7d8cff' },
  visita_agendar:   { l: 'Visita a agendar',  c: '#ffb547' },
  visita_agendada:  { l: 'Visita agendada',   c: '#ffd166' },
  visita_realizada: { l: 'Visita realizada',  c: '#4ee6c1' },
  orc_enviado:      { l: 'Orçamento enviado', c: '#b18cff' },
  negociacao:       { l: 'Negociação',        c: '#ff9f5a' },
  fechado:          { l: 'Fechado',           c: '#2fe0a1' },
  perdido:          { l: 'Perdido',           c: '#ff5d73' },
  cancelado:        { l: 'Cancelado',         c: '#8a9bb8' }
};
const ORDER_CLI = Object.keys(ST_CLI);
const FINAL_CLI = ['fechado', 'perdido', 'cancelado'];

const ST_VIS = {
  agendada:   { l: 'Agendada',   c: '#3cd4ff' },
  reagendada: { l: 'Reagendada', c: '#ffb547' },
  realizada:  { l: 'Realizada',  c: '#2fe0a1' },
  cancelada:  { l: 'Cancelada',  c: '#ff5d73' }
};
const ST_ORC = {
  rascunho: { l: 'Aguardando envio', c: '#ffb547' },
  enviado:  { l: 'Enviado',          c: '#3cd4ff' },
  aprovado: { l: 'Aprovado',         c: '#2fe0a1' },
  recusado: { l: 'Recusado',         c: '#ff5d73' }
};

const ORIGENS = ['WhatsApp', 'Ligação', 'Instagram', 'Indicação', 'Site', 'Outro'];
const TIPOS_CLIENTE = ['Residencial', 'Comercial', 'Condomínio', 'Industrial', 'Rural', 'Órgão público'];
const SERVICOS = ['Alarme monitorado', 'CFTV', 'Rastreamento veicular', 'Cerca elétrica', 'Controle de acesso', 'Portaria remota', 'Vigilância', 'Outro'];
const TIPOS_VISITA = ['Levantamento para orçamento', 'Vistoria técnica', 'Apresentação comercial', 'Retorno', 'Instalação'];

const DEFAULT_CONFIG = {
  empresa: {
    nome: 'VEGAS VIGILÂNCIA E SEGURANÇA', cnpj: '', endereco: '',
    cidade: 'Volta Redonda - RJ', telefone: '', email: '', site: ''
  },
  sdrs: [
    { nome: 'Maria Izabel', cor: '#3cd4ff' },
    { nome: 'Daiana',       cor: '#ff7ad9' },
    { nome: 'Regiane',      cor: '#ffb547' }
  ],
  tecnicos: ['Responsável comercial'],
  proxNumero: 1,
  validadeDias: 15,
  pagamentoPadrao: '50% na aprovação e 50% na conclusão da instalação.',
  templates: {
    confirmar: 'Olá {nome}! Aqui é a {sdr}, da Vegas Vigilância e Segurança. Confirmando a visita técnica para {data} às {hora}, no endereço {endereco}. Podemos confirmar?',
    orcamento: 'Olá {nome}! Segue o orçamento nº {numero} da Vegas Vigilância e Segurança, no valor de {total}. Qualquer dúvida estou à disposição.',
    reagendar: 'Olá {nome}! Precisamos reagendar a visita marcada para {data} às {hora}. Qual o melhor dia e horário para você?',
    obrigado:  'Olá {nome}! Obrigado pelo contato com a Vegas Vigilância e Segurança. Em breve retornamos com os próximos passos.'
  },
  demoSeeded: false
};
const TPL_LABEL = { confirmar: 'Confirmar visita', orcamento: 'Enviar orçamento', reagendar: 'Reagendar visita', obrigado: 'Obrigado pelo contato' };

/* ---------- 2. UTILITÁRIOS ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const toISODate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => toISODate(new Date());
const nowLocal = () => { const d = new Date(); return `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const parseDate = s => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return addDays(x, -((x.getDay() + 6) % 7)); };
const fmtDate = s => s ? s.slice(0, 10).split('-').reverse().join('/') : '—';
const fmtDateTime = s => s ? `${fmtDate(s)} ${s.slice(11, 16)}` : '—';
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = v => BRL.format(+v || 0);
const digits = s => String(s || '').replace(/\D/g, '');
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const numOrc = n => String(n).padStart(4, '0');
const initials = n => String(n || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const hash = s => { let h = 5381; for (const ch of 'sdrc:' + s) h = ((h << 5) + h + ch.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
const byName = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
const dtVisita = v => new Date(`${v.data}T${v.hora || '00:00'}`);

function maskTel(v) {
  const d = digits(v).slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
const maskCep = v => { const d = digits(v).slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ---------- 3. DADOS ----------
   Toda leitura/escrita passa por Adapter. Para migrar para Supabase/Firebase,
   reescreva apenas Adapter.load/save (a UI lê do cache em memória do DB). */
const Store = {
  get(k, def) { try { const v = localStorage.getItem(PREFIX + k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v) { localStorage.setItem(PREFIX + k, JSON.stringify(v)); },
  del(k) { localStorage.removeItem(PREFIX + k); }
};

const Adapter = {
  async load(col) { return Store.get(col, []); },
  async save(col, rows) {
    try { Store.set(col, rows); }
    catch { toast('Armazenamento do navegador cheio. Exporte um backup e limpe dados antigos.', 'err'); }
  }
};

const DB = {
  cache: {},
  async init() { for (const c of COLLECTIONS) this.cache[c] = await Adapter.load(c); },
  all(col) { return this.cache[col] || []; },
  get(col, id) { return this.all(col).find(x => x.id === id); },
  insert(col, obj) {
    const row = { id: uid(), criadoEm: nowLocal(), ...obj };
    this.cache[col].push(row); Adapter.save(col, this.cache[col]); return row;
  },
  update(col, id, patch) {
    const row = this.get(col, id); if (!row) return null;
    Object.assign(row, patch, { atualizadoEm: nowLocal() });
    Adapter.save(col, this.cache[col]); return row;
  },
  remove(col, id) { this.cache[col] = this.all(col).filter(x => x.id !== id); Adapter.save(col, this.cache[col]); },
  replace(col, rows) { this.cache[col] = rows; Adapter.save(col, rows); }
};

let CONFIG = structuredClone(DEFAULT_CONFIG);
const loadConfig = () => {
  const c = Store.get('config', {});
  CONFIG = { ...structuredClone(DEFAULT_CONFIG), ...c, empresa: { ...DEFAULT_CONFIG.empresa, ...(c.empresa || {}) }, templates: { ...DEFAULT_CONFIG.templates, ...(c.templates || {}) } };
};
const saveConfig = () => Store.set('config', CONFIG);

/* ---------- 4. AUTENTICAÇÃO (visual/local — não é segurança de servidor) ---------- */
let ME = null;
const SESSION_HOURS = 12;

function ensureUsers() {
  if (DB.all('usuarios').length) return;
  DB.insert('usuarios', { nome: 'Administrador', usuario: 'admin', senha: hash('vegas2026'), perfil: 'admin', sdr: '' });
  DB.insert('usuarios', { nome: 'Maria Izabel', usuario: 'maria', senha: hash('maria123'), perfil: 'sdr', sdr: 'Maria Izabel' });
  DB.insert('usuarios', { nome: 'Daiana', usuario: 'daiana', senha: hash('daiana123'), perfil: 'sdr', sdr: 'Daiana' });
  DB.insert('usuarios', { nome: 'Regiane', usuario: 'regiane', senha: hash('regiane123'), perfil: 'sdr', sdr: 'Regiane' });
}
function login(usuario, senha) {
  const u = DB.all('usuarios').find(x => x.usuario.toLowerCase() === usuario.trim().toLowerCase() && x.senha === hash(senha));
  if (!u) return false;
  Store.set('session', { uid: u.id, exp: Date.now() + SESSION_HOURS * 3600e3 });
  ME = u; return true;
}
function currentUser() {
  const s = Store.get('session', null);
  if (!s || s.exp < Date.now()) { Store.del('session'); return null; }
  return DB.get('usuarios', s.uid) || null;
}
function logout() { Store.del('session'); ME = null; location.hash = ''; location.reload(); }
const isAdmin = () => ME?.perfil === 'admin';

/* ---------- 5. REGRAS DE NEGÓCIO ---------- */
const sdrs = () => isAdmin() ? CONFIG.sdrs : CONFIG.sdrs.filter(s => s.nome === ME.sdr);
const sdrColor = n => CONFIG.sdrs.find(s => s.nome === n)?.cor || '#8a9bb8';
const sdrTag = n => `<span class="sdr-tag" style="--sdrc:${sdrColor(n)}">${esc(n || '—')}</span>`;
const badge = (map, k) => `<span class="badge" style="--sc:${map[k]?.c || '#8a9bb8'}">${esc(map[k]?.l || k)}</span>`;
const cliente = id => DB.get('clientes', id);
const sdrDoCliente = id => cliente(id)?.sdr || '';

const myClientes = () => isAdmin() ? DB.all('clientes') : DB.all('clientes').filter(c => c.sdr === ME.sdr);
const myIds = () => new Set(myClientes().map(c => c.id));
const myVisitas = () => { const ids = myIds(); return DB.all('visitas').filter(v => ids.has(v.clienteId)); };
const myOrcs = () => { const ids = myIds(); return DB.all('orcamentos').filter(o => ids.has(o.clienteId)); };

function calcOrc(o) {
  const subtotal = (o.itens || []).reduce((s, i) => s + (+i.qtd || 0) * (+i.valor || 0), 0);
  const desconto = o.descontoTipo === 'pct' ? subtotal * (+o.desconto || 0) / 100 : (+o.desconto || 0);
  return { subtotal, desconto: Math.min(desconto, subtotal), total: Math.max(subtotal - desconto, 0) };
}
const ultimoOrc = cid => DB.all('orcamentos').filter(o => o.clienteId === cid).sort((a, b) => (b.data + b.criadoEm).localeCompare(a.data + a.criadoEm))[0];
function proximaVisita(cid) {
  const vs = DB.all('visitas').filter(v => v.clienteId === cid && v.status !== 'cancelada').sort((a, b) => dtVisita(a) - dtVisita(b));
  return vs.find(v => dtVisita(v) >= new Date() && v.status !== 'realizada') || vs[vs.length - 1];
}

const HIST_TIPO = { contato: 'contato', visita_agendada: 'visita_agendada', visita_realizada: 'visita_realizada', orc_enviado: 'orcamento_enviado', negociacao: 'negociacao', fechado: 'resultado', perdido: 'resultado', cancelado: 'resultado' };

function logHist(cid, tipo, texto, data = nowLocal()) {
  const c = cliente(cid); if (!c) return;
  c.historico = [...(c.historico || []), { data, tipo, texto, por: ME?.nome || 'Sistema' }];
  DB.update('clientes', cid, { historico: c.historico });
}
function setStatusCliente(cid, status, silent) {
  const c = cliente(cid); if (!c || c.status === status) return;
  DB.update('clientes', cid, { status });
  logHist(cid, HIST_TIPO[status] || 'status', `Status alterado para "${ST_CLI[status].l}"`);
  if (!silent) toast(`Status atualizado: ${ST_CLI[status].l}.`);
}
function avancarStatus(cid, status) {
  const c = cliente(cid); if (!c || FINAL_CLI.includes(c.status)) return;
  if (ORDER_CLI.indexOf(c.status) < ORDER_CLI.indexOf(status)) setStatusCliente(cid, status, true);
}

/* Funções principais (nomes pedidos na especificação) */
function salvarCliente(data) {
  const c = DB.insert('clientes', { status: 'novo', historico: [], ...data });
  logHist(c.id, 'entrada', `Cliente entrou via ${c.origem || '—'} (SDR ${c.sdr})`, c.entrada || nowLocal());
  if (c.status !== 'novo') logHist(c.id, HIST_TIPO[c.status] || 'status', `Status inicial "${ST_CLI[c.status].l}"`);
  pushEvento(`${c.sdr} cadastrou um novo cliente: ${c.nome}.`);
  return c;
}
function editarCliente(id, data) {
  const old = cliente(id);
  const statusMudou = data.status && old.status !== data.status;
  DB.update('clientes', id, data);
  if (statusMudou) logHist(id, HIST_TIPO[data.status] || 'status', `Status alterado para "${ST_CLI[data.status].l}"`);
  return cliente(id);
}
function excluirCliente(id) {
  DB.all('visitas').filter(v => v.clienteId === id).forEach(v => DB.remove('visitas', v.id));
  DB.all('orcamentos').filter(o => o.clienteId === id).forEach(o => DB.remove('orcamentos', o.id));
  DB.remove('clientes', id);
}
function salvarVisita(data) {
  const v = DB.insert('visitas', { status: 'agendada', ...data });
  logHist(v.clienteId, 'visita_agendada', `Visita agendada para ${fmtDate(v.data)} às ${v.hora} (${v.tipo || 'visita'})`);
  avancarStatus(v.clienteId, 'visita_agendada');
  return v;
}
function editarVisita(id, data) {
  const old = { ...DB.get('visitas', id) };
  const mudouHorario = old.data !== data.data || old.hora !== data.hora;
  if (mudouHorario && ['agendada', 'reagendada'].includes(old.status) && (!data.status || data.status === old.status)) data.status = 'reagendada';
  const v = DB.update('visitas', id, data);
  if (mudouHorario) logHist(v.clienteId, 'visita_agendada', `Visita reagendada de ${fmtDate(old.data)} ${old.hora} para ${fmtDate(v.data)} ${v.hora}`);
  if (old.status !== v.status) marcarVisitaStatus(v, v.status, true);
  return v;
}
function marcarVisitaStatus(v, status, skipUpdate) {
  if (!skipUpdate) DB.update('visitas', v.id, { status });
  if (status === 'realizada') { logHist(v.clienteId, 'visita_realizada', `Visita realizada em ${fmtDate(v.data)} às ${v.hora}`); avancarStatus(v.clienteId, 'visita_realizada'); }
  if (status === 'cancelada') logHist(v.clienteId, 'visita_cancelada', `Visita de ${fmtDate(v.data)} cancelada`);
}
function salvarOrcamento(data) {
  const o = DB.insert('orcamentos', { status: 'rascunho', ...data, ...calcOrc(data) });
  CONFIG.proxNumero = Math.max(CONFIG.proxNumero, o.numero + 1); saveConfig();
  logHist(o.clienteId, 'orcamento_criado', `Orçamento nº ${numOrc(o.numero)} criado: ${money(o.total)}`);
  if (o.status !== 'rascunho') aplicarStatusOrc(o);
  return o;
}
function editarOrcamento(id, data) {
  const old = DB.get('orcamentos', id).status;
  const o = DB.update('orcamentos', id, { ...data, ...calcOrc(data) });
  if (old !== o.status) aplicarStatusOrc(o);
  return o;
}
function aplicarStatusOrc(o) {
  if (o.status === 'enviado') { logHist(o.clienteId, 'orcamento_enviado', `Orçamento nº ${numOrc(o.numero)} enviado`); avancarStatus(o.clienteId, 'orc_enviado'); }
  if (o.status === 'aprovado') { logHist(o.clienteId, 'resultado', `Orçamento nº ${numOrc(o.numero)} aprovado`); setStatusCliente(o.clienteId, 'fechado', true); }
  if (o.status === 'recusado') logHist(o.clienteId, 'orcamento_recusado', `Orçamento nº ${numOrc(o.numero)} recusado`);
}

/* Métricas usadas em dashboard, SDRs, indicadores e relatórios */
function stats(sdr, de, ate) {
  const inP = d => (!de || d >= de) && (!ate || d <= ate);
  const cs = DB.all('clientes').filter(c => (!sdr || c.sdr === sdr) && inP((c.entrada || '').slice(0, 10)));
  const vs = DB.all('visitas').filter(v => (!sdr || sdrDoCliente(v.clienteId) === sdr) && inP(v.data));
  const os = DB.all('orcamentos').filter(o => (!sdr || sdrDoCliente(o.clienteId) === sdr) && inP(o.data));
  const sum = a => a.reduce((s, o) => s + (+o.total || 0), 0);
  return {
    cs, vs, os,
    clientes: cs.length,
    visitas: vs.filter(v => v.status !== 'cancelada').length,
    realizadas: vs.filter(v => v.status === 'realizada').length,
    canceladas: vs.filter(v => v.status === 'cancelada').length,
    pendentes: vs.filter(v => ['agendada', 'reagendada'].includes(v.status)).length,
    orcamentos: os.length,
    valorOrcado: sum(os),
    valorFechado: sum(os.filter(o => o.status === 'aprovado')),
    fechados: cs.filter(c => c.status === 'fechado').length,
    perdidos: cs.filter(c => c.status === 'perdido').length
  };
}
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

/* ---------- 6. DADOS DEMO (marcados com demo:true — remova em Configurações) ---------- */
function seedDemo() {
  const t = new Date();
  const D = n => toISODate(addDays(t, n));
  const DT = (n, h = '09:30') => `${D(n)}T${h}`;
  const demo = [
    // nome, empresa, sdr, cidade, bairro, endereço, tipo, serviço, origem, dias de entrada, status, visita [dias, hora, status], orçamento [desc, qtd, valor, status]
    ['João da Silva', '', 'Maria Izabel', 'Volta Redonda', 'Aterrado', 'Rua 33, 145', 'Residencial', 'Alarme monitorado', 'WhatsApp', -20, 'fechado', [-15, '09:00', 'realizada'], ['Kit alarme monitorado 8 zonas com instalação', 1, 3200, 'aprovado']],
    ['Carla Mendes', 'Empresa XPTO Ltda', 'Maria Izabel', 'Barra Mansa', 'Centro', 'Av. Joaquim Leite, 820', 'Comercial', 'CFTV', 'Instagram', -14, 'orc_enviado', [-8, '14:00', 'realizada'], ['Câmera IP 4MP instalada', 12, 850, 'enviado']],
    ['Rogério Alves', 'Mercado Bom Preço', 'Maria Izabel', 'Volta Redonda', 'Vila Santa Cecília', 'Rua 14, 230', 'Comercial', 'CFTV', 'Indicação', -5, 'visita_agendada', [0, '15:30', 'agendada'], null],
    ['Patrícia Nogueira', '', 'Maria Izabel', 'Pinheiral', 'Centro', 'Rua Nilo Peçanha, 55', 'Residencial', 'Cerca elétrica', 'WhatsApp', -2, 'contato', null, null],
    ['Condomínio Solar das Águas', 'Condomínio Solar das Águas', 'Maria Izabel', 'Volta Redonda', 'Jardim Amália', 'Rua Campos Elíseos, 900', 'Condomínio', 'Portaria remota', 'Site', -1, 'novo', null, null],
    ['Anderson Costa', 'Transportadora AC', 'Daiana', 'Resende', 'Campos Elíseos', 'Av. Brasil, 1500', 'Comercial', 'Rastreamento veicular', 'Ligação', -18, 'negociacao', [-12, '10:00', 'realizada'], ['Rastreador veicular com monitoramento (mensal x 12)', 8, 1290, 'enviado']],
    ['Fernanda Lima', '', 'Daiana', 'Volta Redonda', 'Retiro', 'Rua Getúlio Vargas, 77', 'Residencial', 'Alarme monitorado', 'WhatsApp', -10, 'perdido', [-7, '16:00', 'realizada'], ['Kit alarme monitorado 6 zonas', 1, 2450, 'recusado']],
    ['Clínica Vida Plena', 'Clínica Vida Plena', 'Daiana', 'Barra Mansa', 'Ano Bom', 'Rua Pinto Ribeiro, 310', 'Comercial', 'Controle de acesso', 'Indicação', -6, 'visita_agendada', [1, '10:30', 'agendada'], null],
    ['Marcos Pereira', '', 'Daiana', 'Barra do Piraí', 'Centro', 'Rua Tiradentes, 12', 'Residencial', 'CFTV', 'Instagram', -3, 'visita_agendar', null, null],
    ['Sítio Boa Esperança', '', 'Daiana', 'Piraí', 'Zona rural', 'Estrada RJ-145, km 8', 'Rural', 'Cerca elétrica', 'WhatsApp', -9, 'cancelado', [-4, '08:30', 'cancelada'], null],
    ['Luciana Rocha', 'Padaria Pão Nosso', 'Regiane', 'Volta Redonda', 'Conforto', 'Av. Paulo de Frontin, 450', 'Comercial', 'CFTV', 'WhatsApp', -16, 'fechado', [-11, '11:00', 'realizada'], ['Sistema CFTV 8 câmeras + DVR + instalação', 1, 8500, 'aprovado']],
    ['Indústria Metalfer', 'Metalfer Indústria Ltda', 'Regiane', 'Volta Redonda', 'Roma', 'Rua 1º de Maio, 2000', 'Industrial', 'Vigilância', 'Site', -8, 'visita_realizada', [-2, '09:00', 'realizada'], ['Posto de vigilância 12x36 (mensal)', 1, 14800, 'rascunho']],
    ['Ricardo Souza', '', 'Regiane', 'Barra Mansa', 'Vila Nova', 'Rua Rio Branco, 98', 'Residencial', 'Alarme monitorado', 'Ligação', -4, 'visita_agendada', [2, '14:00', 'agendada'], null],
    ['Escola Pequeno Saber', 'Escola Pequeno Saber', 'Regiane', 'Volta Redonda', 'Sessenta', 'Rua Gustavo Lira, 60', 'Comercial', 'CFTV', 'Indicação', -7, 'orc_enviado', [-3, '15:00', 'realizada'], ['Câmeras Full HD com gravação em nuvem', 10, 1230, 'enviado']],
    ['Tatiane Gomes', '', 'Regiane', 'Resende', 'Manejo', 'Rua do Rosário, 41', 'Residencial', 'Cerca elétrica', 'WhatsApp', 0, 'novo', null, null]
  ];
  const nomeTel = i => `(24) 99${String(810 + i * 37).slice(-3)}-${String(1000 + i * 263).slice(-4)}`;
  demo.forEach((d, i) => {
    const [nome, empresa, sdr, cidade, bairro, endereco, tipo, servico, origem, dEnt, status, vis, orc] = d;
    const tel = nomeTel(i);
    const hist = [{ data: DT(dEnt, '08:45'), tipo: 'entrada', texto: `Cliente entrou via ${origem} (SDR ${sdr})`, por: sdr }];
    if (status !== 'novo') hist.push({ data: DT(dEnt, '11:20'), tipo: 'contato', texto: 'Primeiro contato realizado', por: sdr });
    const c = DB.insert('clientes', {
      demo: true, nome, empresa, telefone: tel, whatsapp: tel, email: nome.split(' ')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') + '@exemplo.com',
      endereco, bairro, cidade, cep: '27200-000', tipo, servico, obs: 'Registro de demonstração.', sdr, origem, status, entrada: DT(dEnt, '08:45'), historico: hist
    });
    if (vis) {
      const [dv, hora, vst] = vis;
      DB.insert('visitas', { demo: true, clienteId: c.id, data: D(dv), hora, endereco: `${endereco} - ${bairro}, ${cidade}`, tecnico: 'Responsável comercial', tipo: 'Levantamento para orçamento', obs: '', status: vst });
      hist.push({ data: DT(dEnt + 1, '10:00'), tipo: 'visita_agendada', texto: `Visita agendada para ${fmtDate(D(dv))} às ${hora}`, por: sdr });
      if (vst === 'realizada') hist.push({ data: DT(dv, hora), tipo: 'visita_realizada', texto: `Visita realizada em ${fmtDate(D(dv))}`, por: 'Administrador' });
      if (vst === 'cancelada') hist.push({ data: DT(dv, hora), tipo: 'visita_cancelada', texto: 'Visita cancelada pelo cliente', por: sdr });
    }
    if (orc) {
      const [desc, qtd, valor, ost] = orc;
      const dv = vis[0] + 1;
      const o = { demo: true, numero: CONFIG.proxNumero++, clienteId: c.id, data: D(dv), validade: D(dv + CONFIG.validadeDias), itens: [{ desc, qtd, valor }], descontoTipo: 'pct', desconto: 5, pagamento: CONFIG.pagamentoPadrao, prazo: '7 dias úteis após aprovação', obs: '', status: ost };
      DB.insert('orcamentos', { ...o, ...calcOrc(o) });
      hist.push({ data: DT(dv, '17:00'), tipo: 'orcamento_criado', texto: `Orçamento nº ${numOrc(o.numero)} criado`, por: 'Administrador' });
      if (ost !== 'rascunho') hist.push({ data: DT(dv, '17:30'), tipo: 'orcamento_enviado', texto: `Orçamento nº ${numOrc(o.numero)} enviado`, por: sdr });
      if (status === 'negociacao') hist.push({ data: DT(dv + 2, '10:00'), tipo: 'negociacao', texto: 'Cliente pediu revisão de condições', por: sdr });
      if (FINAL_CLI.includes(status)) hist.push({ data: DT(dv + 3, '15:00'), tipo: 'resultado', texto: `Resultado: ${ST_CLI[status].l}`, por: 'Administrador' });
    }
    DB.update('clientes', c.id, { historico: hist });
  });
  CONFIG.demoSeeded = true; saveConfig();
}
function removerDemo() {
  ['clientes', 'visitas', 'orcamentos'].forEach(col => DB.replace(col, DB.all(col).filter(x => !x.demo)));
  const nums = DB.all('orcamentos').map(o => o.numero);
  CONFIG.proxNumero = nums.length ? Math.max(...nums) + 1 : 1; saveConfig();
}

/* ---------- 7. UI BASE ---------- */
const ui = {
  view: 'dashboard',
  filters: {},
  cal: { mode: 'month', date: new Date(), sdr: '' },
  sdrSel: '',
  detailId: null,
  wa: null,
  avisados: new Set()
};
const F = v => (ui.filters[v] ||= {});

function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3200);
  setTimeout(() => el.remove(), 3600);
}

function openModal(title, html, size) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  $('.modal-box').classList.toggle('sm', size === 'sm');
  $('#modal').hidden = false;
  $('#modalBody').scrollTop = 0;
  setTimeout(() => $('#modalBody [autofocus]')?.focus(), 50);
}
function closeModal() { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; ui.detailId = null; }
const backOrClose = back => back ? Actions.verCliente(back) : closeModal();

function confirmar(msg, ok = 'Excluir') {
  return new Promise(res => {
    const wrap = document.createElement('div');
    wrap.className = 'modal'; wrap.style.zIndex = 150;
    wrap.innerHTML = `<div class="modal-box glass sm"><div class="modal-body"><p style="font-size:16px;margin:4px 0 20px">${esc(msg)}</p>
      <div class="form-actions"><button class="btn" data-r="0">Voltar</button><button class="btn btn-danger" data-r="1">${esc(ok)}</button></div></div></div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (b || e.target === wrap) { wrap.remove(); res(b?.dataset.r === '1'); }
    });
  });
}

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('#themeBtn').textContent = t === 'dark' ? '☀️' : '🌙';
  $('meta[name=theme-color]').content = t === 'dark' ? '#080e1a' : '#edf2f8';
}
function tickClock() {
  const d = new Date();
  $('#clockDate').textContent = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  $('#clockTime').textContent = d.toLocaleTimeString('pt-BR');
}

const VIEWS = {};
function go(view) { location.hash = '#/' + view; }
function render() {
  const view = (location.hash.replace('#/', '') || 'dashboard').split('/')[0];
  ui.view = VIEWS[view] ? view : 'dashboard';
  $$('[data-view]').forEach(a => a.classList.toggle('active', a.dataset.view === ui.view));
  const main = $('#view');
  main.innerHTML = VIEWS[ui.view]();
  main.classList.remove('view-enter'); void main.offsetWidth; main.classList.add('view-enter');
  updateNotifBadge();
}
function refresh() {
  const y = window.scrollY;
  $('#view').innerHTML = VIEWS[ui.view]();
  window.scrollTo(0, y);
  updateNotifBadge();
}
function refreshList() {
  const area = $('#listArea'); if (!area) return refresh();
  area.innerHTML = LISTS[ui.view]?.() ?? '';
}

const opt = (list, sel, blank) => (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '') +
  list.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(l)}</option>`; }).join('');
const sdrOpts = () => sdrs().map(s => s.nome);
const mapOpts = map => Object.entries(map).map(([k, v]) => [k, v.l]);

function filterBar(view, fields) {
  const f = F(view);
  return `<div class="filters">${fields.map(x => {
    if (x.type === 'select') return `<label class="field"><span>${x.label}</span><select data-filter="${x.key}">${opt(x.options, f[x.key], 'Todos')}</select></label>`;
    return `<label class="field"><span>${x.label}</span><input type="${x.type || 'text'}" data-filter="${x.key}" value="${esc(f[x.key] || '')}" placeholder="${x.ph || ''}"></label>`;
  }).join('')}<button class="btn btn-sm" data-action="clearFilters">Limpar filtros</button></div>`;
}
const head = (title, sub, actions = '') => `<div class="view-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div style="display:flex;gap:8px;flex-wrap:wrap">${actions}</div></div>`;
const empty = (t, s, action = '') => `<div class="empty-state"><b>${t}</b>${s}${action ? `<br>${action}` : ''}</div>`;

/* ---------- Gráficos (SVG/CSS, sem dependências) ---------- */
function chartBars(rows) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return `<div class="bars">${rows.map(r => `<div class="bar-row"><span>${esc(r.label)}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${r.value / max * 100}%;--bc:${r.color}"></div></div><b>${r.fmt ? r.fmt(r.value) : r.value}</b></div>`).join('')}</div>`;
}
function chartCols(groups, series) {
  const max = Math.max(1, ...groups.flatMap(g => g.values));
  return `<div class="cols">${groups.map(g => `<div class="col"><div class="col-bars">${g.values.map((v, i) =>
    `<div class="col-bar" style="height:${v / max * 88}%;--bc:${series[i].color}" title="${esc(series[i].label)}: ${v}"><span>${v}</span></div>`).join('')}</div><label>${esc(g.label)}</label></div>`).join('')}</div>
    <div class="legend">${series.map(s => `<span><i style="--bc:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>`;
}
function chartDonut(parts, center, sub) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const R = 52, C = 2 * Math.PI * R; let off = 0;
  const arcs = parts.map(p => {
    const len = p.value / total * C;
    const a = `<circle r="${R}" cx="75" cy="75" fill="none" stroke="${p.color}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 75 75)" style="filter:drop-shadow(0 0 4px ${p.color}66)"/>`;
    off += len; return a;
  }).join('');
  return `<div class="donut"><svg viewBox="0 0 150 150"><circle r="${R}" cx="75" cy="75" fill="none" stroke="var(--bg-2)" stroke-width="16"/>${arcs}
    <text x="75" y="78" text-anchor="middle" class="donut-center">${center}</text><text x="75" y="95" text-anchor="middle" class="donut-sub">${esc(sub)}</text></svg>
    <div class="legend" style="flex-direction:column;gap:6px;margin:0">${parts.map(p => `<span><i style="--bc:${p.color}"></i>${esc(p.label)}: <b>${p.value}</b></span>`).join('')}</div></div>`;
}

/* ---------- Componentes ---------- */
function visitCard(v, actions = true) {
  const c = cliente(v.clienteId) || {};
  const aberta = ['agendada', 'reagendada'].includes(v.status);
  return `<div class="visit-card" style="--sc:${ST_VIS[v.status]?.c}" data-action="verVisita" data-id="${v.id}">
    <div class="vc-time">${fmtDate(v.data)} às ${esc(v.hora)}</div>
    <dl><dt>Cliente</dt><dd><b>${esc(c.nome || '—')}</b></dd>
      <dt>SDR</dt><dd>${sdrTag(c.sdr)}</dd>
      <dt>Local</dt><dd>${esc(v.endereco || c.cidade || '—')}</dd>
      <dt>Técnico</dt><dd>${esc(v.tecnico || '—')}</dd>
      <dt>Status</dt><dd>${badge(ST_VIS, v.status)}</dd></dl>
    ${actions && aberta ? `<div class="vc-actions">
      <button class="btn btn-sm btn-ok" data-action="visitaRealizada" data-id="${v.id}">✓ Realizada</button>
      <button class="btn btn-sm" data-action="editVisita" data-id="${v.id}">Reagendar</button>
      <button class="btn btn-sm btn-wa" data-action="wa" data-id="${c.id}" data-tpl="confirmar">WhatsApp</button>
      <button class="btn btn-sm btn-danger" data-action="cancelarVisita" data-id="${v.id}">Cancelar</button></div>` : ''}
  </div>`;
}
const waBtn = c => (digits(c.whatsapp || c.telefone).length >= 10)
  ? `<a class="btn btn-sm btn-wa" href="${waLink(c.whatsapp || c.telefone)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">WhatsApp</a>` : '';

function tabelaClientes(list) {
  if (!list.length) return empty('Nenhum cliente encontrado.', 'Ajuste os filtros ou cadastre uma nova oportunidade.', '<button class="btn btn-primary" data-action="novoCliente">+ Novo cliente</button>');
  return `<div class="table-wrap glass"><table class="table responsive"><thead><tr><th>Cliente</th><th>Contato</th><th>Cidade</th><th>SDR</th><th>Status</th><th>Entrada</th><th></th></tr></thead><tbody>
  ${list.map(c => `<tr data-action="verCliente" data-id="${c.id}">
    <td data-l="Cliente" class="cell-main"><b>${esc(c.nome)}</b><small>${esc(c.empresa || c.servico || '')}</small></td>
    <td data-l="Contato">${esc(c.whatsapp || c.telefone || '—')}</td>
    <td data-l="Cidade">${esc(c.cidade || '—')}</td>
    <td data-l="SDR">${sdrTag(c.sdr)}</td>
    <td data-l="Status">${badge(ST_CLI, c.status)}</td>
    <td data-l="Entrada">${fmtDateTime(c.entrada)}</td>
    <td class="actions">${waBtn(c)} <button class="btn btn-sm" data-action="editCliente" data-id="${c.id}">Editar</button>
      ${isAdmin() ? `<button class="btn btn-sm btn-danger" data-action="delCliente" data-id="${c.id}" aria-label="Excluir">✕</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function tabelaOrcs(list) {
  if (!list.length) return empty('Nenhum orçamento encontrado.', 'Crie o primeiro orçamento a partir de um cliente.', '<button class="btn btn-primary" data-action="novoOrcamento">+ Novo orçamento</button>');
  return `<div class="table-wrap glass"><table class="table responsive"><thead><tr><th>Nº</th><th>Cliente</th><th>SDR</th><th>Data</th><th>Validade</th><th>Status</th><th class="num">Total</th><th></th></tr></thead><tbody>
  ${list.map(o => { const c = cliente(o.clienteId) || {}; return `<tr data-action="verOrcamento" data-id="${o.id}">
    <td data-l="Nº"><b>${numOrc(o.numero)}</b></td>
    <td data-l="Cliente" class="cell-main"><b>${esc(c.nome || '—')}</b><small>${esc(c.cidade || '')}</small></td>
    <td data-l="SDR">${sdrTag(c.sdr)}</td>
    <td data-l="Data">${fmtDate(o.data)}</td>
    <td data-l="Validade">${fmtDate(o.validade)}</td>
    <td data-l="Status">${badge(ST_ORC, o.status)}</td>
    <td data-l="Total" class="num"><b>${money(o.total)}</b></td>
    <td class="actions"><button class="btn btn-sm" data-action="pdfOrcamento" data-id="${o.id}">PDF</button>
      <button class="btn btn-sm btn-wa" data-action="shareOrcamento" data-id="${o.id}">Enviar</button>
      <button class="btn btn-sm" data-action="editOrcamento" data-id="${o.id}">Editar</button>
      ${isAdmin() ? `<button class="btn btn-sm btn-danger" data-action="delOrcamento" data-id="${o.id}" aria-label="Excluir">✕</button>` : ''}</td></tr>`; }).join('')}
  </tbody></table></div>`;
}

/* ---------- 8. VIEWS ---------- */
const matchCliente = (c, q) => {
  const n = norm(q), d = digits(q);
  const txt = norm([c.nome, c.empresa, c.endereco, c.bairro, c.cidade, c.sdr, c.email].join(' '));
  return txt.includes(n) || (d.length >= 3 && (digits(c.telefone).includes(d) || digits(c.whatsapp).includes(d)));
};

VIEWS.dashboard = () => {
  const cs = myClientes(), vs = myVisitas(), os = myOrcs();
  const hoje = todayISO(), ws = toISODate(startOfWeek(new Date())), we = toISODate(addDays(startOfWeek(new Date()), 6));
  const ativa = v => v.status !== 'cancelada';
  const vHoje = vs.filter(v => v.data === hoje && ativa(v));
  const vSem = vs.filter(v => v.data >= ws && v.data <= we && ativa(v));
  const k = [
    ['Novos clientes', cs.filter(c => c.status === 'novo').length, 'aguardando contato', '#3cd4ff', ['clientes', { status: 'novo' }]],
    ['Visitas hoje', vHoje.length, fmtDate(hoje), '#ffd166', ['agenda', null, 'day']],
    ['Visitas na semana', vSem.length, `${fmtDate(ws).slice(0, 5)} a ${fmtDate(we).slice(0, 5)}`, '#7d8cff', ['agenda', null, 'week']],
    ['Orçamentos feitos', os.length, money(os.reduce((s, o) => s + o.total, 0)), '#b18cff', ['orcamentos', {}]],
    ['Orçamentos pendentes', os.filter(o => o.status === 'rascunho').length, 'aguardando envio', '#ffb547', ['orcamentos', { status: 'rascunho' }]],
    ['Clientes ganhos', cs.filter(c => c.status === 'fechado').length, 'fechados', '#2fe0a1', ['clientes', { status: 'fechado' }]],
    ['Clientes perdidos', cs.filter(c => c.status === 'perdido').length, 'não fecharam', '#ff5d73', ['clientes', { status: 'perdido' }]]
  ];
  const lista = sdrs();
  const st = lista.map(s => ({ s, ...stats(s.nome) }));
  const prox = vs.filter(v => ['agendada', 'reagendada'].includes(v.status) && v.data >= hoje).sort((a, b) => dtVisita(a) - dtVisita(b)).slice(0, 6);
  const ultimos = [...cs].sort((a, b) => b.entrada.localeCompare(a.entrada)).slice(0, 6);
  const emAndamento = cs.filter(c => !FINAL_CLI.includes(c.status)).length;
  return head(`Olá, ${esc(ME.nome.split(' ')[0])}`, `Hoje você tem ${vHoje.length} visita(s) e ${os.filter(o => o.status === 'rascunho').length} orçamento(s) aguardando envio.`) +
    `<div class="kpis">${k.map(([l, v, s, c, g]) => `<div class="kpi glass" style="--kc:${c}" data-action="goto" data-go='${JSON.stringify(g)}'><span>${l}</span><b>${v}</b><small>${esc(s)}</small></div>`).join('')}</div>
    <div class="grid g2">
      <div class="panel glass"><h3>Clientes cadastrados por SDR</h3>${chartBars(st.map(x => ({ label: x.s.nome, value: x.clientes, color: x.s.cor })))}</div>
      <div class="panel glass"><h3>Resultado da carteira</h3>${chartDonut([
        { label: 'Fechados', value: cs.filter(c => c.status === 'fechado').length, color: '#2fe0a1' },
        { label: 'Em andamento', value: emAndamento, color: '#3cd4ff' },
        { label: 'Perdidos', value: cs.filter(c => c.status === 'perdido').length, color: '#ff5d73' },
        { label: 'Cancelados', value: cs.filter(c => c.status === 'cancelado').length, color: '#8a9bb8' }], cs.length, 'clientes')}</div>
    </div>
    <div class="panel glass" style="margin-top:16px"><h3>Funil por SDR</h3>${chartCols(st.map(x => ({ label: x.s.nome, values: [x.realizadas, x.orcamentos, x.fechados, x.perdidos] })),
      [{ label: 'Visitas realizadas', color: '#3cd4ff' }, { label: 'Orçamentos', color: '#b18cff' }, { label: 'Fecharam', color: '#2fe0a1' }, { label: 'Não fecharam', color: '#ff5d73' }])}</div>
    <div class="grid g2" style="margin-top:16px">
      <div class="panel glass"><h3>Próximas visitas <a data-view="agenda" href="#/agenda" style="font-size:13px">Ver agenda</a></h3>
        ${prox.length ? `<div class="day-list" style="grid-template-columns:1fr">${prox.map(v => visitCard(v, false)).join('')}</div>` : empty('Nenhuma visita pendente.', 'Agende a partir de um cliente.', '<button class="btn" data-action="novaVisita">+ Agendar visita</button>')}</div>
      <div class="panel glass"><h3>Últimos clientes <a data-view="clientes" href="#/clientes" style="font-size:13px">Ver todos</a></h3>
        ${ultimos.length ? ultimos.map(c => `<div class="notif" data-action="verCliente" data-id="${c.id}" style="cursor:pointer"><span class="avatar" style="background:${sdrColor(c.sdr)}">${initials(c.nome)}</span>
          <div style="flex:1"><b>${esc(c.nome)}</b><small>${esc(c.servico || '')} · ${esc(c.sdr)} · ${fmtDateTime(c.entrada)}</small></div>${badge(ST_CLI, c.status)}</div>`).join('') : empty('Nenhum cliente ainda.', '')}</div>
    </div>`;
};

const LISTS = {};
LISTS.clientes = () => {
  const f = F('clientes');
  const orcIds = new Set(DB.all('orcamentos').map(o => o.clienteId));
  const list = myClientes().filter(c =>
    (!f.sdr || c.sdr === f.sdr) && (!f.status || c.status === f.status) && (!f.cidade || c.cidade === f.cidade) &&
    (!f.origem || c.origem === f.origem) && (!f.de || c.entrada.slice(0, 10) >= f.de) && (!f.ate || c.entrada.slice(0, 10) <= f.ate) &&
    (!f.orc || (f.orc === 'com' ? orcIds.has(c.id) : !orcIds.has(c.id))) && (!f.q || matchCliente(c, f.q))
  ).sort((a, b) => b.entrada.localeCompare(a.entrada));
  return `<p style="color:var(--muted);margin:0 0 10px">${list.length} cliente(s)</p>` + tabelaClientes(list);
};
const cidades = () => [...new Set(myClientes().map(c => c.cidade).filter(Boolean))].sort();
VIEWS.clientes = () => head('Clientes', 'Todas as oportunidades que chegaram pelas SDRs.',
  `<button class="btn btn-sm" data-action="exportCSV" data-id="clientes">CSV</button><button class="btn btn-sm" data-action="exportPDF" data-id="clientes">PDF</button><button class="btn btn-primary" data-action="novoCliente">+ Novo cliente</button>`) +
  filterBar('clientes', [
    { key: 'q', label: 'Buscar', ph: 'Nome, telefone, empresa…' },
    ...(isAdmin() ? [{ key: 'sdr', label: 'SDR', type: 'select', options: sdrOpts() }] : []),
    { key: 'status', label: 'Status', type: 'select', options: mapOpts(ST_CLI) },
    { key: 'cidade', label: 'Cidade', type: 'select', options: cidades() },
    { key: 'origem', label: 'Origem', type: 'select', options: ORIGENS },
    { key: 'orc', label: 'Orçamento', type: 'select', options: [['com', 'Com orçamento'], ['sem', 'Sem orçamento']] },
    { key: 'de', label: 'Entrada de', type: 'date' }, { key: 'ate', label: 'até', type: 'date' }
  ]) + `<div id="listArea">${LISTS.clientes()}</div>`;

LISTS.oportunidades = () => {
  const f = F('oportunidades');
  const cs = myClientes().filter(c => (!f.sdr || c.sdr === f.sdr) && (!f.cidade || c.cidade === f.cidade) && (!f.q || matchCliente(c, f.q)));
  const dias = c => Math.floor((Date.now() - new Date(c.entrada)) / 864e5);
  return `<div class="kanban">${ORDER_CLI.map(s => {
    const items = cs.filter(c => c.status === s).sort((a, b) => b.entrada.localeCompare(a.entrada));
    return `<section class="kan-col glass" data-status="${s}" style="--sc:${ST_CLI[s].c}"><header>${ST_CLI[s].l}<em>${items.length}</em></header>
      ${items.map(c => `<article class="kan-card" draggable="true" data-card="${c.id}" data-action="verCliente" data-id="${c.id}">
        <b>${esc(c.nome)}</b><small>${esc(c.servico || '')}${c.cidade ? ' em ' + esc(c.cidade) : ''}</small>
        <div class="row">${sdrTag(c.sdr)}<small>${dias(c) === 0 ? 'hoje' : dias(c) + 'd'}</small></div></article>`).join('')}</section>`;
  }).join('')}</div>`;
};
VIEWS.oportunidades = () => head('Oportunidades', 'Arraste o cartão para mudar a etapa. No celular, toque para abrir e trocar o status.', '<button class="btn btn-primary" data-action="novoCliente">+ Novo cliente</button>') +
  filterBar('oportunidades', [
    { key: 'q', label: 'Buscar', ph: 'Nome, telefone…' },
    ...(isAdmin() ? [{ key: 'sdr', label: 'SDR', type: 'select', options: sdrOpts() }] : []),
    { key: 'cidade', label: 'Cidade', type: 'select', options: cidades() }
  ]) + `<div id="listArea">${LISTS.oportunidades()}</div>`;

/* Agenda */
function visitasAgenda() {
  const f = ui.cal;
  return myVisitas().filter(v => (!f.sdr || sdrDoCliente(v.clienteId) === f.sdr) && (f.showCanc || v.status !== 'cancelada'));
}
VIEWS.agenda = () => {
  const { mode, date } = ui.cal;
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  const titulo = cap(mode === 'month' ? date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : mode === 'week' ? `Semana de ${fmtDate(toISODate(startOfWeek(date)))}`
    : date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }));
  const vs = visitasAgenda();
  const byDay = {}; vs.forEach(v => (byDay[v.data] ||= []).push(v));
  Object.values(byDay).forEach(a => a.sort((x, y) => x.hora.localeCompare(y.hora)));
  const hoje = todayISO();
  let body = '';
  if (mode === 'month') {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const start = startOfWeek(first);
    body = `<div class="cal-month">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => `<div class="cal-dow">${d}</div>`).join('')}
      ${Array.from({ length: 42 }, (_, i) => {
        const d = addDays(start, i), iso = toISODate(d), evs = byDay[iso] || [];
        return `<div class="cal-day ${d.getMonth() !== date.getMonth() ? 'out' : ''} ${iso === hoje ? 'today' : ''}" data-action="calDay" data-id="${iso}">
          <span>${d.getDate()}</span>${evs.slice(0, 3).map(v => `<div class="cal-ev" style="--sc:${ST_VIS[v.status].c}" data-action="verVisita" data-id="${v.id}">${v.hora} ${esc(cliente(v.clienteId)?.nome || '')}</div>`).join('')}
          ${evs.length > 3 ? `<div class="cal-more">+${evs.length - 3} visita(s)</div>` : ''}</div>`;
      }).join('')}</div>`;
  } else if (mode === 'week') {
    const s = startOfWeek(date);
    body = `<div class="cal-week">${Array.from({ length: 7 }, (_, i) => {
      const d = addDays(s, i), iso = toISODate(d), evs = byDay[iso] || [];
      return `<div class="cal-week-col glass ${iso === hoje ? 'today' : ''}"><h4 data-action="calDay" data-id="${iso}" style="cursor:pointer">${d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</h4>
        ${evs.map(v => visitCard(v, false)).join('') || '<small style="color:var(--muted)">Livre</small>'}</div>`;
    }).join('')}</div>`;
  } else {
    const iso = toISODate(date), evs = byDay[iso] || [];
    body = evs.length ? `<div class="day-list">${evs.map(v => visitCard(v)).join('')}</div>`
      : empty('Nenhuma visita neste dia.', '', `<button class="btn btn-primary" data-action="novaVisita" data-date="${iso}">+ Agendar neste dia</button>`);
  }
  return head('Agenda de visitas', 'Toque em um dia para ver as visitas; toque na visita para editar.', `<button class="btn btn-primary" data-action="novaVisita" data-date="${mode === 'day' ? toISODate(date) : ''}">+ Agendar visita</button>`) +
    `<div class="cal-toolbar">
      <button class="icon-btn" data-action="calNav" data-id="-1" aria-label="Anterior">‹</button>
      <button class="btn btn-sm" data-action="calToday">Hoje</button>
      <button class="icon-btn" data-action="calNav" data-id="1" aria-label="Próximo">›</button>
      <h2>${titulo}</h2>
      <div class="seg">${[['month', 'Mês'], ['week', 'Semana'], ['day', 'Dia']].map(([m, l]) => `<button class="${mode === m ? 'on' : ''}" data-action="calMode" data-id="${m}">${l}</button>`).join('')}</div>
      ${isAdmin() ? `<select class="input" style="width:auto" data-cal="sdr">${opt(sdrOpts(), ui.cal.sdr, 'Todas as SDRs')}</select>` : ''}
      <label style="font-size:13px;color:var(--muted);display:flex;gap:6px;align-items:center"><input type="checkbox" data-cal="showCanc" ${ui.cal.showCanc ? 'checked' : ''}> Mostrar canceladas</label>
      <div class="legend" style="margin:0 0 0 auto">${Object.values(ST_VIS).map(s => `<span><i style="--bc:${s.c}"></i>${s.l}</span>`).join('')}</div>
    </div>${body}`;
};

/* Minhas visitas (árvore por SDR) */
LISTS.visitas = () => {
  const f = F('visitas');
  const vs = myVisitas().filter(v => {
    const c = cliente(v.clienteId) || {};
    return (!f.de || v.data >= f.de) && (!f.ate || v.data <= f.ate) && (!f.sdr || c.sdr === f.sdr) &&
      (!f.status || v.status === f.status) && (!f.q || matchCliente(c, f.q));
  }).sort((a, b) => dtVisita(b) - dtVisita(a));
  if (!vs.length) return empty('Nenhuma visita no filtro atual.', 'Altere o período ou o status.');
  return `<div class="tree">${sdrs().map(s => {
    const mine = vs.filter(v => sdrDoCliente(v.clienteId) === s.nome);
    if (!mine.length) return '';
    return `<div class="tree-sdr glass" style="--sdrc:${s.cor}"><h3>${sdrTag(s.nome)}<small style="color:var(--muted);font-size:13px">${mine.length} visita(s)</small></h3>
      <ul class="tree-list">${mine.map(v => { const c = cliente(v.clienteId); const o = ultimoOrc(v.clienteId);
        return `<li data-action="verVisita" data-id="${v.id}"><b>${esc(c.nome)}</b>
          <small>${fmtDate(v.data)} às ${esc(v.hora)} em ${esc(c.cidade || '—')} ${o ? ' | Orçamento ' + money(o.total) : ''}</small> ${badge(ST_VIS, v.status)}</li>`; }).join('')}</ul></div>`;
  }).join('')}</div>`;
};
VIEWS.visitas = () => {
  if (!ui.filters.visitas) { const d = new Date(); ui.filters.visitas = { de: toISODate(new Date(d.getFullYear(), d.getMonth(), 1)), ate: toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }; }
  return head('Minhas visitas', 'Visitas agrupadas pela SDR que trouxe o cliente.', `<button class="btn btn-sm" data-action="exportCSV" data-id="visitas">CSV</button><button class="btn btn-sm" data-action="exportPDF" data-id="visitas">PDF</button><button class="btn btn-primary" data-action="relVisitasFiltro">Gerar relatório de visitas</button>`) +
    filterBar('visitas', [
      { key: 'de', label: 'Data inicial', type: 'date' }, { key: 'ate', label: 'Data final', type: 'date' },
      ...(isAdmin() ? [{ key: 'sdr', label: 'SDR', type: 'select', options: sdrOpts() }] : []),
      { key: 'q', label: 'Cliente', ph: 'Nome ou telefone' },
      { key: 'status', label: 'Status', type: 'select', options: mapOpts(ST_VIS) }
    ]) + `<div id="listArea">${LISTS.visitas()}</div>`;
};

/* Orçamentos */
LISTS.orcamentos = () => {
  const f = F('orcamentos');
  const list = myOrcs().filter(o => {
    const c = cliente(o.clienteId) || {};
    return (!f.sdr || c.sdr === f.sdr) && (!f.status || o.status === f.status) && (!f.de || o.data >= f.de) && (!f.ate || o.data <= f.ate) &&
      (!f.cidade || c.cidade === f.cidade) && (!f.q || matchCliente(c, f.q) || numOrc(o.numero).includes(f.q.trim()) || String(o.numero) === f.q.trim());
  }).sort((a, b) => b.numero - a.numero);
  const tot = list.reduce((s, o) => s + o.total, 0);
  return `<p style="color:var(--muted);margin:0 0 10px">${list.length} orçamento(s) somando <b style="color:var(--text)">${money(tot)}</b></p>` + tabelaOrcs(list);
};
VIEWS.orcamentos = () => head('Orçamentos', 'Crie, visualize, gere o PDF e envie pelo WhatsApp.',
  `<button class="btn btn-sm" data-action="exportCSV" data-id="orcamentos">CSV</button><button class="btn btn-sm" data-action="exportPDF" data-id="orcamentos">PDF</button><button class="btn btn-primary" data-action="novoOrcamento">+ Novo orçamento</button>`) +
  filterBar('orcamentos', [
    { key: 'q', label: 'Buscar', ph: 'Cliente ou nº' },
    ...(isAdmin() ? [{ key: 'sdr', label: 'SDR', type: 'select', options: sdrOpts() }] : []),
    { key: 'status', label: 'Status', type: 'select', options: mapOpts(ST_ORC) },
    { key: 'cidade', label: 'Cidade', type: 'select', options: cidades() },
    { key: 'de', label: 'De', type: 'date' }, { key: 'ate', label: 'Até', type: 'date' }
  ]) + `<div id="listArea">${LISTS.orcamentos()}</div>`;

/* Relatórios */
VIEWS.relatorios = () => {
  const d = new Date();
  const de = toISODate(new Date(d.getFullYear(), d.getMonth(), 1)), ate = toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  const rows = sdrs().map(s => ({ s, ...stats(s.nome, de, ate) }));
  return head('PDFs e relatórios', 'Relatórios em PDF prontos para enviar ou arquivar.') +
    `<div class="grid g2">
      <div class="panel glass"><h3>Relatório de visitas por SDR</h3>
        <div class="form-grid">
          <label class="field c12"><span>SDR</span><select id="relSdr">${isAdmin() ? '<option value="">Todas</option>' : ''}${opt(sdrOpts())}</select></label>
          <label class="field c6"><span>Data inicial</span><input type="date" id="relDe" value="${de}"></label>
          <label class="field c6"><span>Data final</span><input type="date" id="relAte" value="${ate}"></label>
        </div>
        <div class="form-actions"><button class="btn btn-primary" data-action="pdfRelSDR">Gerar relatório de visitas</button></div></div>
      <div class="panel glass"><h3>Relatório geral</h3>
        <div class="form-grid">
          <label class="field c6"><span>Data inicial</span><input type="date" id="relGDe" value="${de}"></label>
          <label class="field c6"><span>Data final</span><input type="date" id="relGAte" value="${ate}"></label>
        </div>
        <p style="color:var(--muted);font-size:13px">Consolida clientes, visitas, orçamentos, valor orçado e fechamentos de cada SDR.</p>
        <div class="form-actions"><button class="btn btn-primary" data-action="pdfRelGeral">Gerar relatório geral</button></div></div>
    </div>
    <div class="panel glass" style="margin-top:16px"><h3>Exportar dados</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${['clientes', 'visitas', 'orcamentos'].map(c => `<button class="btn" data-action="exportPDF" data-id="${c}">${c[0].toUpperCase() + c.slice(1).replace('cament', 'çament')} em PDF</button><button class="btn" data-action="exportCSV" data-id="${c}">${c[0].toUpperCase() + c.slice(1).replace('cament', 'çament')} em CSV</button>`).join('')}
      </div></div>
    <div class="panel glass" style="margin-top:16px"><h3>Resumo do mês atual</h3>${tabelaResumo(rows)}</div>`;
};
function tabelaResumo(rows) {
  const T = k => rows.reduce((s, r) => s + r[k], 0);
  return `<div class="table-wrap"><table class="table responsive"><thead><tr><th>SDR</th><th class="num">Clientes</th><th class="num">Visitas</th><th class="num">Realizadas</th><th class="num">Orçamentos</th><th class="num">Valor orçado</th><th class="num">Fechados</th><th class="num">Conversão</th></tr></thead><tbody>
    ${rows.map(r => `<tr data-action="selSdr" data-id="${esc(r.s.nome)}"><td data-l="SDR">${sdrTag(r.s.nome)}</td><td data-l="Clientes" class="num">${r.clientes}</td><td data-l="Visitas" class="num">${r.visitas}</td><td data-l="Realizadas" class="num">${r.realizadas}</td><td data-l="Orçamentos" class="num">${r.orcamentos}</td><td data-l="Valor orçado" class="num">${money(r.valorOrcado)}</td><td data-l="Fechados" class="num">${r.fechados}</td><td data-l="Conversão" class="num">${pct(r.fechados, r.clientes)}%</td></tr>`).join('')}
    ${rows.length > 1 ? `<tr><td data-l=""><b>Total geral</b></td><td data-l="Clientes" class="num"><b>${T('clientes')}</b></td><td data-l="Visitas" class="num"><b>${T('visitas')}</b></td><td data-l="Realizadas" class="num"><b>${T('realizadas')}</b></td><td data-l="Orçamentos" class="num"><b>${T('orcamentos')}</b></td><td data-l="Valor orçado" class="num"><b>${money(T('valorOrcado'))}</b></td><td data-l="Fechados" class="num"><b>${T('fechados')}</b></td><td data-l="Conversão" class="num"><b>${pct(T('fechados'), T('clientes'))}%</b></td></tr>` : ''}
  </tbody></table></div>`;
}

/* SDRs */
VIEWS.sdrs = () => {
  const lista = sdrs();
  if (!isAdmin()) ui.sdrSel = ME.sdr;
  const sel = ui.sdrSel;
  let detalhe = '';
  if (sel) {
    const cs = DB.all('clientes').filter(c => c.sdr === sel).sort((a, b) => b.entrada.localeCompare(a.entrada));
    const vs = DB.all('visitas').filter(v => sdrDoCliente(v.clienteId) === sel).sort((a, b) => dtVisita(b) - dtVisita(a));
    detalhe = `<h2 style="margin:24px 0 12px;font-size:19px">Clientes de ${esc(sel)}</h2>${tabelaClientes(cs)}
      <h2 style="margin:24px 0 12px;font-size:19px">Visitas de ${esc(sel)}</h2>
      ${vs.length ? `<div class="day-list">${vs.map(v => visitCard(v)).join('')}</div>` : empty('Nenhuma visita.', '')}`;
  }
  return head('SDRs', isAdmin() ? 'Toque em uma SDR para ver só os clientes e visitas dela.' : 'Seus números.') +
    `<div class="grid g3">${lista.map(s => { const x = stats(s.nome); return `<div class="sdr-card glass ${sel === s.nome ? 'selected' : ''}" style="--sdrc:${s.cor}" data-action="selSdr" data-id="${esc(s.nome)}">
      <div class="avatar">${initials(s.nome)}</div><h3>${esc(s.nome)}</h3><div class="role">SDR</div>
      <div class="sdr-stats"><div><small>Clientes cadastrados</small><b>${x.clientes}</b></div><div><small>Visitas</small><b>${x.visitas}</b></div>
      <div><small>Orçamentos</small><b>${x.orcamentos}</b></div><div><small>Fechamentos</small><b>${x.fechados}</b></div></div></div>`; }).join('')}</div>${detalhe}`;
};

/* Indicadores */
VIEWS.indicadores = () => {
  const cs = myClientes(), os = myOrcs();
  const rows = sdrs().map(s => ({ s, ...stats(s.nome) }));
  const count = (arr, key, list) => list.map(v => ({ v, n: arr.filter(x => x[key] === v).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
  const orig = count(cs, 'origem', ORIGENS), serv = count(cs, 'servico', SERVICOS);
  const aprov = os.filter(o => o.status === 'aprovado');
  const ticket = aprov.length ? aprov.reduce((s, o) => s + o.total, 0) / aprov.length : 0;
  const decididos = os.filter(o => ['aprovado', 'recusado'].includes(o.status)).length;
  const palette = ['#3cd4ff', '#7d8cff', '#ff7ad9', '#ffb547', '#2fe0a1', '#b18cff', '#ff9f5a', '#8a9bb8'];
  return head('Indicadores', 'Onde a operação ganha e onde perde.') +
    `<div class="kpis">
      <div class="kpi glass" style="--kc:#2fe0a1"><span>Taxa de fechamento</span><b>${pct(cs.filter(c => c.status === 'fechado').length, cs.length)}%</b><small>clientes fechados / total</small></div>
      <div class="kpi glass" style="--kc:#b18cff"><span>Aprovação de orçamentos</span><b>${pct(aprov.length, decididos)}%</b><small>aprovados / decididos</small></div>
      <div class="kpi glass" style="--kc:#3cd4ff"><span>Valor orçado</span><b style="font-size:24px">${money(os.reduce((s, o) => s + o.total, 0))}</b><small>${os.length} orçamento(s)</small></div>
      <div class="kpi glass" style="--kc:#ffb547"><span>Valor fechado</span><b style="font-size:24px">${money(aprov.reduce((s, o) => s + o.total, 0))}</b><small>ticket médio ${money(ticket)}</small></div>
    </div>
    <div class="panel glass"><h3>Desempenho por SDR</h3>${tabelaResumo(rows)}</div>
    <div class="grid g2" style="margin-top:16px">
      <div class="panel glass"><h3>Origem dos clientes</h3>${orig.length ? chartBars(orig.map((x, i) => ({ label: x.v, value: x.n, color: palette[i % 8] }))) : empty('Sem dados.', '')}</div>
      <div class="panel glass"><h3>Serviço de interesse</h3>${serv.length ? chartBars(serv.map((x, i) => ({ label: x.v, value: x.n, color: palette[(i + 3) % 8] }))) : empty('Sem dados.', '')}</div>
    </div>
    <div class="panel glass" style="margin-top:16px"><h3>Funil de status</h3>${chartBars(ORDER_CLI.map(s => ({ label: ST_CLI[s].l, value: cs.filter(c => c.status === s).length, color: ST_CLI[s].c })))}</div>`;
};

/* Configurações */
VIEWS.config = () => {
  const E = CONFIG.empresa;
  const senha = `<div class="panel glass"><h3>Minha senha</h3><form data-form="senha" class="form-grid">
      <label class="field c6"><span>Senha atual</span><input type="password" name="atual" required></label>
      <label class="field c6"><span>Nova senha</span><input type="password" name="nova" minlength="6" required></label>
      <div class="c12 form-actions" style="margin:0"><button class="btn btn-primary">Salvar senha</button></div></form></div>`;
  if (!isAdmin()) return head('Configurações', '') + senha;
  const users = DB.all('usuarios');
  const nDemo = ['clientes', 'visitas', 'orcamentos'].reduce((s, c) => s + DB.all(c).filter(x => x.demo).length, 0);
  return head('Configurações', 'Dados da empresa, mensagens, usuários e backup.') +
    `<div class="grid g2">
    <div class="panel glass"><h3>Dados da empresa (cabeçalho dos PDFs)</h3><form data-form="empresa" class="form-grid">
      <label class="field c12"><span>Razão social / nome</span><input name="nome" value="${esc(E.nome)}"></label>
      <label class="field c6"><span>CNPJ</span><input name="cnpj" value="${esc(E.cnpj)}"></label>
      <label class="field c6"><span>Telefone</span><input name="telefone" value="${esc(E.telefone)}" data-mask="tel"></label>
      <label class="field c12"><span>Endereço</span><input name="endereco" value="${esc(E.endereco)}"></label>
      <label class="field c6"><span>Cidade - UF</span><input name="cidade" value="${esc(E.cidade)}"></label>
      <label class="field c6"><span>E-mail</span><input name="email" value="${esc(E.email)}"></label>
      <label class="field c6"><span>Site</span><input name="site" value="${esc(E.site)}"></label>
      <label class="field c3"><span>Validade (dias)</span><input type="number" name="validadeDias" value="${CONFIG.validadeDias}"></label>
      <label class="field c3"><span>Próximo nº</span><input type="number" name="proxNumero" value="${CONFIG.proxNumero}"></label>
      <label class="field c12"><span>Condição de pagamento padrão</span><input name="pagamentoPadrao" value="${esc(CONFIG.pagamentoPadrao)}"></label>
      <label class="field c12"><span>Técnicos / responsáveis pelas visitas (separe por vírgula)</span><input name="tecnicos" value="${esc(CONFIG.tecnicos.join(', '))}"></label>
      <div class="c12 form-actions" style="margin:0"><button class="btn btn-primary">Salvar dados</button></div></form></div>
    <div class="panel glass"><h3>Mensagens de WhatsApp</h3><form data-form="templates" class="form-grid">
      ${Object.entries(TPL_LABEL).map(([k, l]) => `<label class="field c12"><span>${l}</span><textarea name="${k}" rows="3">${esc(CONFIG.templates[k])}</textarea></label>`).join('')}
      <p class="c12" style="margin:0;font-size:12px;color:var(--muted)">Variáveis: {nome} {sdr} {data} {hora} {endereco} {numero} {total} {empresa}</p>
      <div class="c12 form-actions" style="margin:0"><button class="btn btn-primary">Salvar mensagens</button></div></form></div>
    </div>
    <div class="grid g2" style="margin-top:16px">
    <div class="panel glass"><h3>Usuários</h3>
      <div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th></th></tr></thead><tbody>
      ${users.map(u => `<tr style="cursor:default"><td>${esc(u.nome)}</td><td>${esc(u.usuario)}</td><td>${u.perfil === 'admin' ? 'Administrador' : 'SDR: ' + esc(u.sdr)}</td>
        <td class="actions"><button class="btn btn-sm" data-action="resetSenha" data-id="${u.id}">Nova senha</button>${u.id !== ME.id ? `<button class="btn btn-sm btn-danger" data-action="delUser" data-id="${u.id}">✕</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>
      <form data-form="usuario" class="form-grid" style="margin-top:14px">
        <label class="field c6"><span class="req">Nome</span><input name="nome" required></label>
        <label class="field c6"><span class="req">Usuário</span><input name="usuario" required autocapitalize="off"></label>
        <label class="field c4"><span class="req">Senha</span><input name="senha" type="password" minlength="6" required></label>
        <label class="field c4"><span>Perfil</span><select name="perfil"><option value="sdr">SDR</option><option value="admin">Administrador</option></select></label>
        <label class="field c4"><span>SDR vinculada</span><select name="sdr">${opt(CONFIG.sdrs.map(s => s.nome))}</select></label>
        <div class="c12 form-actions" style="margin:0"><button class="btn">+ Adicionar usuário</button></div></form>
      <form data-form="sdr" class="form-grid" style="margin-top:14px;border-top:1px solid var(--line);padding-top:14px">
        <label class="field c8"><span>Nova SDR (nome)</span><input name="nome" required></label>
        <label class="field c4"><span>Cor</span><input name="cor" type="color" value="#7d8cff"></label>
        <div class="c12 form-actions" style="margin:0"><button class="btn">+ Adicionar SDR</button></div></form>
    </div>
    <div class="panel glass"><h3>Dados e backup</h3>
      <p style="color:var(--muted);font-size:14px;margin-top:0">Os dados ficam neste navegador. Faça backup semanal e guarde fora do computador.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" data-action="backup">Baixar backup (JSON)</button>
        <label class="btn">Restaurar backup<input type="file" accept="application/json" id="restoreFile" hidden></label>
      </div>
      <h3 style="margin-top:22px">Dados de demonstração</h3>
      <p style="color:var(--muted);font-size:14px;margin-top:0">${nDemo} registro(s) DEMO no sistema.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" data-action="removerDemo" ${nDemo ? '' : 'disabled'}>Remover dados DEMO</button>
        <button class="btn" data-action="restaurarDemo">Carregar dados DEMO</button>
        <button class="btn btn-danger" data-action="resetAll">Apagar tudo</button>
      </div></div>
    </div><div style="margin-top:16px">${senha}</div>`;
};

/* ---------- 9. FORMULÁRIOS E MODAIS ---------- */
const formData = form => Object.fromEntries(new FormData(form).entries());
const backFrom = el => (el?.closest?.('#modal') && ui.detailId) ? ui.detailId : '';

function formCliente(c = {}, back = '') {
  const sdrDefault = c.sdr || (isAdmin() ? '' : ME.sdr);
  return `<form data-form="cliente" class="form-grid" novalidate>
    <input type="hidden" name="id" value="${c.id || ''}"><input type="hidden" name="_back" value="${back}">
    <label class="field c6"><span class="req">Nome completo</span><input name="nome" value="${esc(c.nome)}" required autofocus></label>
    <label class="field c6"><span>Empresa</span><input name="empresa" value="${esc(c.empresa)}"></label>
    <label class="field c4"><span>Telefone</span><input name="telefone" value="${esc(c.telefone)}" data-mask="tel" inputmode="tel"></label>
    <label class="field c4"><span class="req">WhatsApp</span><input name="whatsapp" value="${esc(c.whatsapp)}" data-mask="tel" inputmode="tel"></label>
    <label class="field c4"><span>E-mail</span><input name="email" type="email" value="${esc(c.email)}" inputmode="email"></label>
    <label class="field c3"><span>CEP</span><input name="cep" value="${esc(c.cep)}" data-mask="cep" inputmode="numeric" placeholder="Preenche o endereço"></label>
    <label class="field c9"><span>Endereço</span><input name="endereco" value="${esc(c.endereco)}"></label>
    <label class="field c6"><span>Bairro</span><input name="bairro" value="${esc(c.bairro)}"></label>
    <label class="field c6"><span>Cidade</span><input name="cidade" value="${esc(c.cidade)}" list="dlCidades"><datalist id="dlCidades">${cidades().map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
    <label class="field c6"><span>Tipo de cliente</span><select name="tipo">${opt(TIPOS_CLIENTE, c.tipo, 'Selecione')}</select></label>
    <label class="field c6"><span>Serviço de interesse</span><select name="servico">${opt(SERVICOS, c.servico, 'Selecione')}</select></label>
    <div class="form-section">Oportunidade</div>
    <label class="field c4"><span class="req">SDR responsável</span><select name="sdr" required>${opt(sdrOpts(), sdrDefault, isAdmin() ? 'Selecione' : undefined)}</select></label>
    <label class="field c4"><span>Data em que o cliente entrou</span><input type="datetime-local" name="entrada" value="${esc(c.entrada || nowLocal())}"></label>
    <label class="field c4"><span>Origem</span><select name="origem">${opt(ORIGENS, c.origem || 'WhatsApp')}</select></label>
    <label class="field c6"><span>Status</span><select name="status">${opt(mapOpts(ST_CLI), c.status || 'novo')}</select></label>
    <label class="field c12"><span>Observações</span><textarea name="obs" placeholder="Resumo da conversa no WhatsApp, melhor horário, o que o cliente quer proteger…">${esc(c.obs)}</textarea></label>
    <div class="c12 form-actions"><button type="button" class="btn" data-action="${back ? 'voltar' : 'fechar'}" data-id="${back}">Cancelar</button><button class="btn btn-primary">Salvar cliente</button></div>
  </form>`;
}

function formVisita(v = {}, back = '') {
  const cs = [...myClientes()].filter(c => !FINAL_CLI.includes(c.status) || c.id === v.clienteId).sort(byName);
  const tecnicos = [...new Set([...CONFIG.tecnicos, ...DB.all('visitas').map(x => x.tecnico).filter(Boolean)])];
  return `<form data-form="visita" class="form-grid">
    <input type="hidden" name="id" value="${v.id || ''}"><input type="hidden" name="_back" value="${back}">
    <label class="field c12"><span class="req">Cliente</span><select name="clienteId" required>${opt(cs.map(c => [c.id, `${c.nome}${c.empresa ? ' (' + c.empresa + ')' : ''} — ${c.sdr}`]), v.clienteId, 'Selecione o cliente')}</select></label>
    <label class="field c4"><span class="req">Data da visita</span><input type="date" name="data" value="${esc(v.data || '')}" required></label>
    <label class="field c4"><span class="req">Hora</span><input type="time" name="hora" value="${esc(v.hora || '')}" required></label>
    <label class="field c4"><span>Tipo de visita</span><select name="tipo">${opt(TIPOS_VISITA, v.tipo || TIPOS_VISITA[0])}</select></label>
    <label class="field c12"><span>Endereço da visita</span><input name="endereco" value="${esc(v.endereco || '')}"></label>
    <label class="field c6"><span>Técnico / responsável</span><input name="tecnico" value="${esc(v.tecnico || CONFIG.tecnicos[0] || '')}" list="dlTec"><datalist id="dlTec">${tecnicos.map(t => `<option value="${esc(t)}">`).join('')}</datalist></label>
    ${v.id ? `<label class="field c6"><span>Status</span><select name="status">${opt(mapOpts(ST_VIS), v.status)}</select></label>` : '<div class="c6"></div>'}
    <label class="field c12"><span>Observações</span><textarea name="obs" placeholder="Ponto de referência, contato no local, o que levar…">${esc(v.obs || '')}</textarea></label>
    <div class="c12 form-actions"><button type="button" class="btn" data-action="${back ? 'voltar' : 'fechar'}" data-id="${back}">Cancelar</button><button class="btn btn-primary">${v.id ? 'Salvar visita' : 'Agendar visita'}</button></div>
  </form>`;
}

const itemRow = (i = {}) => `<div class="item-row">
  <label class="field"><span>Descrição do serviço</span><input name="i_desc" value="${esc(i.desc || '')}" required></label>
  <label class="field"><span>Qtd</span><input name="i_qtd" type="number" min="0" step="any" value="${i.qtd ?? 1}"></label>
  <label class="field"><span>Valor unitário</span><input name="i_valor" type="number" min="0" step="0.01" value="${i.valor ?? ''}"></label>
  <div class="total">${money((+i.qtd || 0) * (+i.valor || 0))}</div>
  <button type="button" class="icon-btn" data-action="rmItem" aria-label="Remover item">✕</button></div>`;

function formOrcamento(o = {}, back = '') {
  const cs = [...myClientes()].sort(byName);
  const d = todayISO();
  const t = calcOrc(o);
  return `<form data-form="orcamento" class="form-grid">
    <input type="hidden" name="id" value="${o.id || ''}"><input type="hidden" name="_back" value="${back}">
    <label class="field c8"><span class="req">Cliente</span><select name="clienteId" required>${opt(cs.map(c => [c.id, `${c.nome}${c.empresa ? ' (' + c.empresa + ')' : ''}`]), o.clienteId, 'Selecione o cliente')}</select></label>
    <label class="field c4"><span>Número do orçamento</span><input name="numero" type="number" value="${o.numero || CONFIG.proxNumero}" required></label>
    <label class="field c4"><span>Data</span><input type="date" name="data" value="${o.data || d}" required></label>
    <label class="field c4"><span>Validade</span><input type="date" name="validade" value="${o.validade || toISODate(addDays(new Date(), CONFIG.validadeDias))}"></label>
    <label class="field c4"><span>Status</span><select name="status">${opt(mapOpts(ST_ORC), o.status || 'rascunho')}</select></label>
    <div class="form-section">Serviços</div>
    <div class="items" id="orcItems">${(o.itens?.length ? o.itens : [{}]).map(itemRow).join('')}</div>
    <div class="c12"><button type="button" class="btn btn-sm" data-action="addItem">+ Adicionar item</button></div>
    <label class="field c4"><span>Tipo de desconto</span><select name="descontoTipo">${opt([['valor', 'Valor (R$)'], ['pct', 'Percentual (%)']], o.descontoTipo || 'valor')}</select></label>
    <label class="field c4"><span>Desconto</span><input name="desconto" type="number" min="0" step="0.01" value="${o.desconto || 0}"></label>
    <div class="totals" id="orcTotals">${totalsHtml(t)}</div>
    <div class="form-section">Condições</div>
    <label class="field c6"><span>Condições de pagamento</span><input name="pagamento" value="${esc(o.pagamento ?? CONFIG.pagamentoPadrao)}"></label>
    <label class="field c6"><span>Prazo de execução</span><input name="prazo" value="${esc(o.prazo ?? '7 dias úteis após aprovação')}"></label>
    <label class="field c12"><span>Observações</span><textarea name="obs">${esc(o.obs || '')}</textarea></label>
    <div class="c12 form-actions">
      <button type="button" class="btn" data-action="${back ? 'voltar' : 'fechar'}" data-id="${back}">Cancelar</button>
      <button class="btn" value="preview">Visualizar orçamento</button>
      <button class="btn" value="pdf">Gerar PDF</button>
      <button class="btn btn-wa" value="share">Enviar / compartilhar</button>
      <button class="btn btn-primary" value="salvar">Salvar orçamento</button></div>
  </form>`;
}
const totalsHtml = t => `<div><span>Subtotal</span><b>${money(t.subtotal)}</b></div><div><span>Desconto</span><b>− ${money(t.desconto)}</b></div><div class="grand"><span>Total</span><span>${money(t.total)}</span></div>`;
function readOrcForm(form) {
  const d = formData(form);
  const itens = $$('.item-row', form).map(r => ({ desc: $('[name=i_desc]', r).value.trim(), qtd: +$('[name=i_qtd]', r).value || 0, valor: +$('[name=i_valor]', r).value || 0 })).filter(i => i.desc);
  ['i_desc', 'i_qtd', 'i_valor'].forEach(k => delete d[k]);
  return { ...d, numero: +d.numero, desconto: +d.desconto || 0, itens };
}
function recalcOrc(form) {
  const o = readOrcForm(form);
  $$('.item-row', form).forEach(r => { $('.total', r).textContent = money((+$('[name=i_qtd]', r).value || 0) * (+$('[name=i_valor]', r).value || 0)); });
  $('#orcTotals').innerHTML = totalsHtml(calcOrc(o));
}

function previewOrc(o) {
  const c = cliente(o.clienteId) || {}, E = CONFIG.empresa, t = calcOrc(o);
  return `<div class="preview-doc">
    <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:2px solid #0a8fd1;padding-bottom:12px">
      <img src="assets/logo-dark.png" alt="Vegas"><div style="text-align:right;font-size:12px;color:#5a6b86"><b style="color:#0c1b33">${esc(E.nome)}</b><br>${[E.cnpj && 'CNPJ ' + E.cnpj, E.endereco, E.cidade, E.telefone, E.email].filter(Boolean).map(esc).join('<br>')}</div></div>
    <h1 style="font-size:20px;margin:16px 0 2px">Orçamento nº ${numOrc(o.numero)}</h1><div style="color:#5a6b86">Emissão ${fmtDate(o.data)} | Validade ${fmtDate(o.validade)}</div>
    <h2>Dados do cliente</h2><div>${esc(c.nome)}${c.empresa ? ' | ' + esc(c.empresa) : ''}<br>${esc(c.whatsapp || c.telefone || '')} ${c.email ? '| ' + esc(c.email) : ''}<br>${esc([c.endereco, c.bairro, c.cidade].filter(Boolean).join(', '))}</div>
    <h2>Descrição dos serviços</h2><table><thead><tr><th>Descrição</th><th>Qtd</th><th>Unitário</th><th>Total</th></tr></thead><tbody>
      ${(o.itens || []).map(i => `<tr><td>${esc(i.desc)}</td><td>${i.qtd}</td><td>${money(i.valor)}</td><td>${money(i.qtd * i.valor)}</td></tr>`).join('')}</tbody></table>
    <div style="text-align:right">Subtotal ${money(t.subtotal)}<br>Desconto − ${money(t.desconto)}<br><b style="font-size:18px;color:#0a8fd1">Total ${money(t.total)}</b></div>
    <h2>Condições</h2><div>Pagamento: ${esc(o.pagamento || '—')}<br>Prazo de execução: ${esc(o.prazo || '—')}</div>
    ${o.obs ? `<h2>Observações</h2><div>${esc(o.obs)}</div>` : ''}</div>`;
}

const STEPS = [['entrada', 'Data de entrada'], ['contato', 'Contato'], ['visita_agendada', 'Visita agendada'], ['visita_realizada', 'Visita realizada'], ['orcamento_criado', 'Orçamento criado'], ['orcamento_enviado', 'Orçamento enviado'], ['negociacao', 'Negociação'], ['resultado', 'Resultado']];
function detalheCliente(c) {
  const h = c.historico || [];
  const vs = DB.all('visitas').filter(v => v.clienteId === c.id).sort((a, b) => dtVisita(b) - dtVisita(a));
  const os = DB.all('orcamentos').filter(o => o.clienteId === c.id).sort((a, b) => b.numero - a.numero);
  const tl = STEPS.map(([k, l]) => {
    const evs = h.filter(e => e.tipo === k); const e = k === 'resultado' ? evs[evs.length - 1] : evs[0];
    const cor = k === 'resultado' && e ? ST_CLI[c.status]?.c : '';
    return e ? `<li style="${cor ? '--tc:' + cor : ''}"><b>${l}</b><small>${fmtDateTime(e.data)} por ${esc(e.por || '—')}</small><div style="font-size:13px">${esc(e.texto)}</div></li>`
      : `<li class="pending"><b>${l}</b><small>pendente</small></li>`;
  }).join('');
  const tel = c.whatsapp || c.telefone;
  return `<div class="detail"><div class="grid" style="align-content:start">
    <div class="panel glass"><h3>${esc(c.nome)} ${badge(ST_CLI, c.status)}</h3>
      <dl class="kv"><dt>Empresa</dt><dd>${esc(c.empresa || '—')}</dd><dt>Telefone</dt><dd>${esc(c.telefone || '—')}</dd><dt>WhatsApp</dt><dd>${esc(c.whatsapp || '—')}</dd>
      <dt>E-mail</dt><dd>${esc(c.email || '—')}</dd><dt>Endereço</dt><dd>${esc([c.endereco, c.bairro, c.cidade, c.cep].filter(Boolean).join(', ') || '—')}</dd>
      <dt>Tipo</dt><dd>${esc(c.tipo || '—')}</dd><dt>Interesse</dt><dd>${esc(c.servico || '—')}</dd><dt>Observações</dt><dd>${esc(c.obs || '—')}</dd></dl>
      <div class="wa-bar">${digits(tel).length >= 10 ? `<a class="btn btn-wa" href="${waLink(tel)}" target="_blank" rel="noopener">Abrir WhatsApp</a>` : '<small style="color:var(--muted)">Cadastre o WhatsApp para enviar mensagens.</small>'}
        ${digits(tel).length >= 10 ? Object.entries(TPL_LABEL).map(([k, l]) => `<button class="btn btn-sm" data-action="wa" data-id="${c.id}" data-tpl="${k}">${l}</button>`).join('') : ''}</div></div>
    <div class="panel glass"><h3>Oportunidade</h3>
      <dl class="kv"><dt>SDR responsável</dt><dd>${sdrTag(c.sdr)}</dd><dt>Entrada</dt><dd>${fmtDateTime(c.entrada)}</dd><dt>Origem</dt><dd>${esc(c.origem || '—')}</dd></dl>
      <label class="field" style="margin-top:12px"><span>Mudar status</span><select data-status-cliente="${c.id}">${opt(mapOpts(ST_CLI), c.status)}</select></label></div>
    <div class="panel glass"><h3>Visitas <button class="btn btn-sm" data-action="novaVisita" data-id="${c.id}">+ Agendar</button></h3>
      ${vs.length ? `<div class="day-list" style="grid-template-columns:1fr">${vs.map(v => visitCard(v)).join('')}</div>` : '<small style="color:var(--muted)">Nenhuma visita.</small>'}</div>
    <div class="panel glass"><h3>Orçamentos <button class="btn btn-sm" data-action="novoOrcamento" data-id="${c.id}">+ Novo</button></h3>
      ${os.length ? os.map(o => `<div class="notif" data-action="verOrcamento" data-id="${o.id}" style="cursor:pointer"><div style="flex:1"><b>Nº ${numOrc(o.numero)}: ${money(o.total)}</b><small>${fmtDate(o.data)}, válido até ${fmtDate(o.validade)}</small></div>${badge(ST_ORC, o.status)}</div>`).join('') : '<small style="color:var(--muted)">Nenhum orçamento.</small>'}</div>
  </div>
  <div class="grid" style="align-content:start"><div class="panel glass"><h3>Histórico</h3><ul class="timeline">${tl}</ul></div>
    <div class="panel glass"><h3>Atividades</h3>${[...h].reverse().map(e => `<div class="notif"><div><b style="font-weight:500">${esc(e.texto)}</b><small>${fmtDateTime(e.data)} por ${esc(e.por || '—')}</small></div></div>`).join('') || '<small>Sem registros.</small>'}
      <form data-form="nota" data-id="${c.id}" style="display:flex;gap:8px;margin-top:10px"><input class="input" name="texto" placeholder="Registrar anotação (ex.: cliente pediu retorno sexta)" required><button class="btn">Registrar</button></form></div></div>
  </div>
  <div class="form-actions"><button class="btn" data-action="editCliente" data-id="${c.id}">Editar cliente</button>
    ${isAdmin() ? `<button class="btn btn-danger" data-action="delCliente" data-id="${c.id}">Excluir cliente</button>` : ''}</div>`;
}

/* ---------- 10. WHATSAPP ---------- */
function waLink(num, msg = '') {
  let d = digits(num);
  if (!(d.startsWith('55') && d.length >= 12)) d = '55' + d;
  return `https://wa.me/${d}${msg ? '?text=' + encodeURIComponent(msg) : ''}`;
}
function waCtx(cid, orcId) {
  const c = cliente(cid), v = proximaVisita(cid), o = orcId ? DB.get('orcamentos', orcId) : ultimoOrc(cid);
  return {
    nome: c.nome.split(' ')[0], sdr: c.sdr, empresa: CONFIG.empresa.nome,
    data: v ? fmtDate(v.data) : '[data]', hora: v?.hora || '[hora]',
    endereco: v?.endereco || [c.endereco, c.bairro, c.cidade].filter(Boolean).join(', ') || '[endereço]',
    numero: o ? numOrc(o.numero) : '[nº]', total: o ? money(o.total) : '[valor]'
  };
}
const fillTpl = (t, ctx) => t.replace(/\{(\w+)\}/g, (m, k) => ctx[k] ?? m);
function abrirWA(cid, tpl = 'obrigado', back = '', orcId = '', nota = '') {
  const c = cliente(cid); if (!c) return;
  ui.wa = { cid, tpl, orcId };
  const msg = fillTpl(CONFIG.templates[tpl] || '', waCtx(cid, orcId));
  openModal(`WhatsApp: ${c.nome}`, `
    <p style="margin-top:0;color:var(--muted)">Para ${esc(c.whatsapp || c.telefone)} ${nota ? `<br><b style="color:var(--warn)">${esc(nota)}</b>` : ''}</p>
    <div class="wa-bar" style="margin:0 0 12px">${Object.entries(TPL_LABEL).map(([k, l]) => `<button class="btn btn-sm ${k === tpl ? 'btn-primary' : ''}" data-action="waTpl" data-id="${k}">${l}</button>`).join('')}</div>
    <label class="field"><span>Mensagem (edite antes de enviar)</span><textarea id="waMsg" rows="6">${esc(msg)}</textarea></label>
    <div class="form-actions">${back ? `<button class="btn" data-action="voltar" data-id="${back}">Voltar</button>` : ''}<button class="btn btn-wa btn-primary" data-action="waOpen">Abrir WhatsApp</button></div>`, 'sm');
  ui.detailId = back || null;
}

/* ---------- 11. PDF / CSV ---------- */
const NAVY = [12, 27, 51], BLUE = [10, 143, 209], GREY = [90, 107, 134];
function newDoc(orient = 'p') {
  if (!window.jspdf?.jsPDF) { toast('Biblioteca de PDF não carregou. Confira a pasta assets/vendor.', 'err'); return null; }
  return new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: orient });
}
function pdfHeader(doc, titulo, sub) {
  const E = CONFIG.empresa, W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 3, 'F');
  doc.setFillColor(...BLUE); doc.rect(0, 3, W * .35, 1, 'F');
  if (window.LOGO_PDF) { const w = 55; doc.addImage(window.LOGO_PDF, 'PNG', 14, 10, w, w / window.LOGO_PDF_RATIO); }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY);
  doc.text(E.nome, W - 14, 13, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GREY);
  [E.cnpj && 'CNPJ: ' + E.cnpj, E.endereco, E.cidade, [E.telefone, E.email].filter(Boolean).join('  |  '), E.site]
    .filter(Boolean).slice(0, 4).forEach((l, i) => doc.text(l, W - 14, 18 + i * 4, { align: 'right' }));
  const y = 37;
  doc.setDrawColor(...BLUE); doc.setLineWidth(.6); doc.line(14, y, W - 14, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...NAVY); doc.text(titulo, 14, y + 10);
  if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GREY); doc.text(sub, 14, y + 16); }
  return y + (sub ? 23 : 17);
}
function pdfFooter(doc) {
  const n = doc.getNumberOfPages(), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const quando = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setDrawColor(215, 225, 238); doc.setLineWidth(.2); doc.line(14, H - 12, W - 14, H - 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GREY);
    doc.text('Vegas Vigilância e Segurança | SDR Control', 14, H - 7);
    doc.text(`Gerado em ${quando} | Página ${i} de ${n}`, W - 14, H - 7, { align: 'right' });
  }
}
function ensureSpace(doc, y, need) {
  if (y + need > doc.internal.pageSize.getHeight() - 18) { doc.addPage(); return 18; }
  return y;
}
function pdfSection(doc, y, title) {
  y = ensureSpace(doc, y, 16);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...BLUE); doc.text(title.toUpperCase(), 14, y);
  doc.setDrawColor(215, 225, 238); doc.setLineWidth(.2); doc.line(14, y + 1.8, doc.internal.pageSize.getWidth() - 14, y + 1.8);
  return y + 6;
}
function pdfText(doc, y, text, size = 9.5) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(...NAVY);
  const lines = doc.splitTextToSize(text, doc.internal.pageSize.getWidth() - 28);
  lines.forEach(l => { y = ensureSpace(doc, y, 5); doc.text(l, 14, y); y += size * .45; });
  return y + 2;
}
function pdfStats(doc, y, items, cols = 3) {
  const W = doc.internal.pageSize.getWidth(), gap = 4, bw = (W - 28 - gap * (cols - 1)) / cols, bh = 17;
  items.forEach(([l, v], i) => {
    const x = 14 + (i % cols) * (bw + gap), yy = y + Math.floor(i / cols) * (bh + gap);
    doc.setFillColor(243, 247, 252); doc.setDrawColor(215, 225, 238); doc.roundedRect(x, yy, bw, bh, 2, 2, 'FD');
    doc.setFillColor(...BLUE); doc.rect(x, yy + 3, 1.2, bh - 6, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GREY); doc.text(l, x + 5, yy + 6.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...NAVY); doc.text(String(v), x + 5, yy + 13.5);
  });
  return y + Math.ceil(items.length / cols) * (bh + gap) + 3;
}
const tableBase = { theme: 'grid', styles: { fontSize: 8.5, cellPadding: 2.2, textColor: NAVY, lineColor: [215, 225, 238], lineWidth: .2 },
  headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' }, footStyles: { fillColor: [230, 240, 250], textColor: NAVY, fontStyle: 'bold' },
  alternateRowStyles: { fillColor: [247, 250, 253] }, margin: { left: 14, right: 14, bottom: 18 } };

function gerarPDF(o) {
  const doc = newDoc(); if (!doc) return null;
  const c = cliente(o.clienteId) || {}, E = CONFIG.empresa, t = calcOrc(o), W = 210;
  let y = pdfHeader(doc, `ORÇAMENTO Nº ${numOrc(o.numero)}`, `Emissão: ${fmtDate(o.data)}   |   Validade: ${fmtDate(o.validade)}`);
  y = pdfSection(doc, y, 'Dados do cliente');
  const lbl = { fontStyle: 'bold', textColor: GREY, cellWidth: 22 };
  doc.autoTable({ ...tableBase, theme: 'plain', startY: y, styles: { ...tableBase.styles, cellPadding: 1.4, fontSize: 9 },
    columnStyles: { 0: lbl, 2: lbl },
    body: [['Cliente', c.nome || '—', 'Empresa', c.empresa || '—'], ['Telefone', c.telefone || '—', 'WhatsApp', c.whatsapp || '—'],
      ['E-mail', c.email || '—', 'CEP', c.cep || '—'], ['Endereço', { content: [c.endereco, c.bairro, c.cidade].filter(Boolean).join(', ') || '—', colSpan: 3 }]] });
  y = pdfSection(doc, doc.lastAutoTable.finalY + 6, 'Descrição dos serviços');
  doc.autoTable({ ...tableBase, startY: y,
    head: [['#', 'Descrição', 'Qtd', 'Valor unitário', 'Total']],
    body: (o.itens || []).map((i, n) => [n + 1, i.desc, String(i.qtd).replace('.', ','), money(i.valor), money(i.qtd * i.valor)]),
    columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 2: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 30, halign: 'right' }, 4: { cellWidth: 32, halign: 'right' } } });
  y = ensureSpace(doc, doc.lastAutoTable.finalY + 4, 30);
  const xr = W - 14, xl = W - 84;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...GREY);
  doc.text('Subtotal', xl, y + 4); doc.text(money(t.subtotal), xr, y + 4, { align: 'right' });
  doc.text(`Desconto${o.descontoTipo === 'pct' ? ` (${String(o.desconto).replace('.', ',')}%)` : ''}`, xl, y + 10); doc.text('- ' + money(t.desconto), xr, y + 10, { align: 'right' });
  doc.setFillColor(...NAVY); doc.roundedRect(xl - 4, y + 13, 74, 11, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255);
  doc.text('TOTAL', xl, y + 20.3); doc.text(money(t.total), xr - 2, y + 20.3, { align: 'right' });
  y = pdfSection(doc, y + 32, 'Condições');
  y = pdfText(doc, y, `Pagamento: ${o.pagamento || '—'}`);
  y = pdfText(doc, y, `Prazo de execução: ${o.prazo || '—'}`);
  y = pdfText(doc, y, `Validade da proposta: até ${fmtDate(o.validade)}`);
  if (o.obs) { y = pdfSection(doc, y + 3, 'Observações'); y = pdfText(doc, y, o.obs); }
  y = ensureSpace(doc, y + 8, 42);
  const dataExt = new Date(`${o.data}T12:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  y = pdfText(doc, y, `${E.cidade.split('-')[0].trim() || 'Volta Redonda'}, ${dataExt}.`);
  y += 20;
  doc.setDrawColor(...GREY); doc.setLineWidth(.3);
  doc.line(14, y, 92, y); doc.line(118, y, 196, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GREY);
  doc.text(E.nome, 53, y + 5, { align: 'center' }); doc.text(`${c.nome || 'Cliente'} (de acordo)`, 157, y + 5, { align: 'center' });
  pdfFooter(doc);
  return doc;
}
const nomeArqOrc = o => `Orcamento-${numOrc(o.numero)}-${slug(cliente(o.clienteId)?.nome || 'cliente')}.pdf`;

function periodoOk(de, ate) {
  if (!de || !ate) { toast('Informe data inicial e final.', 'err'); return false; }
  if (de > ate) { toast('A data inicial é depois da final.', 'err'); return false; }
  return true;
}
function gerarRelatorioSDR(sdr, de, ate) {
  if (!isAdmin()) sdr = ME.sdr;
  if (!periodoOk(de, ate)) return;
  const doc = newDoc(); if (!doc) return;
  const st = stats(sdr, de, ate);
  let y = pdfHeader(doc, 'RELATÓRIO DE VISITAS', `SDR: ${sdr ? sdr.toUpperCase() : 'TODAS'}   |   Período: ${fmtDate(de)} até ${fmtDate(ate)}`);
  y = pdfStats(doc, y, [['Total de clientes', st.clientes], ['Visitas realizadas', st.realizadas], ['Visitas canceladas', st.canceladas],
    ['Visitas pendentes', st.pendentes], ['Orçamentos realizados', st.orcamentos], ['Clientes fechados', st.fechados]]);
  const vs = [...st.vs].sort((a, b) => dtVisita(a) - dtVisita(b));
  const head = ['Data', 'Hora', 'Cliente', 'Cidade', ...(sdr ? [] : ['SDR']), 'Status', 'Orçamento'];
  doc.autoTable({ ...tableBase, startY: y, head: [head],
    body: vs.length ? vs.map(v => { const c = cliente(v.clienteId) || {}; const o = ultimoOrc(v.clienteId);
      return [fmtDate(v.data).slice(0, 5), v.hora, c.nome || '—', c.cidade || '—', ...(sdr ? [] : [c.sdr]), ST_VIS[v.status].l, o ? money(o.total) : '—']; })
      : [[{ content: 'Nenhuma visita no período.', colSpan: head.length, styles: { halign: 'center', textColor: GREY } }]],
    columnStyles: { [head.length - 1]: { halign: 'right' } } });
  y = ensureSpace(doc, doc.lastAutoTable.finalY + 8, 24);
  doc.setFillColor(243, 247, 252); doc.roundedRect(14, y, 182, 18, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...NAVY);
  doc.text(`TOTAL DE VISITAS: ${st.visitas}  (realizadas: ${st.realizadas})`, 19, y + 7.5);
  doc.text(`TOTAL EM ORÇAMENTOS: ${money(st.valorOrcado)}`, 19, y + 13.5);
  if (!sdr) {
    y = pdfSection(doc, y + 28, 'Resumo por SDR');
    doc.autoTable({ ...tableBase, startY: y, head: [['SDR', 'Clientes', 'Visitas realizadas', 'Orçamentos', 'Valor orçado', 'Fechados']],
      body: CONFIG.sdrs.map(s => { const x = stats(s.nome, de, ate); return [s.nome, x.clientes, x.realizadas, x.orcamentos, money(x.valorOrcado), x.fechados]; }) });
  }
  pdfFooter(doc);
  doc.save(`Relatorio-Visitas-${slug(sdr || 'todas')}-${de}_${ate}.pdf`);
  toast('PDF criado com sucesso.');
}
function gerarRelatorioGeral(de, ate) {
  if (!periodoOk(de, ate)) return;
  const doc = newDoc(); if (!doc) return;
  const lista = sdrs().map(s => ({ s, ...stats(s.nome, de, ate) }));
  const T = k => lista.reduce((s, r) => s + r[k], 0);
  let y = pdfHeader(doc, 'RELATÓRIO GERAL', `Período: ${fmtDate(de)} até ${fmtDate(ate)}`);
  y = pdfStats(doc, y, [['Total de clientes', T('clientes')], ['Total de visitas', T('visitas')], ['Total de orçamentos', T('orcamentos')],
    ['Valor total orçado', money(T('valorOrcado'))], ['Clientes fechados', T('fechados')], ['Valor fechado', money(T('valorFechado'))]]);
  doc.autoTable({ ...tableBase, startY: y,
    head: [['SDR', 'Clientes', 'Visitas', 'Realizadas', 'Orçamentos', 'Valor orçado', 'Fechados', 'Conversão']],
    body: lista.map(r => [r.s.nome, r.clientes, r.visitas, r.realizadas, r.orcamentos, money(r.valorOrcado), r.fechados, pct(r.fechados, r.clientes) + '%']),
    foot: [['TOTAL GERAL', T('clientes'), T('visitas'), T('realizadas'), T('orcamentos'), money(T('valorOrcado')), T('fechados'), pct(T('fechados'), T('clientes')) + '%']],
    columnStyles: { 5: { halign: 'right' } } });
  y = doc.lastAutoTable.finalY + 8;
  lista.forEach(r => {
    y = pdfSection(doc, y, r.s.nome);
    y = pdfText(doc, y, `Total de clientes: ${r.clientes}   |   Total de visitas: ${r.visitas}   |   Total de orçamentos: ${r.orcamentos}   |   Valor total orçado: ${money(r.valorOrcado)}   |   Clientes fechados: ${r.fechados}`, 9);
    y += 2;
  });
  pdfFooter(doc);
  doc.save(`Relatorio-Geral-${de}_${ate}.pdf`);
  toast('PDF criado com sucesso.');
}

const EXPORTS = {
  clientes: {
    titulo: 'CLIENTES',
    rows: () => [...myClientes()].sort((a, b) => b.entrada.localeCompare(a.entrada)),
    csv: [['Nome', 'nome'], ['Empresa', 'empresa'], ['Telefone', 'telefone'], ['WhatsApp', 'whatsapp'], ['E-mail', 'email'], ['Endereço', 'endereco'], ['Bairro', 'bairro'], ['Cidade', 'cidade'], ['CEP', 'cep'], ['Tipo', 'tipo'], ['Serviço', 'servico'], ['SDR', 'sdr'], ['Origem', 'origem'], ['Status', c => ST_CLI[c.status]?.l], ['Entrada', c => fmtDateTime(c.entrada)], ['Observações', 'obs']],
    pdf: [['Nome', 'nome'], ['Empresa', 'empresa'], ['WhatsApp', c => c.whatsapp || c.telefone], ['Cidade', 'cidade'], ['Serviço', 'servico'], ['SDR', 'sdr'], ['Status', c => ST_CLI[c.status]?.l], ['Entrada', c => fmtDateTime(c.entrada)]]
  },
  visitas: {
    titulo: 'VISITAS',
    rows: () => [...myVisitas()].sort((a, b) => dtVisita(a) - dtVisita(b)),
    csv: [['Data', v => fmtDate(v.data)], ['Hora', 'hora'], ['Cliente', v => cliente(v.clienteId)?.nome], ['Cidade', v => cliente(v.clienteId)?.cidade], ['SDR', v => sdrDoCliente(v.clienteId)], ['Endereço', 'endereco'], ['Técnico', 'tecnico'], ['Tipo', 'tipo'], ['Status', v => ST_VIS[v.status]?.l], ['Observações', 'obs']],
    pdf: [['Data', v => fmtDate(v.data)], ['Hora', 'hora'], ['Cliente', v => cliente(v.clienteId)?.nome], ['Cidade', v => cliente(v.clienteId)?.cidade], ['SDR', v => sdrDoCliente(v.clienteId)], ['Técnico', 'tecnico'], ['Tipo', 'tipo'], ['Status', v => ST_VIS[v.status]?.l]]
  },
  orcamentos: {
    titulo: 'ORÇAMENTOS',
    rows: () => [...myOrcs()].sort((a, b) => a.numero - b.numero),
    csv: [['Número', o => numOrc(o.numero)], ['Data', o => fmtDate(o.data)], ['Validade', o => fmtDate(o.validade)], ['Cliente', o => cliente(o.clienteId)?.nome], ['SDR', o => sdrDoCliente(o.clienteId)], ['Subtotal', o => o.subtotal.toFixed(2).replace('.', ',')], ['Desconto', o => o.desconto.toFixed(2).replace('.', ',')], ['Total', o => o.total.toFixed(2).replace('.', ',')], ['Status', o => ST_ORC[o.status]?.l], ['Pagamento', 'pagamento'], ['Prazo', 'prazo']],
    pdf: [['Nº', o => numOrc(o.numero)], ['Data', o => fmtDate(o.data)], ['Validade', o => fmtDate(o.validade)], ['Cliente', o => cliente(o.clienteId)?.nome], ['SDR', o => sdrDoCliente(o.clienteId)], ['Status', o => ST_ORC[o.status]?.l], ['Total', o => money(o.total)]]
  }
};
const cell = (row, k) => (typeof k === 'function' ? k(row) : row[k]) ?? '';
function exportCSV(col) {
  const X = EXPORTS[col], rows = X.rows();
  const lines = [X.csv.map(c => c[0]), ...rows.map(r => X.csv.map(c => cell(r, c[1])))];
  const csv = '\ufeff' + lines.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${col}-${todayISO()}.csv`);
  toast(`CSV de ${col} exportado (${rows.length} registro(s)).`);
}
function exportPDF(col) {
  const X = EXPORTS[col], rows = X.rows();
  const doc = newDoc('l'); if (!doc) return;
  const y = pdfHeader(doc, `RELAÇÃO DE ${X.titulo}`, `${rows.length} registro(s)`);
  doc.autoTable({ ...tableBase, startY: y, head: [X.pdf.map(c => c[0])], body: rows.map(r => X.pdf.map(c => String(cell(r, c[1])))) });
  pdfFooter(doc);
  doc.save(`${col}-${todayISO()}.pdf`);
  toast('PDF criado com sucesso.');
}

/* ---------- 12. NOTIFICAÇÕES ---------- */
function pushEvento(texto) {
  DB.insert('notificacoes', { texto, data: nowLocal(), lidaPor: [ME?.id].filter(Boolean) });
  const all = DB.all('notificacoes'); if (all.length > 60) DB.replace('notificacoes', all.slice(-60));
}
function alertas() {
  const now = new Date(), hoje = todayISO(), arr = [];
  const abertas = myVisitas().filter(v => ['agendada', 'reagendada'].includes(v.status));
  const vh = abertas.filter(v => v.data === hoje);
  if (vh.length) arr.push({ i: '📅', t: `Você possui ${vh.length} visita(s) hoje.`, go: 'agenda' });
  vh.forEach(v => { const m = (dtVisita(v) - now) / 6e4; if (m > 0 && m <= 60) arr.push({ i: '⏰', t: `Visita de ${cliente(v.clienteId)?.nome} em ${Math.round(m)} min.`, id: v.id, alert: true }); });
  const atras = abertas.filter(v => v.data < hoje);
  if (atras.length) arr.push({ i: '⚠️', t: `${atras.length} visita(s) passadas sem baixa.`, s: 'Marque como realizada ou cancelada.', go: 'visitas', alert: true });
  const pend = myOrcs().filter(o => o.status === 'rascunho');
  if (pend.length) arr.push({ i: '💰', t: `Existem ${pend.length} orçamento(s) aguardando envio.`, go: 'orcamentos', preset: { status: 'rascunho' } });
  const parados = myClientes().filter(c => c.status === 'novo' && now - new Date(c.entrada) > 4 * 3600e3);
  if (parados.length) arr.push({ i: '👥', t: `${parados.length} cliente(s) novo(s) há mais de 4h sem contato.`, go: 'clientes', preset: { status: 'novo' }, alert: true });
  return arr;
}
const eventosNaoLidos = () => isAdmin() ? DB.all('notificacoes').filter(n => !(n.lidaPor || []).includes(ME.id)) : [];
function updateNotifBadge() {
  const n = alertas().length + eventosNaoLidos().length;
  const b = $('#notifCount'); b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
}
function renderNotifs() {
  const al = alertas(), ev = isAdmin() ? [...DB.all('notificacoes')].reverse().slice(0, 15) : [];
  $('#notifPanel').innerHTML = `<h3>Notificações ${ev.length ? '<button class="btn btn-sm" data-action="marcarLidas">Marcar como lidas</button>' : ''}</h3>
    ${al.map((a, k) => `<div class="notif ${a.alert ? 'alert' : ''}" data-action="notifGo" data-id="${k}" style="cursor:pointer"><span>🔔</span><div>${a.i} ${esc(a.t)}${a.s ? `<small>${esc(a.s)}</small>` : ''}</div></div>`).join('')}
    ${ev.map(e => `<div class="notif" style="${(e.lidaPor || []).includes(ME.id) ? 'opacity:.6' : ''}"><span>🔔</span><div>${esc(e.texto)}<small>${fmtDateTime(e.data)}</small></div></div>`).join('')}
    ${!al.length && !ev.length ? '<div class="empty-state">Tudo em dia.</div>' : ''}`;
}
function lembretes() {
  const now = new Date();
  myVisitas().filter(v => v.data === todayISO() && ['agendada', 'reagendada'].includes(v.status)).forEach(v => {
    const m = (dtVisita(v) - now) / 6e4;
    if (m > 0 && m <= 60 && !ui.avisados.has(v.id)) {
      ui.avisados.add(v.id);
      const txt = `Visita de ${cliente(v.clienteId)?.nome} em ${Math.round(m)} minutos.`;
      toast(txt, 'info');
      if ('Notification' in window && Notification.permission === 'granted') new Notification('SDR Control', { body: txt, icon: 'assets/icons/icon-192.png' });
    }
  });
  updateNotifBadge();
}

/* ---------- AÇÕES (delegadas por data-action) ---------- */
const Actions = {
  fechar: () => closeModal(),
  voltar: id => backOrClose(id),
  goto(_, el) {
    const [view, preset, mode] = JSON.parse(el.dataset.go);
    if (preset) ui.filters[view] = preset;
    if (mode) ui.cal = { ...ui.cal, mode, date: new Date() };
    location.hash === '#/' + view ? render() : go(view);
  },
  clearFilters() { ui.filters[ui.view] = {}; refresh(); },

  novoCliente: (_, el) => openModal('Novo cliente', formCliente({}, backFrom(el))),
  editCliente(id, el) { const b = backFrom(el); openModal('Editar cliente', formCliente(cliente(id), b)); },
  verCliente(id) {
    const c = cliente(id); if (!c) return;
    openModal('Detalhes do cliente', detalheCliente(c)); ui.detailId = id;
  },
  async delCliente(id) {
    const c = cliente(id);
    const nv = DB.all('visitas').filter(v => v.clienteId === id).length, no = DB.all('orcamentos').filter(o => o.clienteId === id).length;
    if (!await confirmar(`Excluir ${c.nome}? ${nv || no ? `Também serão excluídos ${nv} visita(s) e ${no} orçamento(s).` : ''} Essa ação não pode ser desfeita.`)) return;
    excluirCliente(id); closeModal(); refresh(); toast('Cliente excluído.');
  },

  novaVisita(id, el) {
    const b = backFrom(el);
    openModal('Agendar visita', formVisita({ clienteId: id || '', data: el?.dataset.date || '', endereco: id ? enderecoCliente(id) : '' }, b));
  },
  editVisita(id, el) { const b = backFrom(el); openModal('Editar / reagendar visita', formVisita(DB.get('visitas', id), b)); },
  verVisita(id) {
    const v = DB.get('visitas', id); if (!v) return;
    const c = cliente(v.clienteId) || {};
    const aberta = ['agendada', 'reagendada'].includes(v.status);
    openModal('Visita', `${visitCard(v, false)}
      <dl class="kv" style="margin-top:14px"><dt>Tipo</dt><dd>${esc(v.tipo || '—')}</dd><dt>Endereço</dt><dd>${esc(v.endereco || '—')}</dd><dt>Observações</dt><dd>${esc(v.obs || '—')}</dd></dl>
      <div class="form-actions" style="justify-content:flex-start">
        ${aberta ? `<button class="btn btn-ok" data-action="visitaRealizada" data-id="${v.id}">✓ Marcar como realizada</button>
        <button class="btn" data-action="editVisita" data-id="${v.id}">Editar / reagendar</button>
        <button class="btn btn-danger" data-action="cancelarVisita" data-id="${v.id}">Cancelar visita</button>` : `<button class="btn" data-action="editVisita" data-id="${v.id}">Editar</button>`}
        <button class="btn btn-wa" data-action="wa" data-id="${c.id}" data-tpl="${aberta ? 'confirmar' : 'obrigado'}">WhatsApp</button>
        <button class="btn" data-action="verCliente" data-id="${c.id}">Abrir cliente</button>
        ${v.status === 'realizada' ? `<button class="btn btn-primary" data-action="novoOrcamento" data-id="${c.id}">+ Orçamento</button>` : ''}
        ${isAdmin() ? `<button class="btn btn-danger" data-action="delVisita" data-id="${v.id}">Excluir</button>` : ''}
      </div>`, 'sm');
  },
  visitaRealizada(id, el) {
    const v = DB.get('visitas', id); marcarVisitaStatus(v, 'realizada');
    toast('Visita marcada como realizada.'); afterChange(el);
  },
  async cancelarVisita(id, el) {
    if (!await confirmar('Cancelar esta visita?', 'Cancelar visita')) return;
    marcarVisitaStatus(DB.get('visitas', id), 'cancelada'); toast('Visita cancelada.', 'info'); afterChange(el);
  },
  async delVisita(id) {
    if (!await confirmar('Excluir esta visita definitivamente?')) return;
    DB.remove('visitas', id); closeModal(); refresh(); toast('Visita excluída.');
  },

  novoOrcamento(id, el) { const b = backFrom(el); openModal('Novo orçamento', formOrcamento({ clienteId: id || '' }, b)); },
  editOrcamento(id, el) { const b = backFrom(el); openModal(`Editar orçamento nº ${numOrc(DB.get('orcamentos', id).numero)}`, formOrcamento(DB.get('orcamentos', id), b)); },
  verOrcamento(id) {
    const o = DB.get('orcamentos', id); if (!o) return;
    openModal(`Orçamento nº ${numOrc(o.numero)}`, previewOrc(o) + `
      <div class="form-actions"><label class="field" style="margin-right:auto;min-width:180px"><span>Status</span><select data-status-orc="${o.id}">${opt(mapOpts(ST_ORC), o.status)}</select></label>
        <button class="btn" data-action="editOrcamento" data-id="${o.id}">Editar</button>
        <button class="btn" data-action="pdfOrcamento" data-id="${o.id}">Gerar PDF</button>
        <button class="btn btn-wa btn-primary" data-action="shareOrcamento" data-id="${o.id}">Enviar / compartilhar</button></div>`);
  },
  pdfOrcamento(id) { const o = DB.get('orcamentos', id); const doc = gerarPDF(o); if (doc) { doc.save(nomeArqOrc(o)); toast('PDF criado com sucesso.'); } },
  async shareOrcamento(id) {
    const o = DB.get('orcamentos', id), c = cliente(o.clienteId);
    const doc = gerarPDF(o); if (!doc) return;
    const blob = doc.output('blob'), name = nomeArqOrc(o);
    const file = new File([blob], name, { type: 'application/pdf' });
    const msg = fillTpl(CONFIG.templates.orcamento, waCtx(o.clienteId, o.id));
    const marcar = () => { if (o.status === 'rascunho') { editarOrcamento(o.id, { ...o, status: 'enviado' }); refresh(); } };
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `Orçamento ${numOrc(o.numero)}`, text: msg }); marcar(); toast('Orçamento compartilhado.'); }
      catch (e) { if (e.name !== 'AbortError') toast('Não foi possível compartilhar. Use Gerar PDF.', 'err'); }
      return;
    }
    downloadBlob(blob, name); marcar();
    abrirWA(c.id, 'orcamento', '', o.id, `PDF baixado (${name}). Anexe o arquivo na conversa depois de abrir o WhatsApp.`);
  },
  async delOrcamento(id) {
    if (!await confirmar(`Excluir o orçamento nº ${numOrc(DB.get('orcamentos', id).numero)}?`)) return;
    DB.remove('orcamentos', id); closeModal(); refresh(); toast('Orçamento excluído.');
  },
  addItem() { $('#orcItems').insertAdjacentHTML('beforeend', itemRow()); $('#orcItems .item-row:last-child input').focus(); },
  rmItem(_, el) { const rows = $$('#orcItems .item-row'); if (rows.length > 1) { el.closest('.item-row').remove(); recalcOrc($('form[data-form=orcamento]')); } },

  wa(id, el) { abrirWA(id, el.dataset.tpl || 'obrigado', backFrom(el)); },
  waTpl(k) {
    ui.wa.tpl = k;
    $('#waMsg').value = fillTpl(CONFIG.templates[k], waCtx(ui.wa.cid, ui.wa.orcId));
    $$('[data-action=waTpl]').forEach(b => b.classList.toggle('btn-primary', b.dataset.id === k));
  },
  waOpen() {
    const c = cliente(ui.wa.cid), msg = $('#waMsg').value.trim();
    window.open(waLink(c.whatsapp || c.telefone, msg), '_blank', 'noopener');
    logHist(c.id, c.status === 'novo' ? 'contato' : 'mensagem', `WhatsApp enviado: ${TPL_LABEL[ui.wa.tpl]}`);
    avancarStatus(c.id, 'contato');
    refresh(); backOrClose(ui.detailId);
  },

  calNav(dir) {
    const d = new Date(ui.cal.date), n = +dir, m = ui.cal.mode;
    if (m === 'month') d.setMonth(d.getMonth() + n, 1); else d.setDate(d.getDate() + (m === 'week' ? 7 : 1) * n);
    ui.cal.date = d; refresh();
  },
  calToday() { ui.cal.date = new Date(); refresh(); },
  calMode(m) { ui.cal.mode = m; refresh(); },
  calDay(iso) { ui.cal.date = parseDate(iso); ui.cal.mode = 'day'; refresh(); },

  selSdr(nome) { ui.sdrSel = ui.sdrSel === nome && ui.view === 'sdrs' ? '' : nome; ui.view === 'sdrs' ? refresh() : go('sdrs'); },
  relatorio: () => go('relatorios'),
  relVisitasFiltro() { const f = F('visitas'); gerarRelatorioSDR(f.sdr || '', f.de, f.ate); },
  pdfRelSDR() { gerarRelatorioSDR($('#relSdr').value, $('#relDe').value, $('#relAte').value); },
  pdfRelGeral() { gerarRelatorioGeral($('#relGDe').value, $('#relGAte').value); },
  exportCSV: col => exportCSV(col),
  exportPDF: col => exportPDF(col),

  notifGo(k) {
    const a = alertas()[+k]; $('#notifPanel').hidden = true; if (!a) return;
    if (a.id) return Actions.verVisita(a.id);
    if (a.preset) ui.filters[a.go] = a.preset;
    if (a.go === 'agenda') ui.cal = { ...ui.cal, mode: 'day', date: new Date() };
    location.hash === '#/' + a.go ? render() : go(a.go);
  },
  marcarLidas() {
    DB.all('notificacoes').forEach(n => { if (!(n.lidaPor || []).includes(ME.id)) DB.update('notificacoes', n.id, { lidaPor: [...(n.lidaPor || []), ME.id] }); });
    renderNotifs(); updateNotifBadge();
  },

  backup() {
    const data = { app: 'sdr-control', versao: 1, exportadoEm: nowLocal(), config: CONFIG, ...Object.fromEntries(COLLECTIONS.map(c => [c, DB.all(c)])) };
    downloadBlob(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `backup-sdr-control-${todayISO()}.json`);
    toast('Backup baixado.');
  },
  async removerDemo() {
    if (!await confirmar('Remover todos os clientes, visitas e orçamentos DEMO?', 'Remover')) return;
    removerDemo(); refresh(); toast('Dados DEMO removidos.');
  },
  async restaurarDemo() {
    if (!await confirmar('Adicionar os dados DEMO novamente? Seus dados reais continuam.', 'Carregar')) return;
    removerDemo(); seedDemo(); refresh(); toast('Dados DEMO carregados.');
  },
  async resetAll() {
    if (!await confirmar('Apagar TODOS os clientes, visitas e orçamentos deste navegador? Faça backup antes.', 'Apagar tudo')) return;
    ['clientes', 'visitas', 'orcamentos', 'notificacoes'].forEach(c => DB.replace(c, []));
    CONFIG.proxNumero = 1; saveConfig(); refresh(); toast('Dados apagados.', 'info');
  },
  resetSenha(id) {
    const u = DB.get('usuarios', id);
    openModal(`Nova senha: ${u.nome}`, `<form data-form="resetSenha" data-id="${id}" class="form-grid"><label class="field c12"><span>Nova senha</span><input type="password" name="nova" minlength="6" required autofocus></label>
      <div class="c12 form-actions"><button type="button" class="btn" data-action="fechar">Cancelar</button><button class="btn btn-primary">Salvar</button></div></form>`, 'sm');
  },
  async delUser(id) {
    if (!await confirmar(`Excluir o usuário ${DB.get('usuarios', id).nome}?`)) return;
    DB.remove('usuarios', id); refresh(); toast('Usuário excluído.');
  }
};

const enderecoCliente = id => { const c = cliente(id); return c ? [c.endereco, c.bairro, c.cidade].filter(Boolean).join(', ') : ''; };
function afterChange(el) {
  refresh();
  if (el?.closest('#modal')) ui.detailId ? Actions.verCliente(ui.detailId) : closeModal();
}

/* ---------- SUBMITS ---------- */
const Forms = {
  async cliente(form) {
    const d = formData(form); const { id, _back } = d; delete d.id; delete d._back;
    d.nome = d.nome.trim();
    if (!d.nome) return toast('Informe o nome do cliente.', 'err');
    if (!d.sdr) return toast('Selecione a SDR responsável.', 'err');
    if (digits(d.whatsapp || d.telefone).length < 10) return toast('Informe WhatsApp ou telefone com DDD.', 'err');
    const w = digits(d.whatsapp || d.telefone);
    const dup = DB.all('clientes').find(x => x.id !== id && (digits(x.whatsapp) === w || digits(x.telefone) === w));
    if (dup && !await confirmar(`${dup.nome} já está cadastrado com esse número (SDR ${dup.sdr}). Salvar mesmo assim?`, 'Salvar mesmo assim')) return;
    if (id) { editarCliente(id, d); toast('Cliente atualizado com sucesso.'); refresh(); return Actions.verCliente(id); }
    const c = salvarCliente(d);
    toast('Cliente cadastrado com sucesso.'); refresh(); Actions.verCliente(c.id);
  },
  visita(form) {
    const d = formData(form); const { id, _back } = d; delete d.id; delete d._back;
    if (!d.clienteId || !d.data || !d.hora) return toast('Preencha cliente, data e hora.', 'err');
    const choque = DB.all('visitas').find(v => v.id !== id && v.data === d.data && v.hora === d.hora && v.tecnico === d.tecnico && v.status !== 'cancelada');
    if (choque) toast(`Atenção: ${d.tecnico} já tem visita nesse horário (${cliente(choque.clienteId)?.nome}).`, 'info');
    if (id) { editarVisita(id, d); toast('Visita atualizada com sucesso.'); }
    else { salvarVisita(d); toast('Visita agendada com sucesso.'); }
    refresh(); backOrClose(_back);
  },
  orcamento(form, submitter) {
    const d = readOrcForm(form); const { id, _back } = d; delete d.id; delete d._back;
    if (!d.clienteId) return toast('Selecione o cliente.', 'err');
    if (!d.itens.length) return toast('Adicione ao menos um item com descrição.', 'err');
    const dupNum = DB.all('orcamentos').find(o => o.numero === d.numero && o.id !== id);
    if (dupNum) return toast(`Já existe o orçamento nº ${numOrc(d.numero)}. Use outro número.`, 'err');
    const o = id ? editarOrcamento(id, d) : salvarOrcamento(d);
    toast(id ? 'Orçamento atualizado com sucesso.' : 'Orçamento gerado com sucesso.');
    refresh();
    const act = submitter?.value;
    if (act === 'preview') return Actions.verOrcamento(o.id);
    if (act === 'pdf') { Actions.pdfOrcamento(o.id); return Actions.verOrcamento(o.id); }
    if (act === 'share') { return Actions.shareOrcamento(o.id); }
    backOrClose(_back);
  },
  nota(form) {
    const t = form.texto.value.trim(); if (!t) return;
    logHist(form.dataset.id, 'nota', t); Actions.verCliente(form.dataset.id); toast('Anotação registrada.');
  },
  empresa(form) {
    const d = formData(form);
    CONFIG.validadeDias = +d.validadeDias || 15; CONFIG.proxNumero = +d.proxNumero || 1; CONFIG.pagamentoPadrao = d.pagamentoPadrao;
    CONFIG.tecnicos = d.tecnicos.split(',').map(s => s.trim()).filter(Boolean);
    ['validadeDias', 'proxNumero', 'pagamentoPadrao', 'tecnicos'].forEach(k => delete d[k]);
    CONFIG.empresa = { ...CONFIG.empresa, ...d }; saveConfig(); toast('Dados da empresa salvos.');
  },
  templates(form) { CONFIG.templates = { ...CONFIG.templates, ...formData(form) }; saveConfig(); toast('Mensagens salvas.'); },
  usuario(form) {
    const d = formData(form);
    if (DB.all('usuarios').some(u => u.usuario.toLowerCase() === d.usuario.trim().toLowerCase())) return toast('Esse usuário já existe.', 'err');
    DB.insert('usuarios', { nome: d.nome.trim(), usuario: d.usuario.trim().toLowerCase(), senha: hash(d.senha), perfil: d.perfil, sdr: d.perfil === 'sdr' ? d.sdr : '' });
    toast('Usuário criado.'); refresh();
  },
  sdr(form) {
    const d = formData(form); const nome = d.nome.trim();
    if (CONFIG.sdrs.some(s => norm(s.nome) === norm(nome))) return toast('Essa SDR já existe.', 'err');
    CONFIG.sdrs.push({ nome, cor: d.cor }); saveConfig(); toast(`SDR ${nome} adicionada. Crie o usuário dela abaixo.`); refresh();
  },
  senha(form) {
    const d = formData(form);
    if (hash(d.atual) !== ME.senha) return toast('Senha atual incorreta.', 'err');
    DB.update('usuarios', ME.id, { senha: hash(d.nova) }); ME = DB.get('usuarios', ME.id); form.reset(); toast('Senha alterada.');
  },
  resetSenha(form) { DB.update('usuarios', form.dataset.id, { senha: hash(form.nova.value) }); closeModal(); toast('Senha redefinida.'); }
};

/* ---------- BUSCA GLOBAL ---------- */
function buscar(q) {
  const box = $('#searchResults');
  if (q.trim().length < 2) { box.hidden = true; return; }
  const cs = myClientes().filter(c => matchCliente(c, q)).slice(0, 8);
  const n = q.trim().replace(/^#/, '');
  const os = /^\d+$/.test(n) ? myOrcs().filter(o => String(o.numero) === String(+n) || numOrc(o.numero).includes(n)).slice(0, 4) : [];
  box.innerHTML = [...cs.map(c => `<button data-action="verCliente" data-id="${c.id}"><b>${esc(c.nome)}</b> ${badge(ST_CLI, c.status)}<small>${esc([c.empresa, c.whatsapp || c.telefone, c.cidade, 'SDR ' + c.sdr].filter(Boolean).join(' | '))}</small></button>`),
    ...os.map(o => `<button data-action="verOrcamento" data-id="${o.id}"><b>Orçamento nº ${numOrc(o.numero)}</b><small>${esc(cliente(o.clienteId)?.nome || '')} | ${money(o.total)}</small></button>`)].join('')
    || '<div class="empty">Nada encontrado para essa busca.</div>';
  box.hidden = false;
}

/* ---------- 13. EVENTOS E BOOT ---------- */
function bindEvents() {
  document.addEventListener('click', e => {
    const nav = e.target.closest('a[data-view]');
    if (nav) { e.preventDefault(); go(nav.dataset.view); closeSidebar(); return; }
    if (e.target.closest('[data-close]') || e.target.id === 'modal') return closeModal();
    const el = e.target.closest('[data-action]');
    if (el && Actions[el.dataset.action]) {
      e.preventDefault();
      if (el.closest('#searchResults')) { $('#searchResults').hidden = true; $('#globalSearch').value = ''; }
      if (el.closest('#fabMenu')) $('#fabMenu').hidden = true;
      Actions[el.dataset.action](el.dataset.id, el, e);
    }
    if (!e.target.closest('.search')) $('#searchResults').hidden = true;
    if (!e.target.closest('#notifPanel, #notifBtn')) $('#notifPanel').hidden = true;
    if (!e.target.closest('#fabMenu, #fabBtn')) $('#fabMenu').hidden = true;
  });

  $('#themeBtn').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; Store.set('theme', t); applyTheme(t); };
  $('#logoutBtn').onclick = logout;
  $('#menuBtn').onclick = () => { $('#sidebar').classList.add('open'); $('#sidebarBackdrop').classList.add('show'); };
  $('#sidebarBackdrop').onclick = closeSidebar;
  $('#fabBtn').onclick = () => { $('#fabMenu').hidden = !$('#fabMenu').hidden; };
  $('#notifBtn').onclick = () => {
    const p = $('#notifPanel'); p.hidden = !p.hidden; if (!p.hidden) renderNotifs();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  };

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'globalSearch') return buscar(t.value);
    if (t.dataset.mask === 'tel') t.value = maskTel(t.value);
    if (t.dataset.mask === 'cep') t.value = maskCep(t.value);
    if (t.dataset.filter) { F(ui.view)[t.dataset.filter] = t.value; refreshList(); }
    const fo = t.closest('form[data-form=orcamento]'); if (fo) recalcOrc(fo);
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.cal) { ui.cal[t.dataset.cal] = t.type === 'checkbox' ? t.checked : t.value; refresh(); }
    if (t.dataset.statusCliente) { setStatusCliente(t.dataset.statusCliente, t.value); refresh(); Actions.verCliente(t.dataset.statusCliente); }
    if (t.dataset.statusOrc) { const o = DB.get('orcamentos', t.dataset.statusOrc); editarOrcamento(o.id, { ...o, status: t.value }); toast(`Orçamento: ${ST_ORC[t.value].l}.`); refresh(); }
    if (t.name === 'clienteId' && t.closest('form[data-form=visita]')) { const f = t.form.endereco; if (!f.value) f.value = enderecoCliente(t.value); }
    if (t.name === 'cep' && digits(t.value).length === 8) buscarCep(t.form, digits(t.value));
    if (t.id === 'restoreFile' && t.files[0]) restaurarBackup(t.files[0]);
  });
  document.addEventListener('submit', e => {
    const form = e.target.closest('form[data-form]'); if (!form) return;
    e.preventDefault();
    Forms[form.dataset.form]?.(form, e.submitter);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  document.addEventListener('dragstart', e => { const c = e.target.closest?.('[data-card]'); if (c) e.dataTransfer.setData('text/plain', c.dataset.card); });
  document.addEventListener('dragover', e => { const col = e.target.closest?.('.kan-col'); if (col) { e.preventDefault(); $$('.kan-col.drop').forEach(x => x !== col && x.classList.remove('drop')); col.classList.add('drop'); } });
  document.addEventListener('drop', e => {
    const col = e.target.closest?.('.kan-col'); if (!col) return;
    e.preventDefault(); col.classList.remove('drop');
    const id = e.dataTransfer.getData('text/plain'); if (id) { setStatusCliente(id, col.dataset.status); refreshList(); }
  });
  document.addEventListener('dragend', () => $$('.kan-col.drop').forEach(x => x.classList.remove('drop')));

  $('#loginForm').addEventListener('submit', e => {
    e.preventDefault();
    if (login($('#loginUser').value, $('#loginPass').value)) startApp();
    else { $('#loginError').textContent = 'Usuário ou senha incorretos.'; $('#loginPass').select(); }
  });
  window.addEventListener('hashchange', () => ME && render());
}
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarBackdrop').classList.remove('show'); }

async function buscarCep(form, cep) {
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`); const j = await r.json();
    if (j.erro) return toast('CEP não encontrado.', 'err');
    if (!form.endereco.value) form.endereco.value = j.logradouro || '';
    if (!form.bairro.value) form.bairro.value = j.bairro || '';
    if (!form.cidade.value) form.cidade.value = j.localidade || '';
    form.endereco.focus();
  } catch { /* offline: preenchimento manual */ }
}
function restaurarBackup(file) {
  const r = new FileReader();
  r.onload = async () => {
    try {
      const data = JSON.parse(r.result);
      if (data.app !== 'sdr-control') throw new Error();
      if (!await confirmar('Restaurar este backup? Os dados atuais deste navegador serão substituídos.', 'Restaurar')) return;
      COLLECTIONS.forEach(c => Array.isArray(data[c]) && DB.replace(c, data[c]));
      if (data.config) { Store.set('config', data.config); loadConfig(); }
      toast('Backup restaurado.'); refresh();
    } catch { toast('Arquivo inválido. Use um backup gerado pelo SDR Control.', 'err'); }
  };
  r.readAsText(file);
}

function startApp() {
  ME = currentUser(); if (!ME) return;
  $('#login').hidden = true; $('#app').hidden = false;
  $('#userName').textContent = ME.nome;
  $('#userRole').textContent = isAdmin() ? 'Administrador' : 'SDR';
  $('#userAvatar').textContent = initials(ME.nome);
  $('#userAvatar').style.background = isAdmin() ? '' : sdrColor(ME.sdr);
  tickClock(); setInterval(tickClock, 1000);
  render();
  const hoje = myVisitas().filter(v => v.data === todayISO() && ['agendada', 'reagendada'].includes(v.status)).length;
  if (hoje) setTimeout(() => toast(`Você possui ${hoje} visita(s) hoje.`, 'info'), 600);
  lembretes(); setInterval(lembretes, 60e3);
}

async function boot() {
  await DB.init();
  loadConfig();
  ensureUsers();
  if (!CONFIG.demoSeeded) seedDemo();
  applyTheme(Store.get('theme', 'dark'));
  bindEvents();
  ME = currentUser();
  if (ME) startApp(); else { $('#login').hidden = false; $('#loginUser').focus(); }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
