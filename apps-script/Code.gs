/* =========================================================================
   SDR CONTROL — BANCO DE DADOS (Google Apps Script)
   Vegas Vigilância e Segurança
   -------------------------------------------------------------------------
   O site fica no GitHub Pages; este arquivo é o banco de dados central.
   • Dados: Planilha Google criada automaticamente
       abas: Usuarios, Clientes, Visitas, Orcamentos, Notificacoes, Config
       cada linha = id | atualizadoEm | colunas legíveis | json (registro completo)
   • Senhas: SHA-256 com salt (nunca voltam para o navegador)
   • Cada SDR recebe e grava apenas os próprios clientes, visitas e orçamentos.
     O administrador vê tudo.

   INSTALAÇÃO: cole este arquivo, execute  instalar  uma vez e publique como
   App da Web (Executar como: Eu · Quem pode acessar: Qualquer pessoa).
   ========================================================================= */

const CFG = {
  PLANILHA: 'SDR Control · Banco de Dados',
  SESSAO_SEG: 21600,         // 6 h sem uso (renovada a cada requisição)
  MAX_TENTATIVAS: 5,
  BLOQUEIO_SEG: 60,
  MAX_NOTIFICACOES: 200,
  VERSAO_BANCO: '1',
};

/** Usuários criados na instalação (troque as senhas no primeiro acesso) */
const USUARIOS_INICIAIS = [
  { nome: 'Administrador', usuario: 'admin', senha: 'vegas2026', perfil: 'admin', sdr: '' },
  { nome: 'Maria Izabel', usuario: 'maria', senha: 'maria123', perfil: 'sdr', sdr: 'Maria Izabel' },
  { nome: 'Daiana', usuario: 'daiana', senha: 'daiana123', perfil: 'sdr', sdr: 'Daiana' },
  { nome: 'Regiane', usuario: 'regiane', senha: 'regiane123', perfil: 'sdr', sdr: 'Regiane' },
];

const TABELAS = {
  usuarios:     { aba: 'Usuarios',     campos: ['nome', 'usuario', 'perfil', 'sdr'] },
  clientes:     { aba: 'Clientes',     campos: ['nome', 'empresa', 'telefone', 'cidade', 'bairro', 'sdr', 'status', 'origem', 'servico', 'entrada'] },
  visitas:      { aba: 'Visitas',      campos: ['clienteId', 'data', 'hora', 'tipo', 'tecnico', 'status', 'endereco'] },
  orcamentos:   { aba: 'Orcamentos',   campos: ['numero', 'clienteId', 'data', 'validade', 'total', 'status'] },
  notificacoes: { aba: 'Notificacoes', campos: ['data', 'texto'] },
  config:       { aba: 'Config',       campos: [] },
};
const COLECOES = ['usuarios', 'clientes', 'visitas', 'orcamentos', 'notificacoes'];

/* =========================================================================
   ENTRADA HTTP
   ========================================================================= */
function doPost(e) {
  let req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, erro: 'Requisição inválida.' }); }
  garantirBanco_();
  return ContentService.createTextOutput(api(req)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput('Banco de dados do SDR Control ativo. Acesse o sistema pelo endereço do GitHub.');
}

/** Execute UMA vez pelo editor (▶ Executar) para autorizar e criar o banco. */
function instalar() {
  props_().deleteProperty('DB_OK');
  const info = garantirBanco_();
  Logger.log('Planilha (banco de dados): ' + info.planilha);
  Logger.log('Usuários iniciais: admin/vegas2026, maria/maria123, daiana/daiana123, regiane/regiane123 — troque as senhas.');
  return info;
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function api(req) {
  try {
    req = req || {};
    const fn = ACOES[req.action];
    if (!fn) throw new Error('Ação desconhecida.');
    const data = fn(req);
    return JSON.stringify({ ok: true, data: data === undefined ? null : data });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return JSON.stringify({ ok: false, erro: (err && err.message) || String(err) });
  }
}

/* =========================================================================
   AÇÕES
   ========================================================================= */
const ACOES = {
  login(req) {
    const usuario = norm_(req.usuario);
    const senha = String(req.senha || '');
    if (!usuario || !senha) throw new Error('Informe usuário e senha.');
    const cache = CacheService.getScriptCache();
    const key = 'lk_' + usuario;
    const lk = JSON.parse(cache.get(key) || '{"f":0}');
    if (lk.ate && lk.ate > Date.now()) throw new Error('Muitas tentativas. Tente novamente em ' + Math.ceil((lk.ate - Date.now()) / 1000) + 's.');
    const u = ler_('usuarios').find((x) => norm_(x.usuario) === usuario);
    if (!u || hash_(senha, u.salt) !== u.senhaHash) {
      const f = (lk.f || 0) + 1;
      cache.put(key, JSON.stringify(f >= CFG.MAX_TENTATIVAS ? { f: 0, ate: Date.now() + CFG.BLOQUEIO_SEG * 1000 } : { f: f }), 600);
      throw new Error('Usuário ou senha incorretos.');
    }
    cache.remove(key);
    const s = { token: tok_(48), uid: u.id, perfil: u.perfil, sdr: u.sdr || '', geracao: props_().getProperty('SESS_GEN') || '0' };
    cache.put('s_' + s.token, JSON.stringify(s), CFG.SESSAO_SEG);
    return { token: s.token, usuario: semSenha_(u), snapshot: snapshot_(s, u) };
  },

  logout(req) {
    if (req.token) CacheService.getScriptCache().remove('s_' + req.token);
    return true;
  },

  bootstrap(req) {
    const s = sessao_(req);
    const u = ler_('usuarios').find((x) => x.id === s.uid);
    return { usuario: semSenha_(u), snapshot: snapshot_(s, u) };
  },

  rev(req) { sessao_(req, true); return rev_(); },

  changePassword(req) {
    const s = sessao_(req);
    return comLock_(() => {
      const u = ler_('usuarios').find((x) => x.id === s.uid);
      if (hash_(String(req.atual || ''), u.salt) !== u.senhaHash) throw new Error('Senha atual incorreta.');
      definirSenha_(u, String(req.nova || ''));
      upsert_('usuarios', u);
      return true;
    });
  },

  /**
   * Grava várias alterações de uma vez: [{op:'upsert'|'remove', col, row|id}]
   * Devolve os registros como ficaram no banco (ex.: nº do orçamento ajustado).
   */
  batch(req) {
    const s = sessao_(req);
    const ops = Array.isArray(req.ops) ? req.ops.slice(0, 300) : [];
    return comLock_(() => {
      const salvos = [];
      const porCol = {};
      ops.forEach((op) => {
        const col = colValida_(op.col);
        (porCol[col] = porCol[col] || []).push(op);
      });
      // clientes primeiro: visitas/orçamentos novos podem depender deles
      ['usuarios', 'clientes', 'visitas', 'orcamentos', 'notificacoes'].forEach((col) => {
        if (!porCol[col]) return;
        const lista = ler_(col).slice();
        const idx = {};
        lista.forEach((r, i) => (idx[r.id] = i));
        const alterados = {};
        const removidos = {};
        porCol[col].forEach((op) => {
          if (op.op === 'remove') {
            const atual = idx[op.id] !== undefined ? lista[idx[op.id]] : null;
            if (!atual) return;
            permitir_(s, col, atual, 'remove');
            removidos[op.id] = true;
            return;
          }
          let row = op.row;
          if (!row || typeof row !== 'object' || !row.id) return;
          const atual = idx[row.id] !== undefined ? lista[idx[row.id]] : null;
          permitir_(s, col, atual || row, atual ? 'update' : 'insert', row);
          row = preparar_(s, col, atual, row, lista);
          row.atualizadoEm = row.atualizadoEm || agora_();
          if (atual) lista[idx[row.id]] = row;
          else { idx[row.id] = lista.length; lista.push(row); }
          alterados[row.id] = row;
          salvos.push({ col: col, row: col === 'usuarios' ? semSenha_(row) : row });
        });
        gravarAlteracoes_(col, lista, alterados, removidos);
        if (col === 'notificacoes') aparar_('notificacoes', CFG.MAX_NOTIFICACOES);
      });
      if (porCol.orcamentos) {
        const cfg = config_();
        const maior = ler_('orcamentos').reduce((m, o) => Math.max(m, Number(o.numero) || 0), 0);
        if ((Number(cfg.proxNumero) || 1) <= maior) { cfg.proxNumero = maior + 1; salvarConfig_(cfg); }
      }
      bump_();
      return { salvos: salvos, proxNumero: config_().proxNumero || 1 };
    });
  },

  /** Evita que duas SDRs trabalhem o mesmo contato: informa só o nome e a SDR */
  checarTelefone(req) {
    sessao_(req, true);
    const d = String(req.tel || '').replace(/\D/g, '');
    if (d.length < 10) return null;
    const c = ler_('clientes').find((x) => x.id !== req.id && [x.whatsapp, x.telefone].some((t) => String(t || '').replace(/\D/g, '') === d));
    return c ? { nome: c.nome, sdr: c.sdr } : null;
  },

  setConfig(req) {
    const s = sessao_(req, false, ['admin']);
    return comLock_(() => {
      const cfg = Object.assign(config_(), req.config || {});
      const maior = ler_('orcamentos').reduce((m, o) => Math.max(m, Number(o.numero) || 0), 0);
      cfg.proxNumero = Math.max(Number(cfg.proxNumero) || 1, maior + 1);
      salvarConfig_(cfg);
      bump_();
      return cfg;
    });
  },

  /** Importa um backup do sistema antigo JUNTANDO com o que já existe (não apaga nada) */
  importar(req) {
    sessao_(req, false, ['admin']);
    const d = req.data || {};
    if (d.app !== 'sdr-control') throw new Error('Arquivo inválido. Use um backup gerado pelo SDR Control.');
    return comLock_(() => {
      const res = {};
      ['clientes', 'visitas', 'orcamentos'].forEach((col) => {
        const novos = (Array.isArray(d[col]) ? d[col] : []).filter((r) => r && r.id && !r.demo);
        const mapa = {};
        ler_(col).forEach((r) => (mapa[r.id] = r));
        let n = 0;
        novos.forEach((r) => { if (!mapa[r.id]) n++; mapa[r.id] = Object.assign(mapa[r.id] || {}, r); });
        substituirTudo_(col, Object.keys(mapa).map((k) => mapa[k]));
        res[col] = n;
      });
      // SDRs do backup que ainda não existem na configuração
      const cfg = config_();
      const sdrs = cfg.sdrs || [];
      ((d.config && d.config.sdrs) || []).forEach((x) => { if (x && x.nome && !sdrs.some((y) => norm_(y.nome) === norm_(x.nome))) sdrs.push(x); });
      cfg.sdrs = sdrs;
      const maior = ler_('orcamentos').reduce((m, o) => Math.max(m, Number(o.numero) || 0), 0);
      cfg.proxNumero = Math.max(Number(cfg.proxNumero) || 1, maior + 1);
      salvarConfig_(cfg);
      bump_();
      return res;
    });
  },

  /** Apaga clientes, visitas, orçamentos e notificações (usuários e configurações ficam) */
  apagarTudo(req) {
    sessao_(req, false, ['admin']);
    return comLock_(() => {
      ['clientes', 'visitas', 'orcamentos', 'notificacoes'].forEach((c) => substituirTudo_(c, []));
      const cfg = config_(); cfg.proxNumero = 1; salvarConfig_(cfg);
      bump_();
      return true;
    });
  },
};

/* =========================================================================
   PERMISSÕES
   ========================================================================= */
function permitir_(s, col, registro, acao, novo) {
  if (s.perfil === 'admin') return;
  const negar = () => { throw new Error('Você não tem permissão para esta alteração.'); };
  if (acao === 'remove') negar();
  if (col === 'usuarios' || col === 'config') negar();
  if (col === 'notificacoes') { if (acao !== 'insert' && acao !== 'update') negar(); return; }
  if (col === 'clientes') {
    if (registro.sdr !== s.sdr) negar();          // cliente de outra SDR
    if (novo && novo.sdr !== s.sdr) negar();      // não pode transferir
    return;
  }
  // visitas e orçamentos: o cliente precisa ser da SDR
  const cid = (novo && novo.clienteId) || registro.clienteId;
  const cli = ler_('clientes').find((c) => c.id === cid);
  if (!cli || cli.sdr !== s.sdr) negar();
  if (registro.clienteId && registro.clienteId !== cid) {
    const antigo = ler_('clientes').find((c) => c.id === registro.clienteId);
    if (!antigo || antigo.sdr !== s.sdr) negar();
  }
}

/** Ajustes feitos pelo servidor antes de gravar */
function preparar_(s, col, atual, row, lista) {
  if (col === 'usuarios') {
    if (row.senhaNova) definirSenha_(row, String(row.senhaNova));
    else if (atual) { row.salt = atual.salt; row.senhaHash = atual.senhaHash; }
    else definirSenha_(row, tok_(12));
    delete row.senhaNova; delete row.senha;
    row.usuario = norm_(row.usuario);
    if (!row.usuario) throw new Error('Informe o usuário.');
    if (lista.some((u) => u.id !== row.id && norm_(u.usuario) === row.usuario)) throw new Error('Esse usuário já existe.');
  }
  if (col === 'clientes' && atual) {
    // histórico: junta as duas versões (duas pessoas mexendo no mesmo cliente)
    const visto = {};
    const h = [];
    (atual.historico || []).concat(row.historico || []).forEach((x) => {
      const k = x.data + '|' + x.tipo + '|' + x.texto;
      if (!visto[k]) { visto[k] = 1; h.push(x); }
    });
    row.historico = h.sort((a, b) => String(a.data).localeCompare(String(b.data)));
  }
  if (col === 'orcamentos') {
    const outro = lista.find((o) => o.id !== row.id && Number(o.numero) === Number(row.numero));
    if (!atual && (outro || !row.numero)) {
      // duas pessoas criaram orçamento ao mesmo tempo: o servidor dá o próximo número livre
      row.numero = lista.reduce((m, o) => Math.max(m, Number(o.numero) || 0), 0) + 1;
    }
  }
  if (col === 'notificacoes' && s.perfil !== 'admin' && atual) {
    // SDR só pode marcar como lida
    const lida = atual.lidaPor || [];
    row = Object.assign({}, atual, { lidaPor: lida.concat((row.lidaPor || []).filter((x) => lida.indexOf(x) < 0)) });
  }
  return row;
}

function definirSenha_(u, senha) {
  if (senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  u.salt = tok_(16);
  u.senhaHash = hash_(senha, u.salt);
}

/* =========================================================================
   SNAPSHOT (o que cada pessoa recebe)
   ========================================================================= */
function snapshot_(s, u) {
  const cfg = config_();
  const out = { rev: rev_(), config: cfg };
  if (s.perfil === 'admin') {
    out.usuarios = ler_('usuarios').map(semSenha_);
    out.clientes = ler_('clientes');
    out.visitas = ler_('visitas');
    out.orcamentos = ler_('orcamentos');
    out.notificacoes = ler_('notificacoes');
  } else {
    const clientes = ler_('clientes').filter((c) => c.sdr === s.sdr);
    const ids = {};
    clientes.forEach((c) => (ids[c.id] = 1));
    out.usuarios = [semSenha_(u)];
    out.clientes = clientes;
    out.visitas = ler_('visitas').filter((v) => ids[v.clienteId]);
    out.orcamentos = ler_('orcamentos').filter((o) => ids[o.clienteId]);
    out.notificacoes = [];
  }
  return out;
}

/* =========================================================================
   SESSÃO / SENHA
   ========================================================================= */
function sessao_(req, leve, perfis) {
  const tok = String((req && req.token) || '');
  const cache = CacheService.getScriptCache();
  const raw = tok ? cache.get('s_' + tok) : null;
  if (!raw) throw new Error('SESSAO: Sua sessão expirou. Entre novamente.');
  const s = JSON.parse(raw);
  if (String(s.geracao) !== String(props_().getProperty('SESS_GEN') || '0')) throw new Error('SESSAO: Sua sessão expirou. Entre novamente.');
  if (!leve) {
    const u = ler_('usuarios').find((x) => x.id === s.uid);
    if (!u) { cache.remove('s_' + tok); throw new Error('SESSAO: Seu usuário foi removido.'); }
    s.perfil = u.perfil; s.sdr = u.sdr || '';
  }
  cache.put('s_' + tok, JSON.stringify(s), CFG.SESSAO_SEG);
  if (perfis && perfis.indexOf(s.perfil) < 0) throw new Error('Somente o administrador pode fazer isso.');
  return s;
}

function hash_(senha, salt) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(salt) + '::' + String(senha), Utilities.Charset.UTF_8)
    .map((b) => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

function semSenha_(u) {
  if (!u) return null;
  const c = Object.assign({}, u);
  delete c.senhaHash; delete c.salt; delete c.senha; delete c.senhaNova;
  return c;
}

/* =========================================================================
   PLANILHA
   ========================================================================= */
let SS_ = null;
let MEMO_ = {};

function props_() { return PropertiesService.getScriptProperties(); }

function banco_() {
  if (SS_) return SS_;
  const id = props_().getProperty('DB_ID');
  if (id) { try { SS_ = SpreadsheetApp.openById(id); return SS_; } catch (e) { /* recria */ } }
  garantirBanco_(true);
  return SS_;
}

function garantirBanco_(forcar) {
  const pr = props_();
  if (!forcar && pr.getProperty('DB_OK') === CFG.VERSAO_BANCO && pr.getProperty('DB_ID')) {
    return { planilha: 'https://docs.google.com/spreadsheets/d/' + pr.getProperty('DB_ID') };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const id = pr.getProperty('DB_ID');
    if (id) { try { SS_ = SpreadsheetApp.openById(id); } catch (e) { SS_ = null; } }
    if (!SS_) { SS_ = SpreadsheetApp.create(CFG.PLANILHA); pr.setProperty('DB_ID', SS_.getId()); }
    Object.keys(TABELAS).forEach((c) => aba_(c));
    const nomes = Object.keys(TABELAS).map((c) => TABELAS[c].aba);
    SS_.getSheets().forEach((sh) => { if (nomes.indexOf(sh.getName()) < 0 && sh.getLastRow() === 0 && SS_.getSheets().length > 1) SS_.deleteSheet(sh); });
    if (!ler_('usuarios').length) {
      USUARIOS_INICIAIS.forEach((x) => {
        const u = { id: tok_(12).toLowerCase(), nome: x.nome, usuario: x.usuario, perfil: x.perfil, sdr: x.sdr, criadoEm: agora_() };
        definirSenha_(u, x.senha);
        upsert_('usuarios', u);
      });
    }
    if (!ler_('config').length) salvarConfig_({});
    pr.setProperty('DB_OK', CFG.VERSAO_BANCO);
    return { planilha: SS_.getUrl() };
  } finally { lock.releaseLock(); }
}

function cabecalho_(col) { return ['id', 'atualizadoEm'].concat(TABELAS[col].campos, ['json']); }

function aba_(col) {
  const t = TABELAS[col];
  const ss = SS_ || banco_();
  let sh = ss.getSheetByName(t.aba);
  if (!sh) {
    sh = ss.insertSheet(t.aba);
    const h = cabecalho_(col);
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#0b1220').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function ler_(col) {
  if (MEMO_[col]) return MEMO_[col];
  const sh = aba_(col);
  const n = sh.getLastRow();
  const out = [];
  if (n > 1) {
    const w = cabecalho_(col).length;
    sh.getRange(2, 1, n - 1, w).getValues().forEach((r) => {
      if (!r[0]) return;
      try { out.push(JSON.parse(r[w - 1])); } catch (e) { /* ignora linha corrompida */ }
    });
  }
  MEMO_[col] = out;
  return out;
}

function valor_(obj, campo) {
  let v = obj[campo];
  if (v == null || typeof v === 'object') return '';
  if (typeof v === 'number') return v;
  v = String(v);
  if (/^[=+\-@]/.test(v) || /^\d{5,}$/.test(v)) v = "'" + v;
  return v.slice(0, 1000);
}

function linha_(col, obj) {
  const j = JSON.stringify(obj);
  if (j.length > 49000) throw new Error('Registro grande demais para a planilha (' + col + ').');
  return [obj.id, obj.atualizadoEm || agora_()].concat(TABELAS[col].campos.map((c) => valor_(obj, c)), [j]);
}

function upsert_(col, obj) {
  const sh = aba_(col);
  const n = sh.getLastRow();
  const row = linha_(col, obj);
  let idx = -1;
  if (n > 1) {
    const ids = sh.getRange(2, 1, n - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(obj.id)) { idx = i; break; }
  }
  if (idx >= 0) sh.getRange(idx + 2, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
  delete MEMO_[col];
}

/** Grava só as linhas alteradas; se houve remoção, regrava a aba inteira */
function gravarAlteracoes_(col, lista, alterados, removidos) {
  if (Object.keys(removidos).length) {
    substituirTudo_(col, lista.filter((r) => !removidos[r.id]));
    return;
  }
  const sh = aba_(col);
  const n = sh.getLastRow();
  const linhaDe = {};
  if (n > 1) sh.getRange(2, 1, n - 1, 1).getValues().forEach((r, i) => (linhaDe[String(r[0])] = i + 2));
  const novas = [];
  Object.keys(alterados).forEach((id) => {
    const row = linha_(col, alterados[id]);
    if (linhaDe[id]) sh.getRange(linhaDe[id], 1, 1, row.length).setValues([row]);
    else novas.push(row);
  });
  if (novas.length) sh.getRange(sh.getLastRow() + 1, 1, novas.length, novas[0].length).setValues(novas);
  delete MEMO_[col];
}

function substituirTudo_(col, lista) {
  const sh = aba_(col);
  const h = cabecalho_(col);
  const n = sh.getLastRow();
  if (n > 1) sh.getRange(2, 1, n - 1, Math.max(h.length, sh.getLastColumn())).clearContent();
  if (lista.length) sh.getRange(2, 1, lista.length, h.length).setValues(lista.map((o) => linha_(col, o)));
  if (n > lista.length + 1) sh.deleteRows(lista.length + 2, n - lista.length - 1);
  delete MEMO_[col];
}

function aparar_(col, max) {
  const l = ler_(col);
  if (l.length > max + 20) substituirTudo_(col, l.sort((a, b) => String(a.data).localeCompare(String(b.data))).slice(-max));
}

function config_() {
  const c = ler_('config').find((x) => x.id === 'config');
  return c ? Object.assign({}, c.valor || {}) : {};
}

function salvarConfig_(cfg) {
  upsert_('config', { id: 'config', atualizadoEm: agora_(), valor: cfg });
}

function colValida_(col) {
  if (COLECOES.indexOf(col) < 0) throw new Error('Coleção inválida.');
  return col;
}

function rev_() { return Number(props_().getProperty('REV') || 0); }
function bump_() { props_().setProperty('REV', String(rev_() + 1)); }

function comLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { MEMO_ = {}; return fn(); }
  finally { lock.releaseLock(); }
}

function agora_() { return new Date().toISOString(); }
function norm_(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }

function tok_(n) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let hex = '';
  while (hex.length < n * 2) hex += Utilities.getUuid().replace(/-/g, '');
  let out = '';
  for (let i = 0; i < n; i++) out += chars.charAt(parseInt(hex.substr(i * 2, 2), 16) % chars.length);
  return out;
}
