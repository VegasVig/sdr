/******************************************************************************
 * CRM VEGAS — Leads, Orçamentos e Follow-up automático pelo WhatsApp
 * Vegas Vigilância e Segurança
 *
 * Backend: Google Apps Script + Google Planilhas (banco de dados)
 * Frontend: index.html hospedado no GitHub Pages
 *
 * INSTALAÇÃO RÁPIDA (detalhes no GUIA-INSTALACAO.md):
 *   1. Crie uma Planilha Google nova > Extensões > Apps Script.
 *   2. Apague o conteúdo do Code.gs, cole este arquivo inteiro e salve.
 *   3. Selecione a função "instalar" e clique em Executar. Autorize.
 *      A senha inicial do administrador aparece no Registro de execução.
 *   4. Implantar > Nova implantação > Tipo: App da Web
 *      Executar como: Eu | Quem pode acessar: Qualquer pessoa
 *   5. Copie a URL /exec e cole no index.html (constante API_URL).
 *
 * O sistema começa em MODO TESTE: nenhuma mensagem real é enviada.
 ******************************************************************************/

const VERSAO = '1.1.0';
const SESSAO_SEGUNDOS = 21600;      // 6 horas (limite do CacheService)
const LOTE_ENVIO = 15;              // mensagens por execução da fila
const TRAVA_ESPERA_MS = 25000;

/* ========================================================================== */
/* ESTRUTURA DO BANCO (abas da planilha)                                      */
/* Não altere a ordem das colunas. Novas colunas sempre no final.            */
/* ========================================================================== */

const ABAS = {
  USUARIOS: { nome: 'CRM_Usuarios', cols: ['id', 'nome', 'email', 'senhaHash', 'salt', 'perfil', 'ativo', 'criadoEm', 'atualizadoEm'] },
  LEADS: { nome: 'CRM_Leads', cols: ['id', 'nome', 'telefone', 'email', 'tipoCliente', 'servico', 'endereco', 'dataSolicitacao', 'origem', 'necessidade', 'valorEstimado', 'ultimoContato', 'proximoContato', 'proximoAuto', 'responsavelId', 'responsavelNome', 'status', 'consentimento', 'consentimentoOrigem', 'consentimentoData', 'bloqueado', 'motivoBloqueio', 'arquivado', 'anonimizado', 'encerradoEm', 'criadoEm', 'criadoPor', 'atualizadoEm'] },
  ORCAMENTOS: { nome: 'CRM_Orcamentos', cols: ['id', 'numero', 'leadId', 'itens', 'subtotal', 'desconto', 'total', 'condicoesPagamento', 'dataEnvio', 'validade', 'observacoes', 'status', 'geracao', 'encerradoEm', 'criadoEm', 'criadoPor', 'atualizadoEm'] },
  HISTORICO: { nome: 'CRM_Historico', cols: ['id', 'dataHora', 'usuarioId', 'usuarioNome', 'leadId', 'entidade', 'entidadeId', 'acao', 'detalhes'] },
  FILA: { nome: 'CRM_Fila', cols: ['id', 'chave', 'leadId', 'orcamentoId', 'etapa', 'modeloId', 'telefone', 'agendadoPara', 'status', 'tentativas', 'ultimaTentativa', 'mensagemId', 'statusEntrega', 'erro', 'texto', 'modo', 'aprovadoPor', 'criadoEm', 'atualizadoEm', 'canal'] },
  MODELOS: { nome: 'CRM_Modelos', cols: ['id', 'nome', 'etapa', 'templateMeta', 'idioma', 'corpo', 'ativo', 'atualizadoEm', 'assunto'] },
  CONFIG: { nome: 'CRM_Config', cols: ['chave', 'valor', 'descricao'] },
  OPTOUT: { nome: 'CRM_OptOut', cols: ['telefone', 'motivo', 'origem', 'data', 'usuario'] }  // "telefone" guarda telefone ou e-mail
};

const LISTAS = {
  tipoCliente: ['Residencial', 'Comercial', 'Empresarial'],
  servico: ['Câmeras de segurança', 'Alarmes', 'Rastreamento veicular', 'Outros serviços'],
  origem: ['Indicação', 'Site', 'Anúncio', 'Telefone', 'WhatsApp', 'Instagram/Facebook', 'Outro'],
  statusLead: ['Novo', 'Em contato', 'Orçamento enviado', 'Negociação', 'Ganho', 'Perdido'],
  statusOrcamento: ['Em preparação', 'Enviado', 'Aguardando resposta', 'Negociação', 'Aprovado', 'Recusado', 'Expirado'],
  tipoContato: ['Ligação', 'WhatsApp manual', 'E-mail', 'Visita', 'Observação'],
  origemConsentimento: ['Formulário do site', 'Pedido de orçamento por e-mail', 'Cliente iniciou conversa no WhatsApp', 'Ligação telefônica', 'Atendimento presencial', 'Outro'],
  variaveis: ['NOME', 'NOME_COMPLETO', 'SERVICO', 'EMPRESA', 'ORCAMENTO', 'VENDEDOR']
};

const SERVICO_TEXTO = {
  'Câmeras de segurança': 'câmeras de segurança',
  'Alarmes': 'alarme',
  'Rastreamento veicular': 'rastreamento veicular',
  'Outros serviços': 'segurança eletrônica'
};

const ORC_ATIVOS_FOLLOWUP = ['Enviado', 'Aguardando resposta'];
const ORC_ABERTOS = ['Enviado', 'Aguardando resposta', 'Negociação'];
const ORC_ENCERRADOS = ['Aprovado', 'Recusado', 'Expirado'];
const LEAD_ENCERRADOS = ['Ganho', 'Perdido'];
const FILA_PENDENTES = ['AGUARDANDO_APROVACAO', 'PENDENTE'];
const SISTEMA = { id: 'SISTEMA', nome: 'Sistema (automático)' };
const EMAIL_SIS = { id: 'EMAIL', nome: 'E-mail (automático)' };
const WHATSAPP = { id: 'WHATSAPP', nome: 'WhatsApp (automático)' };

const CONFIG_PADRAO = [
  ['EMPRESA', 'Vegas Vigilância e Segurança', 'Nome da empresa usado nas mensagens'],
  ['NUMERO_WHATSAPP', '5524998235101', 'WhatsApp da empresa usado no botão "Conversar no WhatsApp" do e-mail'],
  ['TELEFONE_CONTATO', '5524998235101', 'Telefone usado no botão "Ligar" do e-mail'],
  ['CANAL', 'EMAIL', 'Canal dos acompanhamentos automáticos: EMAIL ou WHATSAPP (API oficial)'],
  ['EMAIL_REMETENTE', 'Vegas Vigilância e Segurança', 'Nome que aparece como remetente do e-mail'],
  ['EMAIL_RESPONDER_PARA', '', 'E-mail que recebe as respostas (vazio = a própria conta Google)'],
  ['EMAIL_IMG_TOPO', 'https://vegasvig.github.io/sdr/email-topo.jpg', 'Imagem do topo do e-mail (link https)'],
  ['EMAIL_IMG_RODAPE', 'https://vegasvig.github.io/sdr/email-rodape.jpg', 'Imagem do rodapé do e-mail (link https)'],
  ['MSG_WHATSAPP_CLIENTE', 'Olá! Recebi o orçamento [ORCAMENTO] de [SERVICO] e gostaria de conversar.', 'Mensagem que já vem escrita quando o cliente clica no botão do WhatsApp'],
  ['DETECTAR_RESPOSTA_EMAIL', 'SIM', 'SIM = pausa os acompanhamentos quando o cliente responde o e-mail'],
  ['MODO_TESTE', 'SIM', 'SIM = simula os envios, nenhuma mensagem real sai'],
  ['ENVIOS_PAUSADOS', 'NAO', 'SIM = bloqueio geral imediato de todos os envios'],
  ['REQUER_APROVACAO', 'SIM', 'SIM = cada mensagem agendada espera aprovação do administrador'],
  ['DIAS_ETAPA_1', '2', 'Dias após o envio do orçamento para o 1º acompanhamento (0 = desativado)'],
  ['DIAS_ETAPA_2', '5', 'Dias após o envio do orçamento para o 2º acompanhamento (0 = desativado)'],
  ['DIAS_ETAPA_3', '10', 'Dias após o envio do orçamento para o encerramento (0 = desativado)'],
  ['HORA_INICIO', '08:30', 'Início do horário permitido para envio'],
  ['HORA_FIM', '18:00', 'Fim do horário permitido para envio'],
  ['HORA_PREFERIDA', '09:30', 'Horário em que os acompanhamentos são agendados'],
  ['DIAS_SEMANA', '1,2,3,4,5,6', 'Dias permitidos (1=segunda ... 7=domingo)'],
  ['FUSO', 'America/Sao_Paulo', 'Fuso horário'],
  ['MAX_MSG_30_DIAS', '3', 'Máximo de mensagens automáticas por contato em 30 dias'],
  ['MIN_HORAS_ENTRE_MSG', '24', 'Intervalo mínimo (horas) entre mensagens para o mesmo contato'],
  ['MAX_TENTATIVAS', '3', 'Tentativas em caso de erro temporário'],
  ['VALIDADE_PADRAO_DIAS', '15', 'Validade padrão do orçamento (dias)'],
  ['GRAPH_VERSAO', 'v23.0', 'Versão da Graph API da Meta'],
  ['PALAVRAS_OPTOUT', 'sair,parar,pare,stop,cancelar,não quero,nao quero,descadastrar,remover,não enviar,nao enviar', 'Respostas que bloqueiam novos envios'],
  ['SEQ_ORCAMENTO', '0', 'Contador interno de orçamentos (não alterar)']
];

const ASSUNTOS_PADRAO = {
  1: '[NOME], conseguiu avaliar seu orçamento de [SERVICO]?',
  2: 'Ainda tem interesse no projeto de [SERVICO]?',
  3: '[NOME], deseja prosseguir com seu orçamento?'
};

const MODELOS_PADRAO = [
  ['Primeiro acompanhamento', 1, 'followup_orcamento_1', 'Olá, [NOME]! Tudo bem? Aqui é da [EMPRESA]. Estou entrando em contato para saber se você conseguiu avaliar o orçamento de [SERVICO] que solicitou. Se tiver alguma dúvida ou quiser ajustar a proposta, estou à disposição!'],
  ['Segundo acompanhamento', 2, 'followup_orcamento_2', 'Olá, [NOME]! Passando para saber se ainda tem interesse no projeto de [SERVICO]. Podemos conversar sobre as opções e encontrar uma solução que atenda à sua necessidade. Fico à disposição!'],
  ['Encerramento do acompanhamento', 3, 'followup_orcamento_3', 'Olá, [NOME]! Gostaria de confirmar se ainda deseja prosseguir com o orçamento de [SERVICO]. Se preferir deixar para outro momento, sem problemas. Caso queira retomar, estaremos à disposição.']
];

const ROTULOS_LEAD = {
  nome: 'Nome', telefone: 'Telefone', email: 'E-mail', tipoCliente: 'Tipo de cliente', servico: 'Serviço',
  endereco: 'Endereço/região', dataSolicitacao: 'Data da solicitação', origem: 'Origem', necessidade: 'Necessidade',
  valorEstimado: 'Valor estimado', proximoContato: 'Próximo contato', responsavelNome: 'Responsável', status: 'Status',
  consentimento: 'Autorização de contato', consentimentoOrigem: 'Origem da autorização'
};

/* ========================================================================== */
/* ENTRADAS DO WEB APP                                                        */
/* ========================================================================== */

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.acao === 'sair') return paginaDescadastro_(p);
  if (p['hub.mode'] === 'subscribe') {
    const vt = PropertiesService.getScriptProperties().getProperty('WA_VERIFY_TOKEN');
    if (vt && p['hub.verify_token'] === vt) return ContentService.createTextOutput(String(p['hub.challenge'] || ''));
    return ContentService.createTextOutput('Token de verificação inválido');
  }
  return json_({ ok: true, app: 'CRM Vegas', versao: VERSAO });
}

function doPost(e) {
  let corpo;
  try {
    corpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (x) {
    return json_({ ok: false, erro: 'Requisição inválida.' });
  }
  if (corpo && corpo.object === 'whatsapp_business_account') {
    try { webhookWhatsApp_(corpo); } catch (x) { console.error('Webhook: ' + (x.stack || x)); }
    return ContentService.createTextOutput('EVENT_RECEIVED');
  }
  return json_(rotear_(corpo || {}));
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

const ACOES = {
  me: { fn: me_ },
  logout: { fn: logout_ },
  alterarSenha: { fn: alterarSenha_, escrita: true },
  dashboard: { fn: dashboard_ },
  listarLeads: { fn: listarLeads_ },
  obterLead: { fn: obterLead_ },
  salvarLead: { fn: salvarLead_, escrita: true },
  arquivarLead: { fn: arquivarLead_, escrita: true },
  salvarOrcamento: { fn: salvarOrcamento_, escrita: true },
  registrarContato: { fn: registrarContato_, escrita: true },
  clienteRespondeu: { fn: clienteRespondeu_, escrita: true },
  bloquearLead: { fn: bloquearLead_, escrita: true },
  optoutLead: { fn: optoutLead_, escrita: true },
  reiniciarAcompanhamento: { fn: reiniciarAcompanhamento_, escrita: true },
  listarFila: { fn: listarFila_ },
  cancelarFila: { fn: cancelarFila_, escrita: true },
  aprovarFila: { fn: aprovarFila_, escrita: true, admin: true },
  reprocessarFila: { fn: reprocessarFila_, escrita: true, admin: true },
  processarAgora: { fn: processarAgora_, admin: true },
  listarModelos: { fn: listarModelos_ },
  salvarModelo: { fn: salvarModelo_, escrita: true, admin: true },
  obterConfig: { fn: obterConfig_, admin: true },
  salvarConfig: { fn: salvarConfig_, escrita: true, admin: true },
  salvarCredenciais: { fn: salvarCredenciais_, escrita: true, admin: true },
  testarIntegracao: { fn: testarIntegracao_, admin: true },
  reinstalarGatilho: { fn: reinstalarGatilho_, admin: true },
  listarUsuarios: { fn: listarUsuarios_, admin: true },
  listarVendedores: { fn: listarVendedores_ },
  salvarUsuario: { fn: salvarUsuario_, escrita: true, admin: true },
  anonimizarLead: { fn: anonimizarLead_, escrita: true, admin: true },
  listarOptOut: { fn: listarOptOut_, admin: true },
  removerOptOut: { fn: removerOptOut_, escrita: true, admin: true },
  registrarWhatsAppManual: { fn: registrarWhatsAppManual_, escrita: true },
  previaEmail: { fn: previaEmail_, admin: true },
  enviarEmailTeste: { fn: enviarEmailTeste_, admin: true }
};

function rotear_(req) {
  const acao = String(req.action || '');
  try {
    if (acao === 'ping') return { ok: true, dados: { versao: VERSAO } };
    if (acao === 'login') return { ok: true, dados: login_(req.dados || {}) };
    const def = ACOES[acao];
    if (!def) throw erro_('Ação desconhecida: ' + acao);
    const usuario = sessao_(req.token);
    if (def.admin && usuario.perfil !== 'admin') throw erro_('Permissão negada: apenas administradores podem fazer isso.');
    const executar = function () { return def.fn(req.dados || {}, usuario); };
    const dados = def.escrita ? comTrava_(executar) : executar();
    return { ok: true, dados: dados === undefined ? null : dados };
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (!(err && err.esperado)) console.error(acao + ': ' + ((err && err.stack) || msg));
    return { ok: false, erro: msg, extra: (err && err.extra) || null };
  }
}

/* ========================================================================== */
/* INFRAESTRUTURA: planilha, trava, utilidades                                */
/* ========================================================================== */

let _memo = {};
let _cfg = null;

function limparMemo_() { _memo = {}; _cfg = null; }

function comTrava_(fn) {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(TRAVA_ESPERA_MS)) throw erro_('O sistema está ocupado salvando outra operação. Tente novamente em alguns segundos.');
  try {
    limparMemo_();
    return fn();
  } finally {
    SpreadsheetApp.flush();
    trava.releaseLock();
  }
}

function aba_(def) {
  const sh = SpreadsheetApp.getActive().getSheetByName(def.nome);
  if (!sh) throw erro_('A aba ' + def.nome + ' não existe. Execute a função instalar() no editor do Apps Script.');
  return sh;
}

function valor_(v) {
  if (v instanceof Date) return v.toISOString();
  if (v === null || v === undefined) return '';
  return String(v);
}

function ler_(def) {
  if (_memo[def.nome]) return _memo[def.nome];
  const sh = aba_(def);
  const n = sh.getLastRow() - 1;
  let lista = [];
  if (n > 0) {
    const vals = sh.getRange(2, 1, n, def.cols.length).getValues();
    lista = vals.map(function (r, i) {
      const o = { _row: i + 2 };
      def.cols.forEach(function (c, j) { o[c] = valor_(r[j]); });
      return o;
    }).filter(function (o) { return o[def.cols[0]] !== ''; });
  }
  _memo[def.nome] = lista;
  return lista;
}

function linha_(def, obj) {
  return def.cols.map(function (c) { return obj[c] === undefined || obj[c] === null ? '' : String(obj[c]); });
}

function inserir_(def, obj) {
  const sh = aba_(def);
  const row = sh.getLastRow() + 1;
  if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 500);
  const rg = sh.getRange(row, 1, 1, def.cols.length);
  rg.setNumberFormat('@');
  rg.setValues([linha_(def, obj)]);
  obj._row = row;
  if (_memo[def.nome]) _memo[def.nome].push(obj);
  return obj;
}

function salvar_(def, obj) {
  if (!obj._row) throw new Error('Registro sem posição na planilha.');
  aba_(def).getRange(obj._row, 1, 1, def.cols.length).setValues([linha_(def, obj)]);
  return obj;
}

function erro_(msg, extra) {
  const e = new Error(msg);
  e.esperado = true;
  e.extra = extra || null;
  return e;
}

function novoId_(prefixo) { return prefixo + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 14); }
function agoraISO_() { return new Date().toISOString(); }
function limpa_(v, max) { return String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max || 500); }
function semAcento_(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function num_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v || '').replace(/[R$\s]/g, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function dinheiro_(n) { return Math.round(num_(n) * 100) / 100; }
function ymdOk_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : ''; }
function hoje_(cfg) { return Utilities.formatDate(new Date(), cfg.FUSO, 'yyyy-MM-dd'); }
function dataLocal_(d, cfg) { return Utilities.formatDate(d instanceof Date ? d : new Date(d), cfg.FUSO, 'yyyy-MM-dd'); }
function somarDias_(ymd, n) {
  const p = ymd.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
}
function br_(ymd) { const p = String(ymd || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
function hash_(s) {
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(b).replace(/=+$/, '');
}
function escRe_(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function normalizarTelefone_(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.indexOf('00') === 0) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}
function telefoneValido_(d) {
  if (d.indexOf('55') === 0) return d.length === 12 || d.length === 13;
  return d.length >= 8 && d.length <= 15;
}

/* ---------------------------- Configuração -------------------------------- */

function config_() {
  if (_cfg) return _cfg;
  const c = {};
  CONFIG_PADRAO.forEach(function (x) { c[x[0]] = x[1]; });
  ler_(ABAS.CONFIG).forEach(function (r) { c[r.chave] = r.valor; });
  _cfg = c;
  return c;
}

function definirConfig_(chave, valor) {
  const r = ler_(ABAS.CONFIG).find(function (x) { return x.chave === chave; });
  if (r) { r.valor = String(valor); salvar_(ABAS.CONFIG, r); }
  else inserir_(ABAS.CONFIG, { chave: chave, valor: String(valor), descricao: '' });
  if (_cfg) _cfg[chave] = String(valor);
}

function configPublica_() {
  const c = config_();
  return { EMPRESA: c.EMPRESA, CANAL: c.CANAL, MODO_TESTE: c.MODO_TESTE, ENVIOS_PAUSADOS: c.ENVIOS_PAUSADOS, REQUER_APROVACAO: c.REQUER_APROVACAO, FUSO: c.FUSO, VALIDADE_PADRAO_DIAS: c.VALIDADE_PADRAO_DIAS };
}

/* ---------------------------- Janela de envio ----------------------------- */

function diasPermitidos_(cfg) {
  return String(cfg.DIAS_SEMANA || '').split(',').map(function (s) { return parseInt(s, 10); }).filter(function (n) { return n >= 1 && n <= 7; });
}

function dentroJanela_(d, cfg) {
  const dia = parseInt(Utilities.formatDate(d, cfg.FUSO, 'u'), 10);
  const hm = Utilities.formatDate(d, cfg.FUSO, 'HH:mm');
  return diasPermitidos_(cfg).indexOf(dia) >= 0 && hm >= cfg.HORA_INICIO && hm < cfg.HORA_FIM;
}

/** Devolve o primeiro instante >= d que esteja dentro da janela permitida. */
function proximaJanela_(d, cfg) {
  if (dentroJanela_(d, cfg)) return d;
  const dias = diasPermitidos_(cfg);
  const base = dataLocal_(d, cfg);
  for (let i = 0; i < 15; i++) {
    const ymd = somarDias_(base, i);
    const meioDia = Utilities.parseDate(ymd + ' 12:00', cfg.FUSO, 'yyyy-MM-dd HH:mm');
    const dia = parseInt(Utilities.formatDate(meioDia, cfg.FUSO, 'u'), 10);
    if (dias.indexOf(dia) < 0) continue;
    const inicio = Utilities.parseDate(ymd + ' ' + cfg.HORA_INICIO, cfg.FUSO, 'yyyy-MM-dd HH:mm');
    if (inicio.getTime() >= d.getTime()) return inicio;
  }
  return d;
}

/* ========================================================================== */
/* AUTENTICAÇÃO E USUÁRIOS                                                    */
/* ========================================================================== */

function usuarioPublico_(u) { return { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, ativo: u.ativo }; }

function login_(d) {
  const email = limpa_(d.email, 120).toLowerCase();
  const senha = String(d.senha || '');
  if (!email || !senha) throw erro_('Informe o login e a senha.');
  const cache = CacheService.getScriptCache();
  const chaveTentativas = 'lt_' + hash_(email).slice(0, 24);
  const tentativas = Number(cache.get(chaveTentativas) || 0);
  if (tentativas >= 5) throw erro_('Muitas tentativas incorretas. Aguarde 15 minutos e tente de novo.');
  const u = ler_(ABAS.USUARIOS).find(function (x) { return x.email === email && x.ativo === 'SIM'; });
  if (!u || hash_(u.salt + senha) !== u.senhaHash) {
    cache.put(chaveTentativas, String(tentativas + 1), 900);
    throw erro_('Login ou senha incorretos.');
  }
  cache.remove(chaveTentativas);
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('s_' + token, u.id, SESSAO_SEGUNDOS);
  return { token: token, usuario: usuarioPublico_(u), listas: LISTAS, config: configPublica_() };
}

function sessao_(token) {
  if (!token) throw erro_('SESSAO_EXPIRADA');
  const cache = CacheService.getScriptCache();
  const id = cache.get('s_' + token);
  if (!id) throw erro_('SESSAO_EXPIRADA');
  const u = ler_(ABAS.USUARIOS).find(function (x) { return x.id === id && x.ativo === 'SIM'; });
  if (!u) { cache.remove('s_' + token); throw erro_('SESSAO_EXPIRADA'); }
  cache.put('s_' + token, id, SESSAO_SEGUNDOS);
  const pub = usuarioPublico_(u);
  pub.token = token;
  return pub;
}

function me_(d, u) { return { usuario: usuarioPublico_(u), listas: LISTAS, config: configPublica_() }; }

function logout_(d, u) { CacheService.getScriptCache().remove('s_' + u.token); return true; }

function alterarSenha_(d, u) {
  const reg = ler_(ABAS.USUARIOS).find(function (x) { return x.id === u.id; });
  if (!reg || hash_(reg.salt + String(d.senhaAtual || '')) !== reg.senhaHash) throw erro_('A senha atual está incorreta.');
  definirSenha_(reg, String(d.novaSenha || ''));
  salvar_(ABAS.USUARIOS, reg);
  registrar_(u, '', 'USUARIO', u.id, 'Senha alterada', '');
  return true;
}

function definirSenha_(reg, senha) {
  if (senha.length < 8) throw erro_('A senha precisa ter pelo menos 8 caracteres.');
  reg.salt = Utilities.getUuid().replace(/-/g, '');
  reg.senhaHash = hash_(reg.salt + senha);
  reg.atualizadoEm = agoraISO_();
}

function listarUsuarios_() {
  return ler_(ABAS.USUARIOS).map(usuarioPublico_).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
}

function listarVendedores_() {
  return ler_(ABAS.USUARIOS).filter(function (x) { return x.ativo === 'SIM'; })
    .map(function (x) { return { id: x.id, nome: x.nome, perfil: x.perfil }; })
    .sort(function (a, b) { return a.nome.localeCompare(b.nome); });
}

function salvarUsuario_(d, u) {
  const usuarios = ler_(ABAS.USUARIOS);
  const nome = limpa_(d.nome, 80);
  const email = limpa_(d.email, 120).toLowerCase();
  const perfil = d.perfil === 'admin' ? 'admin' : 'vendedor';
  const ativo = d.ativo === 'NAO' ? 'NAO' : 'SIM';
  if (nome.length < 2) throw erro_('Informe o nome do usuário.');
  if (email.length < 3 || /\s/.test(email)) throw erro_('Informe um login válido (e-mail ou nome de usuário sem espaços).');
  if (usuarios.some(function (x) { return x.email === email && x.id !== d.id; })) throw erro_('Já existe um usuário com este login.');
  let reg;
  if (d.id) {
    reg = usuarios.find(function (x) { return x.id === d.id; });
    if (!reg) throw erro_('Usuário não encontrado.');
    const adminsAtivos = usuarios.filter(function (x) { return x.perfil === 'admin' && x.ativo === 'SIM' && x.id !== reg.id; });
    if (reg.perfil === 'admin' && (perfil !== 'admin' || ativo !== 'SIM') && adminsAtivos.length === 0) throw erro_('É preciso manter pelo menos um administrador ativo.');
    reg.nome = nome; reg.email = email; reg.perfil = perfil; reg.ativo = ativo; reg.atualizadoEm = agoraISO_();
    if (d.senha) definirSenha_(reg, String(d.senha));
    salvar_(ABAS.USUARIOS, reg);
    registrar_(u, '', 'USUARIO', reg.id, 'Usuário alterado', nome + ' (' + perfil + (ativo === 'SIM' ? '' : ', inativo') + ')' + (d.senha ? ' — senha redefinida' : ''));
  } else {
    reg = { id: novoId_('U'), nome: nome, email: email, perfil: perfil, ativo: ativo, criadoEm: agoraISO_() };
    definirSenha_(reg, String(d.senha || ''));
    inserir_(ABAS.USUARIOS, reg);
    registrar_(u, '', 'USUARIO', reg.id, 'Usuário criado', nome + ' (' + perfil + ')');
  }
  return usuarioPublico_(reg);
}

/* ========================================================================== */
/* HISTÓRICO / AUDITORIA                                                      */
/* ========================================================================== */

function registrar_(u, leadId, entidade, entidadeId, acao, detalhes) {
  inserir_(ABAS.HISTORICO, {
    id: novoId_('H'), dataHora: agoraISO_(), usuarioId: u.id, usuarioNome: u.nome,
    leadId: leadId || '', entidade: entidade, entidadeId: entidadeId || '', acao: acao, detalhes: limpa_(detalhes, 2000)
  });
}

/* ========================================================================== */
/* LEADS                                                                      */
/* ========================================================================== */

function podeVer_(lead, u) { return u.perfil === 'admin' || lead.responsavelId === u.id; }

function leadOuErro_(id, u) {
  const l = ler_(ABAS.LEADS).find(function (x) { return x.id === id; });
  if (!l) throw erro_('Lead não encontrado.');
  if (!podeVer_(l, u)) throw erro_('Permissão negada: este lead pertence a outro vendedor.');
  return l;
}

function agrupar_(lista, campo) {
  const m = {};
  lista.forEach(function (x) { (m[x[campo]] = m[x[campo]] || []).push(x); });
  return m;
}

function listarLeads_(d, u) {
  const orcsPorLead = agrupar_(ler_(ABAS.ORCAMENTOS), 'leadId');
  const termo = semAcento_(String(d.busca || '').toLowerCase().trim());
  const termoTel = String(d.busca || '').replace(/\D/g, '');
  let r = ler_(ABAS.LEADS).filter(function (l) { return podeVer_(l, u); });
  r = r.filter(function (l) { return d.arquivados ? l.arquivado === 'SIM' : l.arquivado !== 'SIM'; });
  ['status', 'servico', 'origem', 'tipoCliente', 'responsavelId'].forEach(function (c) {
    if (d[c]) r = r.filter(function (l) { return l[c] === d[c]; });
  });
  if (ymdOk_(d.de)) r = r.filter(function (l) { return l.dataSolicitacao >= d.de; });
  if (ymdOk_(d.ate)) r = r.filter(function (l) { return l.dataSolicitacao <= d.ate; });
  if (termo) {
    r = r.filter(function (l) {
      const texto = semAcento_((l.nome + ' ' + l.email + ' ' + l.endereco + ' ' + l.necessidade).toLowerCase());
      const numeros = (orcsPorLead[l.id] || []).map(function (o) { return o.numero.toLowerCase(); }).join(' ');
      return texto.indexOf(termo) >= 0 || numeros.indexOf(termo) >= 0 || (termoTel.length >= 4 && l.telefone.indexOf(termoTel) >= 0);
    });
  }
  r.sort(function (a, b) { return a.atualizadoEm < b.atualizadoEm ? 1 : -1; });
  return r.slice(0, 500).map(function (l) {
    const orcs = orcsPorLead[l.id] || [];
    return {
      id: l.id, nome: l.nome, telefone: l.telefone, servico: l.servico, tipoCliente: l.tipoCliente, origem: l.origem,
      status: l.status, responsavelNome: l.responsavelNome, ultimoContato: l.ultimoContato, proximoContato: l.proximoContato,
      dataSolicitacao: l.dataSolicitacao, consentimento: l.consentimento, bloqueado: l.bloqueado, arquivado: l.arquivado,
      anonimizado: l.anonimizado, valorEstimado: l.valorEstimado, qtdOrcamentos: orcs.length,
      valorAberto: orcs.filter(function (o) { return ORC_ABERTOS.indexOf(o.status) >= 0; }).reduce(function (s, o) { return s + num_(o.total); }, 0)
    };
  });
}

function obterLead_(d, u) {
  const l = leadOuErro_(d.id, u);
  const lead = Object.assign({}, l); delete lead._row;
  const orcamentos = ler_(ABAS.ORCAMENTOS).filter(function (o) { return o.leadId === l.id; })
    .sort(function (a, b) { return a.criadoEm < b.criadoEm ? 1 : -1; })
    .map(function (o) { const x = Object.assign({}, o); delete x._row; try { x.itens = JSON.parse(o.itens || '[]'); } catch (e) { x.itens = []; } return x; });
  const historico = ler_(ABAS.HISTORICO).filter(function (h) { return h.leadId === l.id; })
    .sort(function (a, b) { return a.dataHora < b.dataHora ? 1 : -1; })
    .map(function (h) { return { dataHora: h.dataHora, usuarioNome: h.usuarioNome, entidade: h.entidade, acao: h.acao, detalhes: h.detalhes }; });
  const mensagens = ler_(ABAS.FILA).filter(function (f) { return f.leadId === l.id; })
    .sort(function (a, b) { return a.agendadoPara < b.agendadoPara ? 1 : -1; })
    .map(function (f) { const x = Object.assign({}, f); delete x._row; return x; });
  lead.optout = leadEmOptOut_(l) ? 'SIM' : 'NAO';
  lead.textoWhatsApp = textoWhatsAppManual_(l, orcamentos, mensagens.filter(function (m) { return FILA_PENDENTES.indexOf(m.status) >= 0; }).reverse(), config_());
  return { lead: lead, orcamentos: orcamentos, historico: historico, mensagens: mensagens };
}

function salvarLead_(d, u) {
  const cfg = config_();
  const leads = ler_(ABAS.LEADS);
  const atual = d.id ? leadOuErro_(d.id, u) : null;
  if (atual && atual.anonimizado === 'SIM') throw erro_('Este lead foi anonimizado e não pode mais ser editado.');

  const nome = limpa_(d.nome, 120);
  if (nome.length < 3) throw erro_('Informe o nome completo do cliente.');
  const telefone = normalizarTelefone_(d.telefone);
  if (!telefoneValido_(telefone)) throw erro_('Telefone/WhatsApp inválido. Informe DDD + número, por exemplo (24) 99823-5101.');
  const email = limpa_(d.email, 120).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw erro_('E-mail inválido.');
  const tipoCliente = LISTAS.tipoCliente.indexOf(d.tipoCliente) >= 0 ? d.tipoCliente : '';
  const servico = LISTAS.servico.indexOf(d.servico) >= 0 ? d.servico : '';
  const origem = LISTAS.origem.indexOf(d.origem) >= 0 ? d.origem : '';
  if (!tipoCliente) throw erro_('Selecione o tipo de cliente.');
  if (!servico) throw erro_('Selecione o serviço de interesse.');
  if (!origem) throw erro_('Selecione a origem do contato.');
  const status = LISTAS.statusLead.indexOf(d.status) >= 0 ? d.status : 'Novo';

  const dup = leads.find(function (l) {
    return l.id !== d.id && l.anonimizado !== 'SIM' && (l.telefone === telefone || (email && l.email === email));
  });
  if (dup) {
    throw erro_('Cadastro duplicado: já existe o lead "' + dup.nome + '" com este ' + (dup.telefone === telefone ? 'telefone' : 'e-mail') + (dup.arquivado === 'SIM' ? ' (arquivado)' : '') + '.',
      { duplicadoId: podeVer_(dup, u) ? dup.id : null, duplicadoNome: dup.nome });
  }

  let resp = atual ? { id: atual.responsavelId, nome: atual.responsavelNome } : { id: u.id, nome: u.nome };
  if (u.perfil === 'admin' && d.responsavelId) {
    const v = ler_(ABAS.USUARIOS).find(function (x) { return x.id === d.responsavelId && x.ativo === 'SIM'; });
    if (!v) throw erro_('Responsável comercial inválido.');
    resp = { id: v.id, nome: v.nome };
  }

  const consentimento = d.consentimento === 'SIM' ? 'SIM' : 'NAO';
  const consentimentoOrigem = consentimento === 'SIM' ? limpa_(d.consentimentoOrigem, 80) : (atual ? atual.consentimentoOrigem : '');
  let consentimentoData = atual ? atual.consentimentoData : '';
  if (consentimento === 'SIM') {
    if (!consentimentoOrigem) throw erro_('Informe como o cliente autorizou receber mensagens pelo WhatsApp.');
    if (!atual || atual.consentimento !== 'SIM') {
      if (estaEmOptOut_(telefone) || (email && estaEmOptOut_(email))) throw erro_('Este contato pediu para não receber mensagens. Só um administrador pode retirá-lo dessa lista, e apenas se o próprio cliente pedir.');
      consentimentoData = ymdOk_(d.consentimentoData) || hoje_(cfg);
    }
  }

  const antes = atual ? Object.assign({}, atual) : null;
  const obj = atual || {
    id: novoId_('L'), criadoEm: agoraISO_(), criadoPor: u.nome, bloqueado: 'NAO', arquivado: 'NAO',
    anonimizado: 'NAO', proximoAuto: 'NAO', ultimoContato: '', proximoContato: ''
  };
  Object.assign(obj, {
    nome: nome, telefone: telefone, email: email, tipoCliente: tipoCliente, servico: servico,
    endereco: limpa_(d.endereco, 200), dataSolicitacao: ymdOk_(d.dataSolicitacao) || (antes ? antes.dataSolicitacao : '') || hoje_(cfg),
    origem: origem, necessidade: limpa_(d.necessidade, 2000), valorEstimado: String(dinheiro_(d.valorEstimado)),
    responsavelId: resp.id, responsavelNome: resp.nome, status: status,
    consentimento: consentimento, consentimentoOrigem: consentimentoOrigem, consentimentoData: consentimentoData,
    atualizadoEm: agoraISO_()
  });
  if (d.proximoContato !== undefined) {
    const pc = ymdOk_(d.proximoContato);
    if (!antes || pc !== antes.proximoContato) { obj.proximoContato = pc; obj.proximoAuto = 'NAO'; }
  }
  if (LEAD_ENCERRADOS.indexOf(status) >= 0) {
    if (!antes || antes.status !== status) obj.encerradoEm = agoraISO_();
  } else obj.encerradoEm = '';

  if (!atual) {
    inserir_(ABAS.LEADS, obj);
    registrar_(u, obj.id, 'LEAD', obj.id, 'Lead cadastrado', nome + ' — ' + servico + ' (' + origem + ')' + (consentimento === 'SIM' ? ' — autorização WhatsApp: ' + consentimentoOrigem : ''));
  } else {
    salvar_(ABAS.LEADS, obj);
    const mudancas = Object.keys(ROTULOS_LEAD).filter(function (k) { return String(antes[k]) !== String(obj[k]); })
      .map(function (k) { return ROTULOS_LEAD[k] + ': "' + String(antes[k]).slice(0, 60) + '" → "' + String(obj[k]).slice(0, 60) + '"'; });
    if (mudancas.length) registrar_(u, obj.id, 'LEAD', obj.id, 'Lead alterado', mudancas.join('; '));
  }

  if (antes && antes.consentimento === 'SIM' && consentimento !== 'SIM') {
    cancelarPendentes_({ leadId: obj.id }, 'Autorização de mensagens retirada', u);
  }
  if (LEAD_ENCERRADOS.indexOf(status) >= 0 && (!antes || antes.status !== status)) {
    cancelarPendentes_({ leadId: obj.id }, 'Lead marcado como ' + status, u);
  }
  if (antes && antes.consentimento !== 'SIM' && consentimento === 'SIM') {
    ler_(ABAS.ORCAMENTOS).filter(function (o) { return o.leadId === obj.id && ORC_ATIVOS_FOLLOWUP.indexOf(o.status) >= 0; })
      .forEach(function (o) { agendarSequencia_(o, obj, u); });
  }
  return { id: obj.id };
}

function arquivarLead_(d, u) {
  const l = leadOuErro_(d.id, u);
  const arquivar = !!d.arquivar;
  l.arquivado = arquivar ? 'SIM' : 'NAO';
  l.atualizadoEm = agoraISO_();
  salvar_(ABAS.LEADS, l);
  registrar_(u, l.id, 'LEAD', l.id, arquivar ? 'Lead arquivado' : 'Lead reativado', limpa_(d.motivo, 300));
  if (arquivar) cancelarPendentes_({ leadId: l.id }, 'Lead arquivado', u);
  return true;
}

function registrarContato_(d, u) {
  const cfg = config_();
  const l = leadOuErro_(d.leadId, u);
  const tipo = LISTAS.tipoContato.indexOf(d.tipo) >= 0 ? d.tipo : 'Observação';
  const descricao = limpa_(d.descricao, 2000);
  if (!descricao) throw erro_('Descreva o contato ou a observação.');
  if (tipo !== 'Observação') {
    l.ultimoContato = hoje_(cfg);
    if (l.status === 'Novo' && !d.status) { l.status = 'Em contato'; registrar_(u, l.id, 'LEAD', l.id, 'Status alterado', 'Novo → Em contato'); }
  }
  if (d.proximoContato !== undefined && d.proximoContato !== null) {
    l.proximoContato = ymdOk_(d.proximoContato);
    l.proximoAuto = 'NAO';
  }
  if (d.status && LISTAS.statusLead.indexOf(d.status) >= 0 && d.status !== l.status) {
    const ant = l.status;
    l.status = d.status;
    l.encerradoEm = LEAD_ENCERRADOS.indexOf(d.status) >= 0 ? agoraISO_() : '';
    registrar_(u, l.id, 'LEAD', l.id, 'Status alterado', ant + ' → ' + d.status);
    if (LEAD_ENCERRADOS.indexOf(d.status) >= 0) cancelarPendentes_({ leadId: l.id }, 'Lead marcado como ' + d.status, u);
  }
  l.atualizadoEm = agoraISO_();
  salvar_(ABAS.LEADS, l);
  registrar_(u, l.id, 'CONTATO', '', tipo, descricao + (l.proximoContato && l.proximoAuto === 'NAO' ? ' — próximo contato: ' + br_(l.proximoContato) : ''));
  if (d.clienteRespondeu) clienteRespondeuInterno_(l, u, 'Registrado junto com o contato (' + tipo + ')');
  return true;
}

function clienteRespondeu_(d, u) {
  const l = leadOuErro_(d.leadId, u);
  clienteRespondeuInterno_(l, u, limpa_(d.observacao, 500) || 'Marcado manualmente');
  return true;
}

function clienteRespondeuInterno_(l, u, obs) {
  const cfg = config_();
  const n = cancelarPendentes_({ leadId: l.id }, 'Cliente respondeu', u);
  ler_(ABAS.ORCAMENTOS).filter(function (o) { return o.leadId === l.id && ORC_ATIVOS_FOLLOWUP.indexOf(o.status) >= 0; })
    .forEach(function (o) {
      o.status = 'Negociação'; o.atualizadoEm = agoraISO_();
      salvar_(ABAS.ORCAMENTOS, o);
      registrar_(u, l.id, 'ORCAMENTO', o.id, 'Orçamento em negociação', o.numero + ' — cliente respondeu');
    });
  if (['Novo', 'Em contato', 'Orçamento enviado'].indexOf(l.status) >= 0) {
    const temOrc = ler_(ABAS.ORCAMENTOS).some(function (o) { return o.leadId === l.id; });
    l.status = temOrc ? 'Negociação' : 'Em contato';
  }
  l.ultimoContato = hoje_(cfg);
  l.atualizadoEm = agoraISO_();
  salvar_(ABAS.LEADS, l);
  registrar_(u, l.id, 'LEAD', l.id, 'Cliente respondeu', obs + (n ? ' — ' + n + ' acompanhamento(s) automático(s) pausado(s)' : ''));
}

function bloquearLead_(d, u) {
  const l = leadOuErro_(d.leadId, u);
  const bloquear = !!d.bloquear;
  l.bloqueado = bloquear ? 'SIM' : 'NAO';
  l.motivoBloqueio = bloquear ? (limpa_(d.motivo, 200) || 'Bloqueio manual') : '';
  l.atualizadoEm = agoraISO_();
  salvar_(ABAS.LEADS, l);
  registrar_(u, l.id, 'LEAD', l.id, bloquear ? 'Envios bloqueados' : 'Envios desbloqueados', l.motivoBloqueio);
  if (bloquear) cancelarPendentes_({ leadId: l.id }, 'Bloqueio manual de envios', u);
  return true;
}

function optoutLead_(d, u) {
  const l = leadOuErro_(d.leadId, u);
  const motivo = limpa_(d.motivo, 200) || 'Cliente pediu para não receber mensagens';
  adicionarOptOut_(l.telefone, motivo, 'Manual', u);
  l.consentimento = 'NAO';
  l.bloqueado = 'SIM';
  l.motivoBloqueio = motivo;
  l.atualizadoEm = agoraISO_();
  salvar_(ABAS.LEADS, l);
  cancelarPendentes_({ leadId: l.id }, 'Cliente não deseja receber mensagens', u);
  registrar_(u, l.id, 'LEAD', l.id, 'Incluído na lista de não contatar', motivo);
  return true;
}

function anonimizarLead_(d, u) {
  const l = leadOuErro_(d.id, u);
  if (l.anonimizado === 'SIM') throw erro_('Este lead já foi anonimizado.');
  const telOriginal = l.telefone;
  cancelarPendentes_({ leadId: l.id }, 'Dados anonimizados (LGPD)', u);
  // Se o número estava na lista de não contatar, mantém só um hash (sem o telefone em claro)
  const regOptOut = telOriginal ? ler_(ABAS.OPTOUT).find(function (o) { return o.telefone === telOriginal; }) : null;
  if (regOptOut) { regOptOut.telefone = 'h:' + hash_(telOriginal); regOptOut.motivo = 'Titular anonimizado (LGPD)'; salvar_(ABAS.OPTOUT, regOptOut); }
  Object.assign(l, {
    nome: 'Titular anonimizado ' + l.id.slice(-5), telefone: '', email: '', endereco: '', necessidade: '',
    consentimento: 'NAO', consentimentoOrigem: '', bloqueado: 'SIM', motivoBloqueio: 'Anonimizado (LGPD)',
    arquivado: 'SIM', anonimizado: 'SIM', atualizadoEm: agoraISO_()
  });
  salvar_(ABAS.LEADS, l);
  ler_(ABAS.FILA).filter(function (f) { return f.leadId === l.id; }).forEach(function (f) { f.telefone = ''; f.texto = ''; salvar_(ABAS.FILA, f); });
  ler_(ABAS.HISTORICO).filter(function (h) { return h.leadId === l.id; }).forEach(function (h) { h.detalhes = '[dados anonimizados]'; salvar_(ABAS.HISTORICO, h); });
  ler_(ABAS.ORCAMENTOS).filter(function (o) { return o.leadId === l.id; }).forEach(function (o) { o.observacoes = ''; salvar_(ABAS.ORCAMENTOS, o); });
  registrar_(u, l.id, 'LEAD', l.id, 'Dados anonimizados (LGPD)', limpa_(d.motivo, 300) || 'Solicitação do titular');
  return true;
}

/* ---------------------------- Lista de não contatar ----------------------- */

function leadEmOptOut_(lead, lista) {
  lista = lista || ler_(ABAS.OPTOUT);
  return estaEmOptOut_(lead.telefone, lista) || estaEmOptOut_(String(lead.email || '').toLowerCase(), lista);
}

function estaEmOptOut_(telefone, lista) {
  if (!telefone) return false;
  const h = 'h:' + hash_(telefone);
  return (lista || ler_(ABAS.OPTOUT)).some(function (o) { return o.telefone === telefone || o.telefone === h; });
}

function adicionarOptOut_(telefone, motivo, origem, u) {
  if (!telefone) return;
  if (ler_(ABAS.OPTOUT).some(function (o) { return o.telefone === telefone; })) return;
  inserir_(ABAS.OPTOUT, { telefone: telefone, motivo: motivo, origem: origem, data: agoraISO_(), usuario: u.nome });
}

function listarOptOut_() {
  return ler_(ABAS.OPTOUT).map(function (o) {
    return { telefone: o.telefone.indexOf('h:') === 0 ? '(anonimizado)' : o.telefone, chave: o.telefone, motivo: o.motivo, origem: o.origem, data: o.data, usuario: o.usuario };
  }).reverse();
}

function removerOptOut_(d, u) {
  const sh = aba_(ABAS.OPTOUT);
  const reg = ler_(ABAS.OPTOUT).find(function (o) { return o.telefone === d.chave; });
  if (!reg) throw erro_('Número não encontrado na lista.');
  if (reg.telefone.indexOf('h:') === 0) throw erro_('Registros de titulares anonimizados não podem ser removidos.');
  sh.deleteRow(reg._row);
  registrar_(u, '', 'OPTOUT', '', 'Número retirado da lista de não contatar', reg.telefone + ' — ' + limpa_(d.motivo, 200));
  return true;
}

/* ========================================================================== */
/* ORÇAMENTOS                                                                 */
/* ========================================================================== */

function proximoNumero_(cfg) {
  const n = (parseInt(cfg.SEQ_ORCAMENTO, 10) || 0) + 1;
  definirConfig_('SEQ_ORCAMENTO', n);
  return 'ORC-' + hoje_(cfg).slice(0, 4) + '-' + ('000' + n).slice(-4);
}

function salvarOrcamento_(d, u) {
  const cfg = config_();
  const lead = leadOuErro_(d.leadId, u);
  if (lead.anonimizado === 'SIM') throw erro_('Este lead foi anonimizado.');
  const todos = ler_(ABAS.ORCAMENTOS);
  const atual = d.id ? todos.find(function (o) { return o.id === d.id && o.leadId === lead.id; }) : null;
  if (d.id && !atual) throw erro_('Orçamento não encontrado.');

  const itensIn = Array.isArray(d.itens) ? d.itens : [];
  const itens = itensIn.map(function (i) {
    return { descricao: limpa_(i.descricao, 200), qtd: num_(i.qtd), valorUnit: dinheiro_(i.valorUnit) };
  }).filter(function (i) { return i.descricao; });
  if (!itens.length) throw erro_('Inclua pelo menos um serviço ou equipamento no orçamento.');
  if (itens.some(function (i) { return !(i.qtd > 0) || i.valorUnit < 0; })) throw erro_('Confira as quantidades e os valores dos itens.');
  const subtotal = dinheiro_(itens.reduce(function (s, i) { return s + i.qtd * i.valorUnit; }, 0));
  const desconto = dinheiro_(d.desconto);
  if (desconto < 0 || desconto > subtotal) throw erro_('O desconto precisa estar entre zero e o subtotal.');
  const total = dinheiro_(subtotal - desconto);
  const status = LISTAS.statusOrcamento.indexOf(d.status) >= 0 ? d.status : 'Em preparação';
  let dataEnvio = ymdOk_(d.dataEnvio);
  if (!dataEnvio && status !== 'Em preparação') dataEnvio = hoje_(cfg);
  let validade = ymdOk_(d.validade);
  if (!validade && dataEnvio) validade = somarDias_(dataEnvio, parseInt(cfg.VALIDADE_PADRAO_DIAS, 10) || 15);

  const antes = atual ? Object.assign({}, atual) : null;
  const obj = atual || { id: novoId_('O'), numero: proximoNumero_(cfg), leadId: lead.id, geracao: '1', criadoEm: agoraISO_(), criadoPor: u.nome };
  Object.assign(obj, {
    itens: JSON.stringify(itens), subtotal: String(subtotal), desconto: String(desconto), total: String(total),
    condicoesPagamento: limpa_(d.condicoesPagamento, 500), dataEnvio: dataEnvio, validade: validade,
    observacoes: limpa_(d.observacoes, 2000), status: status, atualizadoEm: agoraISO_()
  });
  if (ORC_ENCERRADOS.indexOf(status) >= 0) { if (!antes || antes.status !== status) obj.encerradoEm = agoraISO_(); }
  else obj.encerradoEm = '';

  const resumo = obj.numero + ' — ' + itens.length + ' item(ns), total R$ ' + total.toFixed(2).replace('.', ',') + ' — ' + status;
  if (!atual) { inserir_(ABAS.ORCAMENTOS, obj); registrar_(u, lead.id, 'ORCAMENTO', obj.id, 'Orçamento criado', resumo); }
  else { salvar_(ABAS.ORCAMENTOS, obj); registrar_(u, lead.id, 'ORCAMENTO', obj.id, 'Orçamento atualizado', resumo + (antes.status !== status ? ' (antes: ' + antes.status + ')' : '')); }

  const mudouStatus = !antes || antes.status !== status;
  if (mudouStatus) {
    const eraAtivo = antes && ORC_ATIVOS_FOLLOWUP.indexOf(antes.status) >= 0;
    if (ORC_ATIVOS_FOLLOWUP.indexOf(status) >= 0 && !eraAtivo) agendarSequencia_(obj, lead, u);
    if (ORC_ATIVOS_FOLLOWUP.indexOf(status) < 0) cancelarPendentes_({ orcamentoId: obj.id }, 'Orçamento ' + status.toLowerCase(), u);

    let novoStatusLead = null;
    if (status === 'Aprovado') novoStatusLead = 'Ganho';
    else if (status === 'Negociação') novoStatusLead = 'Negociação';
    else if (ORC_ATIVOS_FOLLOWUP.indexOf(status) >= 0 && ['Novo', 'Em contato'].indexOf(lead.status) >= 0) novoStatusLead = 'Orçamento enviado';
    else if (status === 'Recusado' || status === 'Expirado') {
      const outrosVivos = ler_(ABAS.ORCAMENTOS).filter(function (o) { return o.leadId === lead.id && o.id !== obj.id && ['Recusado', 'Expirado'].indexOf(o.status) < 0; });
      if (!outrosVivos.length && lead.status !== 'Ganho') novoStatusLead = 'Perdido';
    }
    if (status !== 'Em preparação' && dataEnvio && (!lead.ultimoContato || dataEnvio > lead.ultimoContato)) lead.ultimoContato = dataEnvio;
    if (novoStatusLead && novoStatusLead !== lead.status) {
      const ant = lead.status;
      lead.status = novoStatusLead;
      lead.encerradoEm = LEAD_ENCERRADOS.indexOf(novoStatusLead) >= 0 ? agoraISO_() : '';
      registrar_(u, lead.id, 'LEAD', lead.id, 'Status alterado', ant + ' → ' + novoStatusLead + ' (pelo orçamento ' + obj.numero + ')');
      if (LEAD_ENCERRADOS.indexOf(novoStatusLead) >= 0) cancelarPendentes_({ leadId: lead.id }, 'Lead marcado como ' + novoStatusLead, u);
    }
    lead.atualizadoEm = agoraISO_();
    salvar_(ABAS.LEADS, lead);
  }
  return { id: obj.id, numero: obj.numero };
}

function reiniciarAcompanhamento_(d, u) {
  const cfg = config_();
  const orc = ler_(ABAS.ORCAMENTOS).find(function (o) { return o.id === d.orcamentoId; });
  if (!orc) throw erro_('Orçamento não encontrado.');
  const lead = leadOuErro_(orc.leadId, u);
  if (ORC_ATIVOS_FOLLOWUP.indexOf(orc.status) < 0) throw erro_('Para reiniciar o acompanhamento, o orçamento precisa estar como "Enviado" ou "Aguardando resposta".');
  const motivo = bloqueioEnvio_(lead, cfg, null, cfg.CANAL);
  if (motivo) throw erro_('Não é possível agendar: ' + motivo + '.');
  cancelarPendentes_({ orcamentoId: orc.id }, 'Sequência reiniciada', u);
  orc.geracao = String((parseInt(orc.geracao, 10) || 1) + 1);
  orc.atualizadoEm = agoraISO_();
  salvar_(ABAS.ORCAMENTOS, orc);
  const n = agendarSequencia_(orc, lead, u, hoje_(cfg));
  if (!n) throw erro_('Nenhuma etapa foi agendada. Confira se há modelos ativos e intervalos configurados.');
  return { agendadas: n };
}

/* ========================================================================== */
/* FOLLOW-UP: agendamento, modelos e fila                                     */
/* ========================================================================== */

/** Motivo pelo qual o lead não pode receber mensagens automáticas ('' = pode). */
function bloqueioEnvio_(lead, cfg, listaOptOut, canal) {
  canal = canal || cfg.CANAL || 'EMAIL';
  if (lead.anonimizado === 'SIM') return 'dados anonimizados';
  if (lead.arquivado === 'SIM') return 'lead arquivado';
  if (lead.bloqueado === 'SIM') return 'envios bloqueados para este lead' + (lead.motivoBloqueio ? ' (' + lead.motivoBloqueio + ')' : '');
  if (lead.consentimento !== 'SIM') return 'cliente sem autorização registrada para receber mensagens';
  if (LEAD_ENCERRADOS.indexOf(lead.status) >= 0) return 'lead já encerrado (' + lead.status + ')';
  if (canal === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email || '')) return 'cliente sem e-mail cadastrado';
  if (canal !== 'EMAIL' && !telefoneValido_(lead.telefone)) return 'telefone inválido';
  if (leadEmOptOut_(lead, listaOptOut)) return 'contato na lista de não contatar';
  return '';
}

function primeiroNome_(s) {
  const p = String(s || '').trim().split(/\s+/)[0] || '';
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

function variaveis_(lead, orc, cfg) {
  return {
    NOME: primeiroNome_(lead.nome),
    NOME_COMPLETO: lead.nome,
    SERVICO: SERVICO_TEXTO[lead.servico] || String(lead.servico || 'segurança').toLowerCase(),
    EMPRESA: cfg.EMPRESA,
    ORCAMENTO: orc ? orc.numero : '',
    VENDEDOR: primeiroNome_(lead.responsavelNome)
  };
}

function renderizar_(corpo, v) {
  return String(corpo || '').replace(/\[([A-Z_]+)\]/g, function (m, k) { return v[k] !== undefined ? v[k] : m; });
}

function parametrosMeta_(corpo, v) {
  return (String(corpo || '').match(/\[([A-Z_]+)\]/g) || []).map(function (t) {
    const val = String(v[t.slice(1, -1)] || '-').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
    return { type: 'text', text: val || '-' };
  });
}

function textoMeta_(corpo) {
  let i = 0;
  return String(corpo || '').replace(/\[([A-Z_]+)\]/g, function () { i++; return '{{' + i + '}}'; });
}

function agendarSequencia_(orc, lead, u, baseYmd) {
  const cfg = config_();
  if (ORC_ATIVOS_FOLLOWUP.indexOf(orc.status) < 0) return 0;
  const canal = cfg.CANAL === 'WHATSAPP' ? 'WHATSAPP' : 'EMAIL';
  const motivo = bloqueioEnvio_(lead, cfg, null, canal);
  if (motivo) {
    registrar_(u, lead.id, 'FOLLOWUP', orc.id, 'Acompanhamento automático não agendado', motivo);
    return 0;
  }
  const base = baseYmd || orc.dataEnvio || hoje_(cfg);
  const chaves = {};
  ler_(ABAS.FILA).forEach(function (f) { chaves[f.chave] = true; });
  const modelos = ler_(ABAS.MODELOS).filter(function (m) { return m.ativo === 'SIM'; });
  const agora = new Date();
  const v = variaveis_(lead, orc, cfg);
  const agendadas = [], puladas = [];
  [1, 2, 3].forEach(function (etapa) {
    const dias = parseInt(cfg['DIAS_ETAPA_' + etapa], 10);
    if (!(dias > 0)) return;
    const mod = modelos.find(function (m) { return String(m.etapa) === String(etapa); });
    if (!mod) { puladas.push('etapa ' + etapa + ': sem modelo ativo'); return; }
    const chave = orc.id + '-G' + (orc.geracao || '1') + '-E' + etapa;
    if (chaves[chave]) return;
    let quando = Utilities.parseDate(somarDias_(base, dias) + ' ' + cfg.HORA_PREFERIDA, cfg.FUSO, 'yyyy-MM-dd HH:mm');
    quando = proximaJanela_(quando, cfg);
    if (quando.getTime() < agora.getTime()) { puladas.push('etapa ' + etapa + ': data já passou'); return; }
    inserir_(ABAS.FILA, {
      id: novoId_('F'), chave: chave, leadId: lead.id, orcamentoId: orc.id, etapa: String(etapa), modeloId: mod.id,
      telefone: lead.telefone, agendadoPara: quando.toISOString(),
      status: cfg.REQUER_APROVACAO === 'SIM' ? 'AGUARDANDO_APROVACAO' : 'PENDENTE',
      tentativas: '0', texto: renderizar_(mod.corpo, v), modo: cfg.MODO_TESTE === 'SIM' ? 'TESTE' : 'REAL',
      criadoEm: agoraISO_(), atualizadoEm: agoraISO_(), canal: canal
    });
    agendadas.push(etapa + 'ª em ' + Utilities.formatDate(quando, cfg.FUSO, 'dd/MM HH:mm'));
  });
  if (agendadas.length) registrar_(u, lead.id, 'FOLLOWUP', orc.id, 'Acompanhamento automático agendado (' + (canal === 'EMAIL' ? 'e-mail' : 'WhatsApp') + ')', orc.numero + ': ' + agendadas.join(', ') + (cfg.REQUER_APROVACAO === 'SIM' ? ' (aguardando aprovação)' : ''));
  if (puladas.length) registrar_(u, lead.id, 'FOLLOWUP', orc.id, 'Etapas não agendadas', puladas.join('; '));
  recalcularProximo_(lead.id);
  return agendadas.length;
}

function cancelarPendentes_(filtro, motivo, u) {
  const afetados = {};
  let n = 0;
  ler_(ABAS.FILA).forEach(function (f) {
    if (FILA_PENDENTES.indexOf(f.status) < 0) return;
    if (filtro.leadId && f.leadId !== filtro.leadId) return;
    if (filtro.orcamentoId && f.orcamentoId !== filtro.orcamentoId) return;
    f.status = 'CANCELADO';
    f.erro = motivo;
    f.atualizadoEm = agoraISO_();
    salvar_(ABAS.FILA, f);
    afetados[f.leadId] = (afetados[f.leadId] || 0) + 1;
    n++;
  });
  Object.keys(afetados).forEach(function (leadId) {
    registrar_(u, leadId, 'FOLLOWUP', '', 'Acompanhamentos cancelados', afetados[leadId] + ' mensagem(ns) — ' + motivo);
    recalcularProximo_(leadId);
  });
  return n;
}

function recalcularProximo_(leadId) {
  const cfg = config_();
  const lead = ler_(ABAS.LEADS).find(function (l) { return l.id === leadId; });
  if (!lead) return;
  const pend = ler_(ABAS.FILA).filter(function (f) { return f.leadId === leadId && FILA_PENDENTES.indexOf(f.status) >= 0; })
    .sort(function (a, b) { return a.agendadoPara < b.agendadoPara ? -1 : 1; });
  const antes = lead.proximoContato + '|' + lead.proximoAuto;
  if (pend.length) { lead.proximoContato = dataLocal_(pend[0].agendadoPara, cfg); lead.proximoAuto = 'SIM'; }
  else if (lead.proximoAuto === 'SIM') { lead.proximoContato = ''; lead.proximoAuto = 'NAO'; }
  if (antes !== lead.proximoContato + '|' + lead.proximoAuto) salvar_(ABAS.LEADS, lead);
}

/* ---------------------------- Modelos de mensagem ------------------------- */

function listarModelos_() {
  return ler_(ABAS.MODELOS).map(function (m) {
    const x = Object.assign({}, m); delete x._row;
    x.textoMeta = textoMeta_(m.corpo);
    x.variaveis = (m.corpo.match(/\[([A-Z_]+)\]/g) || []).map(function (t) { return t.slice(1, -1); });
    return x;
  }).sort(function (a, b) { return (a.etapa + a.nome).localeCompare(b.etapa + b.nome); });
}

function salvarModelo_(d, u) {
  const nome = limpa_(d.nome, 80);
  const etapa = parseInt(d.etapa, 10);
  const templateMeta = limpa_(d.templateMeta, 512);
  const idioma = limpa_(d.idioma, 10) || 'pt_BR';
  const corpo = limpa_(d.corpo, 1024);
  const assunto = limpa_(d.assunto, 150);
  if (nome.length < 3) throw erro_('Dê um nome ao modelo.');
  if (assunto.length < 3) throw erro_('Escreva o assunto do e-mail.');
  const varsAssunto = (assunto.match(/\[([A-Z_]+)\]/g) || []).map(function (x) { return x.slice(1, -1); }).filter(function (k) { return LISTAS.variaveis.indexOf(k) < 0; });
  if (varsAssunto.length) throw erro_('Variáveis desconhecidas no assunto: ' + varsAssunto.join(', '));
  if ([1, 2, 3].indexOf(etapa) < 0) throw erro_('A etapa precisa ser 1, 2 ou 3.');
  if (!/^[a-z0-9_]+$/.test(templateMeta)) throw erro_('O nome do modelo na Meta deve ter apenas letras minúsculas, números e "_" (ex.: followup_orcamento_1).');
  if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(idioma)) throw erro_('Idioma inválido (use pt_BR).');
  if (corpo.length < 10) throw erro_('Escreva o texto da mensagem.');
  const desconhecidas = (corpo.match(/\[([A-Z_]+)\]/g) || []).map(function (t) { return t.slice(1, -1); })
    .filter(function (k) { return LISTAS.variaveis.indexOf(k) < 0; });
  if (desconhecidas.length) throw erro_('Variáveis desconhecidas: ' + desconhecidas.join(', ') + '. Use: ' + LISTAS.variaveis.map(function (v) { return '[' + v + ']'; }).join(' '));
  if (/^\s*\[/.test(corpo) || /\]\s*[.!?]?\s*$/.test(corpo)) throw erro_('A Meta não aceita mensagens que começam ou terminam com uma variável. Ajuste o início ou o final do texto.');
  let m = d.id ? ler_(ABAS.MODELOS).find(function (x) { return x.id === d.id; }) : null;
  if (d.id && !m) throw erro_('Modelo não encontrado.');
  const novo = !m;
  m = m || { id: novoId_('M') };
  Object.assign(m, { nome: nome, etapa: String(etapa), templateMeta: templateMeta, idioma: idioma, corpo: corpo, assunto: assunto, ativo: d.ativo === 'NAO' ? 'NAO' : 'SIM', atualizadoEm: agoraISO_() });
  if (novo) inserir_(ABAS.MODELOS, m); else salvar_(ABAS.MODELOS, m);
  registrar_(u, '', 'MODELO', m.id, novo ? 'Modelo criado' : 'Modelo alterado', nome + ' (etapa ' + etapa + ', ' + templateMeta + ')' + (m.ativo === 'SIM' ? '' : ' — inativo'));
  return { id: m.id };
}

/* ---------------------------- Fila (tela) --------------------------------- */

function listarFila_(d, u) {
  const leads = {};
  ler_(ABAS.LEADS).forEach(function (l) { leads[l.id] = l; });
  const orcs = {};
  ler_(ABAS.ORCAMENTOS).forEach(function (o) { orcs[o.id] = o; });
  const visiveis = ler_(ABAS.FILA).filter(function (f) { return leads[f.leadId] && podeVer_(leads[f.leadId], u); });
  const contagem = {};
  visiveis.forEach(function (f) { contagem[f.status] = (contagem[f.status] || 0) + 1; });
  let r = visiveis;
  if (d.status) r = r.filter(function (f) { return f.status === d.status; });
  r.sort(function (a, b) {
    const pa = FILA_PENDENTES.indexOf(a.status) >= 0, pb = FILA_PENDENTES.indexOf(b.status) >= 0;
    if (pa !== pb) return pa ? -1 : 1;
    return pa ? (a.agendadoPara < b.agendadoPara ? -1 : 1) : (a.atualizadoEm < b.atualizadoEm ? 1 : -1);
  });
  return {
    contagem: contagem,
    itens: r.slice(0, 300).map(function (f) {
      const l = leads[f.leadId], o = orcs[f.orcamentoId];
      return {
        id: f.id, leadId: f.leadId, leadNome: l.nome, telefone: f.telefone, orcamentoNumero: o ? o.numero : '', etapa: f.etapa,
        agendadoPara: f.agendadoPara, status: f.status, tentativas: f.tentativas, ultimaTentativa: f.ultimaTentativa,
        statusEntrega: f.statusEntrega, erro: f.erro, texto: f.texto, modo: f.modo, aprovadoPor: f.aprovadoPor, responsavelNome: l.responsavelNome,
        canal: f.canal || 'WHATSAPP', email: l.email
      };
    })
  };
}

function aprovarFila_(d, u) {
  const ids = Array.isArray(d.ids) ? d.ids : [];
  let n = 0;
  ler_(ABAS.FILA).forEach(function (f) {
    if (f.status !== 'AGUARDANDO_APROVACAO') return;
    if (!d.todos && ids.indexOf(f.id) < 0) return;
    f.status = 'PENDENTE'; f.aprovadoPor = u.nome; f.atualizadoEm = agoraISO_();
    salvar_(ABAS.FILA, f);
    registrar_(u, f.leadId, 'FOLLOWUP', f.id, 'Mensagem aprovada', 'Etapa ' + f.etapa + ' — ' + br_(f.agendadoPara));
    n++;
  });
  return { aprovadas: n };
}

function cancelarFila_(d, u) {
  const ids = Array.isArray(d.ids) ? d.ids : [];
  const leads = {};
  ler_(ABAS.LEADS).forEach(function (l) { leads[l.id] = l; });
  let n = 0;
  ler_(ABAS.FILA).forEach(function (f) {
    if (ids.indexOf(f.id) < 0) return;
    if (FILA_PENDENTES.indexOf(f.status) < 0 && f.status !== 'VERIFICAR') return;
    if (!leads[f.leadId] || !podeVer_(leads[f.leadId], u)) return;
    f.status = 'CANCELADO'; f.erro = limpa_(d.motivo, 200) || 'Cancelado manualmente'; f.atualizadoEm = agoraISO_();
    salvar_(ABAS.FILA, f);
    registrar_(u, f.leadId, 'FOLLOWUP', f.id, 'Mensagem cancelada', 'Etapa ' + f.etapa + ' — ' + f.erro);
    recalcularProximo_(f.leadId);
    n++;
  });
  return { canceladas: n };
}

function reprocessarFila_(d, u) {
  const f = ler_(ABAS.FILA).find(function (x) { return x.id === d.id; });
  if (!f) throw erro_('Mensagem não encontrada.');
  if (['VERIFICAR', 'FALHA'].indexOf(f.status) < 0) throw erro_('Só é possível reenviar mensagens com falha ou em verificação.');
  f.status = 'PENDENTE'; f.agendadoPara = agoraISO_(); f.erro = ''; f.tentativas = '0'; f.aprovadoPor = u.nome; f.atualizadoEm = agoraISO_();
  salvar_(ABAS.FILA, f);
  registrar_(u, f.leadId, 'FOLLOWUP', f.id, 'Reenvio autorizado manualmente', 'Etapa ' + f.etapa + ' — o usuário confirmou que a mensagem anterior não chegou');
  recalcularProximo_(f.leadId);
  return true;
}

function processarAgora_() { return processarFila_(); }

/* ========================================================================== */
/* PROCESSADOR DA FILA (gatilho a cada 10 minutos)                            */
/* ========================================================================== */

function processarFila() {
  try { return processarFila_(); }
  catch (e) { console.error('processarFila: ' + (e.stack || e)); return { erro: String(e) }; }
}

function processarFila_() {
  limparMemo_();
  const cfg = config_();
  const res = { enviados: 0, simulados: 0, falhas: 0, cancelados: 0, reagendados: 0, verificar: 0, mensagem: '' };
  if (cfg.DETECTAR_RESPOSTA_EMAIL === 'SIM') {
    try { res.respostasEmail = verificarRespostasEmail_(cfg); } catch (e) { console.error('Respostas por e-mail: ' + e); }
    limparMemo_();
  }
  if (cfg.ENVIOS_PAUSADOS === 'SIM') { res.mensagem = 'Envios pausados pelo bloqueio geral.'; return res; }

  // 1) Reserva as mensagens devidas (status ENVIANDO) sob trava — evita envio em dobro
  const lote = comTrava_(function () {
    const c = config_();
    const agora = new Date();
    const fila = ler_(ABAS.FILA);
    fila.forEach(function (f) {
      if (f.status === 'ENVIANDO' && agora.getTime() - new Date(f.ultimaTentativa).getTime() > 15 * 60000) {
        f.status = 'VERIFICAR';
        f.erro = 'Envio interrompido sem confirmação. Confira no WhatsApp se a mensagem chegou antes de reenviar.';
        f.atualizadoEm = agoraISO_();
        salvar_(ABAS.FILA, f);
        res.verificar++;
      }
    });
    if (!dentroJanela_(agora, c)) { res.mensagem = 'Fora do horário permitido para envios.'; return []; }
    const devidos = fila.filter(function (f) { return f.status === 'PENDENTE' && new Date(f.agendadoPara).getTime() <= agora.getTime(); })
      .sort(function (a, b) { return a.agendadoPara < b.agendadoPara ? -1 : 1; })
      .slice(0, LOTE_ENVIO);
    devidos.forEach(function (f) {
      f.status = 'ENVIANDO';
      f.tentativas = String((parseInt(f.tentativas, 10) || 0) + 1);
      f.ultimaTentativa = agoraISO_();
      f.atualizadoEm = f.ultimaTentativa;
      salvar_(ABAS.FILA, f);
    });
    return devidos.map(function (f) { return Object.assign({}, f); });
  });
  if (!lote.length) { if (!res.mensagem) res.mensagem = 'Nenhuma mensagem para enviar agora.'; return res; }

  // 2) Monta o contexto
  limparMemo_();
  const ctx = { leads: {}, orcs: {}, modelos: [], optout: ler_(ABAS.OPTOUT), envios: {}, usados: {} };
  ler_(ABAS.LEADS).forEach(function (l) { ctx.leads[l.id] = l; });
  ler_(ABAS.ORCAMENTOS).forEach(function (o) { ctx.orcs[o.id] = o; });
  ctx.modelos = ler_(ABAS.MODELOS).filter(function (m) { return m.ativo === 'SIM'; });
  ler_(ABAS.FILA).forEach(function (f) {
    if (['ENVIADO', 'SIMULADO'].indexOf(f.status) < 0) return;
    (ctx.envios[f.leadId] = ctx.envios[f.leadId] || []).push(new Date(f.ultimaTentativa).getTime());
    (ctx.usados[f.leadId] = ctx.usados[f.leadId] || {})[f.modeloId] = true;
  });

  // 3) Envia (fora da trava) e grava o resultado (dentro da trava)
  lote.forEach(function (f) {
    let r;
    try { r = tentarEnviar_(f, ctx, cfg); }
    catch (e) { r = { tipo: 'verificar', campos: { status: 'VERIFICAR', erro: 'Erro inesperado: ' + e.message } }; }
    if (r.tipo === 'enviado' || r.tipo === 'simulado') {
      (ctx.envios[f.leadId] = ctx.envios[f.leadId] || []).push(Date.now());
      (ctx.usados[f.leadId] = ctx.usados[f.leadId] || {})[r.campos.modeloId] = true;
    }
    comTrava_(function () { gravarResultado_(f, r); });
    res[{ enviado: 'enviados', simulado: 'simulados', falha: 'falhas', cancelado: 'cancelados', reagendado: 'reagendados', verificar: 'verificar' }[r.tipo]]++;
  });
  res.mensagem = 'Processamento concluído.';
  return res;
}

function tentarEnviar_(f, ctx, cfg) {
  const cancelar = function (m) { return { tipo: 'cancelado', campos: { status: 'CANCELADO', erro: m } }; };
  const lead = ctx.leads[f.leadId];
  const orc = ctx.orcs[f.orcamentoId];
  if (!lead) return cancelar('Lead não encontrado');
  const canal = f.canal === 'EMAIL' ? 'EMAIL' : 'WHATSAPP';
  const bloq = bloqueioEnvio_(lead, cfg, ctx.optout, canal);
  if (bloq) return cancelar('Não enviado: ' + bloq);
  if (!orc || ORC_ATIVOS_FOLLOWUP.indexOf(orc.status) < 0) return cancelar('Orçamento não está mais aguardando resposta');

  const agora = Date.now();
  const envios = ctx.envios[lead.id] || [];
  const limite = parseInt(cfg.MAX_MSG_30_DIAS, 10) || 3;
  if (envios.filter(function (t) { return agora - t < 30 * 864e5; }).length >= limite) return cancelar('Limite de ' + limite + ' mensagens automáticas em 30 dias atingido');
  const minHoras = parseFloat(cfg.MIN_HORAS_ENTRE_MSG) || 0;
  const ultimo = envios.length ? Math.max.apply(null, envios) : 0;
  if (ultimo && agora - ultimo < minHoras * 3600e3) {
    const q = proximaJanela_(new Date(ultimo + minHoras * 3600e3), cfg);
    return { tipo: 'reagendado', campos: { status: 'PENDENTE', agendadoPara: q.toISOString(), tentativas: String(Math.max(0, (parseInt(f.tentativas, 10) || 1) - 1)), erro: 'Reagendada para respeitar o intervalo mínimo entre mensagens' } };
  }

  // Escolhe o modelo da etapa, evitando repetir um texto já enviado a este cliente
  const daEtapa = ctx.modelos.filter(function (m) { return String(m.etapa) === String(f.etapa); });
  const usados = ctx.usados[lead.id] || {};
  const mod = daEtapa.find(function (m) { return m.id === f.modeloId && !usados[m.id]; }) ||
    daEtapa.find(function (m) { return !usados[m.id]; }) ||
    daEtapa.find(function (m) { return m.id === f.modeloId; }) || daEtapa[0];
  if (!mod) return cancelar('Nenhum modelo ativo para a etapa ' + f.etapa);

  const v = variaveis_(lead, orc, cfg);
  const texto = renderizar_(mod.corpo, v);

  if (cfg.MODO_TESTE === 'SIM') {
    return { tipo: 'simulado', campos: { status: 'SIMULADO', modeloId: mod.id, texto: texto, modo: 'TESTE', mensagemId: 'TESTE-' + f.id, erro: '', statusEntrega: 'simulado' } };
  }

  if (canal === 'EMAIL') {
    let restante = 1;
    try { restante = MailApp.getRemainingDailyQuota(); } catch (e) { restante = 1; }
    if (restante < 1) {
      const amanha = proximaJanela_(Utilities.parseDate(somarDias_(hoje_(cfg), 1) + ' ' + cfg.HORA_INICIO, cfg.FUSO, 'yyyy-MM-dd HH:mm'), cfg);
      return { tipo: 'reagendado', campos: { status: 'PENDENTE', agendadoPara: amanha.toISOString(), tentativas: '0', erro: 'Limite diário de e-mails do Google atingido; reagendado para o próximo dia útil' } };
    }
    try {
      const em = montarEmail_(lead, orc, mod, cfg, true);
      GmailApp.sendEmail(lead.email, em.assunto, em.texto, em.opcoes);
    } catch (e) {
      const m = String(e.message || e);
      if (/too many times|limit|quota|limite/i.test(m)) {
        const q = proximaJanela_(new Date(Date.now() + 60 * 60000), cfg);
        return { tipo: 'reagendado', campos: { status: 'PENDENTE', agendadoPara: q.toISOString(), erro: 'Limite do Google: ' + m } };
      }
      if (/invalid email|endereço inválido|Invalid argument/i.test(m)) return { tipo: 'falha', campos: { status: 'FALHA', modeloId: mod.id, texto: texto, erro: 'E-mail inválido: ' + m } };
      return { tipo: 'verificar', campos: { status: 'VERIFICAR', modeloId: mod.id, texto: texto, erro: 'Erro ao enviar o e-mail sem confirmação (' + m + '). Confira na pasta Enviados do Gmail antes de reenviar.' } };
    }
    return { tipo: 'enviado', campos: { status: 'ENVIADO', modeloId: mod.id, texto: texto, modo: 'REAL', mensagemId: 'EMAIL-' + f.id, erro: '', statusEntrega: 'sent' } };
  }

  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('WA_TOKEN');
  const phoneId = props.getProperty('WA_PHONE_NUMBER_ID');
  if (!token || !phoneId) return { tipo: 'falha', campos: { status: 'FALHA', erro: 'Integração com o WhatsApp não configurada. Cadastre as credenciais ou volte ao modo teste.' } };

  const payload = {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: lead.telefone, type: 'template',
    template: { name: mod.templateMeta, language: { code: mod.idioma || 'pt_BR' }, components: [] }
  };
  const params = parametrosMeta_(mod.corpo, v);
  if (params.length) payload.template.components.push({ type: 'body', parameters: params });

  let resp;
  try {
    resp = UrlFetchApp.fetch('https://graph.facebook.com/' + cfg.GRAPH_VERSAO + '/' + phoneId + '/messages', {
      method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
  } catch (e) {
    return { tipo: 'verificar', campos: { status: 'VERIFICAR', modeloId: mod.id, texto: texto, erro: 'Falha de comunicação sem confirmação (' + e.message + '). Confira no WhatsApp antes de reenviar.' } };
  }
  const code = resp.getResponseCode();
  let body = {};
  try { body = JSON.parse(resp.getContentText()); } catch (x) { body = {}; }
  if (code >= 200 && code < 300 && body.messages && body.messages[0]) {
    return { tipo: 'enviado', campos: { status: 'ENVIADO', modeloId: mod.id, texto: texto, modo: 'REAL', mensagemId: body.messages[0].id, erro: '', statusEntrega: 'accepted' } };
  }
  const er = body.error || {};
  const detalhe = (er.error_data && er.error_data.details) || er.message || ('HTTP ' + code);
  const temporario = code === 429 || [1, 2, 4, 80007, 130429, 131048, 131056, 133004].indexOf(Number(er.code)) >= 0;
  const tentativa = parseInt(f.tentativas, 10) || 1;
  const max = parseInt(cfg.MAX_TENTATIVAS, 10) || 3;
  if (temporario && tentativa < max) {
    const q = proximaJanela_(new Date(Date.now() + 15 * 60000 * tentativa), cfg);
    return { tipo: 'reagendado', campos: { status: 'PENDENTE', agendadoPara: q.toISOString(), erro: 'Erro temporário (tentativa ' + tentativa + ' de ' + max + '): ' + detalhe } };
  }
  if (code >= 500) return { tipo: 'verificar', campos: { status: 'VERIFICAR', modeloId: mod.id, texto: texto, erro: 'Erro no servidor da Meta (' + detalhe + '). Confira no WhatsApp antes de reenviar.' } };
  return { tipo: 'falha', campos: { status: 'FALHA', modeloId: mod.id, texto: texto, erro: '[' + (er.code || code) + '] ' + detalhe } };
}

function gravarResultado_(f, r) {
  const cfg = config_();
  const atual = ler_(ABAS.FILA).find(function (x) { return x.id === f.id; });
  if (!atual || atual.status !== 'ENVIANDO') return;
  Object.assign(atual, r.campos, { atualizadoEm: agoraISO_() });
  salvar_(ABAS.FILA, atual);
  const lead = ler_(ABAS.LEADS).find(function (l) { return l.id === f.leadId; });
  const rotulo = { enviado: f.canal === 'EMAIL' ? 'E-mail de acompanhamento enviado' : 'Mensagem enviada pelo WhatsApp', simulado: 'Mensagem simulada (modo teste)', falha: 'Falha no envio', cancelado: 'Envio cancelado', reagendado: 'Envio reagendado', verificar: 'Envio precisa de verificação' }[r.tipo];
  const detalhe = 'Etapa ' + f.etapa + (r.campos.texto ? ' — "' + r.campos.texto + '"' : '') + (r.campos.erro ? ' — ' + r.campos.erro : '');
  registrar_(SISTEMA, f.leadId, 'MENSAGEM', f.id, rotulo, detalhe);
  if (lead && (r.tipo === 'enviado' || r.tipo === 'simulado')) {
    lead.ultimoContato = hoje_(cfg);
    lead.atualizadoEm = agoraISO_();
    salvar_(ABAS.LEADS, lead);
    const orc = ler_(ABAS.ORCAMENTOS).find(function (o) { return o.id === f.orcamentoId; });
    if (orc && orc.status === 'Enviado') { orc.status = 'Aguardando resposta'; orc.atualizadoEm = agoraISO_(); salvar_(ABAS.ORCAMENTOS, orc); }
  }
  recalcularProximo_(f.leadId);
}

/* ========================================================================== */
/* WEBHOOK DO WHATSAPP (respostas e status de entrega)                        */
/* ========================================================================== */

function webhookWhatsApp_(b) {
  comTrava_(function () {
    const cache = CacheService.getScriptCache();
    (b.entry || []).forEach(function (en) {
      (en.changes || []).forEach(function (ch) {
        const v = ch.value || {};
        (v.messages || []).forEach(function (m) {
          if (m.id) { if (cache.get('wm_' + m.id)) return; cache.put('wm_' + m.id, '1', 21600); }
          let texto = '[' + (m.type || 'mensagem') + ']';
          if (m.text && m.text.body) texto = m.text.body;
          else if (m.button && m.button.text) texto = m.button.text;
          else if (m.interactive) texto = ((m.interactive.button_reply || m.interactive.list_reply || {}).title) || texto;
          mensagemRecebida_(normalizarTelefone_(m.from), String(texto));
        });
        (v.statuses || []).forEach(statusEntrega_);
      });
    });
  });
}

function mensagemRecebida_(telefone, texto) {
  const cfg = config_();
  const leads = ler_(ABAS.LEADS).filter(function (l) { return l.telefone === telefone && l.anonimizado !== 'SIM'; });
  if (!leads.length) return;
  const t = semAcento_(texto.trim().toLowerCase());
  const palavras = String(cfg.PALAVRAS_OPTOUT || '').split(',').map(function (s) { return semAcento_(s.trim().toLowerCase()); }).filter(Boolean);
  const pediuSaida = palavras.some(function (p) {
    return t === p || (t.length <= 60 && new RegExp('(^|[^a-z])' + escRe_(p) + '([^a-z]|$)').test(t));
  });
  leads.forEach(function (l) {
    registrar_(WHATSAPP, l.id, 'MENSAGEM', '', 'Mensagem recebida do cliente', texto.slice(0, 1000));
    if (pediuSaida) {
      adicionarOptOut_(telefone, 'Cliente respondeu: "' + texto.slice(0, 80) + '"', 'WhatsApp', WHATSAPP);
      l.consentimento = 'NAO'; l.bloqueado = 'SIM'; l.motivoBloqueio = 'Pediu para não receber mensagens';
      l.ultimoContato = hoje_(cfg); l.atualizadoEm = agoraISO_();
      salvar_(ABAS.LEADS, l);
      cancelarPendentes_({ leadId: l.id }, 'Cliente pediu para não receber mensagens', WHATSAPP);
      registrar_(WHATSAPP, l.id, 'LEAD', l.id, 'Incluído na lista de não contatar', 'Pedido feito pelo próprio cliente no WhatsApp');
    } else {
      clienteRespondeuInterno_(l, WHATSAPP, 'Resposta recebida pelo WhatsApp');
    }
  });
}

function statusEntrega_(s) {
  const f = ler_(ABAS.FILA).find(function (x) { return x.mensagemId && x.mensagemId === s.id; });
  if (!f) return;
  const ordem = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 9 };
  if ((ordem[s.status] || 0) < (ordem[f.statusEntrega] || 0) && s.status !== 'failed') return;
  f.statusEntrega = s.status;
  if (s.status === 'failed') {
    const e = (s.errors || [])[0] || {};
    f.status = 'FALHA';
    f.erro = 'Entrega falhou: [' + (e.code || '') + '] ' + (e.title || e.message || '');
    registrar_(WHATSAPP, f.leadId, 'MENSAGEM', f.id, 'Falha na entrega', f.erro);
  }
  f.atualizadoEm = agoraISO_();
  salvar_(ABAS.FILA, f);
}

/* ========================================================================== */
/* PAINEL DE CONTROLE                                                         */
/* ========================================================================== */

function acaoRecomendada_(l, orcs, pend, hoje, cfg) {
  const atrasado = l.proximoContato && l.proximoContato < hoje;
  const prefixo = atrasado ? 'Atrasado: ' : '';
  const aguardandoAprov = pend.find(function (f) { return f.status === 'AGUARDANDO_APROVACAO'; });
  if (aguardandoAprov) return prefixo + 'aprovar a mensagem da etapa ' + aguardandoAprov.etapa;
  if (pend.length) return 'Acompanhamento automático (etapa ' + pend[0].etapa + ') em ' + Utilities.formatDate(new Date(pend[0].agendadoPara), cfg.FUSO, 'dd/MM HH:mm');
  if (!orcs.length) return prefixo + (l.status === 'Novo' ? 'fazer o primeiro contato' : 'preparar o orçamento');
  if (orcs.some(function (o) { return o.status === 'Negociação'; })) return prefixo + 'retomar a negociação';
  if (orcs.some(function (o) { return o.status === 'Em preparação'; })) return prefixo + 'finalizar e enviar o orçamento';
  if (orcs.some(function (o) { return ORC_ATIVOS_FOLLOWUP.indexOf(o.status) >= 0; })) {
    return prefixo + (l.consentimento === 'SIM' && l.bloqueado !== 'SIM' ? 'ligar: a sequência automática terminou' : 'ligar: cliente sem autorização para mensagens automáticas');
  }
  return prefixo + 'fazer contato de acompanhamento';
}

function dashboard_(d, u) {
  const cfg = config_();
  const hoje = hoje_(cfg);
  const de = ymdOk_(d.de) || hoje.slice(0, 8) + '01';
  const ate = ymdOk_(d.ate) || hoje;
  const naFaixa = function (s) {
    if (!s) return false;
    const x = s.length > 10 ? dataLocal_(new Date(s), cfg) : s;
    return x >= de && x <= ate;
  };
  let leads = ler_(ABAS.LEADS).filter(function (l) { return podeVer_(l, u) && l.arquivado !== 'SIM'; });
  ['responsavelId', 'servico', 'status', 'origem'].forEach(function (c) { if (d[c]) leads = leads.filter(function (l) { return l[c] === d[c]; }); });
  const ids = {};
  leads.forEach(function (l) { ids[l.id] = true; });
  const orcs = ler_(ABAS.ORCAMENTOS).filter(function (o) { return ids[o.leadId]; });
  const fila = ler_(ABAS.FILA).filter(function (f) { return ids[f.leadId]; });
  const orcPorLead = agrupar_(orcs, 'leadId');
  const pendPorLead = agrupar_(fila.filter(function (f) { return FILA_PENDENTES.indexOf(f.status) >= 0; })
    .sort(function (a, b) { return a.agendadoPara < b.agendadoPara ? -1 : 1; }), 'leadId');
  const ativos = leads.filter(function (l) { return LEAD_ENCERRADOS.indexOf(l.status) < 0; });
  const ganhos = leads.filter(function (l) { return l.status === 'Ganho' && naFaixa(l.encerradoEm); }).length;
  const perdidos = leads.filter(function (l) { return l.status === 'Perdido' && naFaixa(l.encerradoEm); }).length;
  const soma = function (lista) { return dinheiro_(lista.reduce(function (s, o) { return s + num_(o.total); }, 0)); };

  const kpis = {
    totalLeads: leads.length,
    novos: leads.filter(function (l) { return naFaixa(l.dataSolicitacao || l.criadoEm); }).length,
    orcEnviados: orcs.filter(function (o) { return o.status !== 'Em preparação' && naFaixa(o.dataEnvio); }).length,
    orcAguardando: orcs.filter(function (o) { return ORC_ABERTOS.indexOf(o.status) >= 0; }).length,
    contatosHoje: ativos.filter(function (l) { return l.proximoContato === hoje; }).length,
    atrasados: ativos.filter(function (l) { return l.proximoContato && l.proximoContato < hoje; }).length,
    semAgenda: ativos.filter(function (l) { return !l.proximoContato; }).length,
    fechados: ganhos,
    perdidos: perdidos,
    conversao: ganhos + perdidos ? Math.round(ganhos / (ganhos + perdidos) * 1000) / 10 : 0,
    valorAberto: soma(orcs.filter(function (o) { return ORC_ABERTOS.indexOf(o.status) >= 0; })),
    valorFechado: soma(orcs.filter(function (o) { return o.status === 'Aprovado' && naFaixa(o.encerradoEm); }))
  };
  const filaContagem = {};
  fila.forEach(function (f) { filaContagem[f.status] = (filaContagem[f.status] || 0) + 1; });
  const porStatus = {};
  LISTAS.statusLead.forEach(function (s) { porStatus[s] = 0; });
  leads.forEach(function (l) { porStatus[l.status] = (porStatus[l.status] || 0) + 1; });

  const limite = somarDias_(hoje, 7);
  const proximos = ativos.filter(function (l) { return l.proximoContato && l.proximoContato <= limite; })
    .sort(function (a, b) { return a.proximoContato < b.proximoContato ? -1 : 1; })
    .slice(0, 60)
    .map(function (l) {
      return {
        id: l.id, nome: l.nome, telefone: l.telefone, servico: l.servico, ultimoContato: l.ultimoContato,
        proximoContato: l.proximoContato, responsavelNome: l.responsavelNome, status: l.status,
        atrasado: l.proximoContato < hoje, hoje: l.proximoContato === hoje,
        acao: acaoRecomendada_(l, orcPorLead[l.id] || [], pendPorLead[l.id] || [], hoje, cfg),
        textoWhatsApp: textoWhatsAppManual_(l, orcPorLead[l.id] || [], pendPorLead[l.id] || [], cfg)
      };
    });
  return { periodo: { de: de, ate: ate }, hoje: hoje, kpis: kpis, fila: filaContagem, porStatus: porStatus, proximos: proximos, config: configPublica_() };
}

/* ========================================================================== */
/* E-MAIL: montagem, envio, descadastro e detecção de respostas               */
/* ========================================================================== */

const _imgCache = {};

function formatarTelefone_(d) {
  d = String(d || '').replace(/\D/g, '');
  if (d.length === 13 && d.indexOf('55') === 0) return '(' + d.slice(2, 4) + ') ' + d.slice(4, 9) + '-' + d.slice(9);
  if (d.length === 12 && d.indexOf('55') === 0) return '(' + d.slice(2, 4) + ') ' + d.slice(4, 8) + '-' + d.slice(8);
  return d ? '+' + d : '';
}

function escHtml_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function moedaBR_(n) {
  return 'R$ ' + dinheiro_(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function imagemBlob_(url, nome) {
  if (!url) return null;
  if (_imgCache[url] !== undefined) return _imgCache[url];
  let blob = null;
  try {
    const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() === 200) blob = r.getBlob().setName(nome);
  } catch (e) { blob = null; }
  _imgCache[url] = blob;
  return blob;
}

function assinaturaLead_(id) {
  const segredo = PropertiesService.getScriptProperties().getProperty('EMAIL_SEGREDO') || '';
  return hash_(segredo + '|' + id).slice(0, 32);
}

function linkDescadastro_(lead) {
  let base = '';
  try { base = ScriptApp.getService().getUrl() || ''; } catch (e) { base = ''; }
  if (!base) return '';
  return base + '?acao=sair&l=' + encodeURIComponent(lead.id) + '&t=' + assinaturaLead_(lead.id);
}

/** Monta o e-mail de acompanhamento com a identidade visual da Vegas. */
function montarEmail_(lead, orc, mod, cfg, embutirImagens) {
  const v = variaveis_(lead, orc, cfg);
  const assunto = renderizar_(mod.assunto || ASSUNTOS_PADRAO[mod.etapa] || 'Seu orçamento de [SERVICO]', v);
  const corpo = renderizar_(mod.corpo, v);
  const wa = normalizarTelefone_(cfg.NUMERO_WHATSAPP);
  const fone = normalizarTelefone_(cfg.TELEFONE_CONTATO || cfg.NUMERO_WHATSAPP);
  const msgWa = renderizar_(cfg.MSG_WHATSAPP_CLIENTE || '', v);
  const linkWa = 'https://wa.me/' + wa + (msgWa ? '?text=' + encodeURIComponent(msgWa) : '');
  const linkTel = 'tel:+' + fone;
  const foneFmt = formatarTelefone_(fone);
  const sair = linkDescadastro_(lead);
  const empresa = cfg.EMPRESA || 'Vegas Vigilância e Segurança';

  const imagens = {};
  let srcTopo = cfg.EMAIL_IMG_TOPO, srcRodape = cfg.EMAIL_IMG_RODAPE;
  if (embutirImagens) {
    const bt = imagemBlob_(srcTopo, 'vegas-topo.jpg');
    if (bt) { imagens.vegastopo = bt; srcTopo = 'cid:vegastopo'; }
    const br = imagemBlob_(srcRodape, 'vegas-rodape.jpg');
    if (br) { imagens.vegasrodape = br; srcRodape = 'cid:vegasrodape'; }
  }

  // Separa a saudação ("Olá, Maria!") para virar o título do e-mail
  let titulo = '', texto = corpo.trim();
  const m = texto.match(/^((?:Olá|Ola|Oi|Bom dia|Boa tarde|Boa noite)[^!?.\n]{0,60}[!?.])\s*/i);
  if (m) { titulo = m[1]; texto = texto.slice(m[0].length); }
  const fonte = "font-family:Arial,Helvetica,sans-serif;";
  const paragrafos = texto.split(/\n+/).filter(function (p) { return p.trim(); }).map(function (p) {
    return '<p style="margin:0 0 16px;' + fonte + 'font-size:16px;line-height:26px;color:#d9d9d9;">' + escHtml_(p) + '</p>';
  }).join('');

  let cartao = '';
  if (orc && orc.numero) {
    const linhaCartao = function (rot, val, destaque) {
      return '<tr><td style="padding:6px 0;' + fonte + 'font-size:13px;color:#9a9a9a;">' + rot + '</td>' +
        '<td align="right" style="padding:6px 0;text-align:right;' + fonte + 'font-size:' + (destaque ? '20px' : '14px') + ';font-weight:700;color:' + (destaque ? '#ffffff' : '#e6e6e6') + ';">' + val + '</td></tr>';
    };
    cartao = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:8px 0 24px;background:#141414;border:1px solid #333333;border-top:3px solid #c8c8c8;">' +
      '<tr><td style="padding:16px 20px 12px;">' +
      '<p style="margin:0 0 8px;' + fonte + 'font-size:11px;letter-spacing:3px;color:#a8a8a8;">SEU ORÇAMENTO</p>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">' +
      linhaCartao('Número', escHtml_(orc.numero)) +
      linhaCartao('Serviço', escHtml_(lead.servico)) +
      (num_(orc.total) ? linhaCartao('Valor total', escHtml_(moedaBR_(orc.total)), true) : '') +
      (orc.validade ? linhaCartao('Válido até', escHtml_(br_(orc.validade))) : '') +
      '</table></td></tr></table>';
  }

  const botao = function (href, rotulo, fundo, cor) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 12px;"><tr>' +
      '<td align="center" bgcolor="' + fundo + '" style="background:' + fundo + ';border-radius:6px;text-align:center;">' +
      '<a href="' + escHtml_(href) + '" target="_blank" style="display:block;text-align:center;padding:16px 20px;' + fonte + 'font-size:17px;font-weight:700;color:' + cor + ';text-decoration:none;border-radius:6px;">' + rotulo + '</a>' +
      '</td></tr></table>';
  };

  const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>' + escHtml_(assunto) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#050505;">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#050505;">' + escHtml_(texto.slice(0, 110)) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050505" style="background:#050505;"><tr><td align="center" style="padding:20px 10px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#0b0b0b" style="width:100%;max-width:600px;background:#0b0b0b;border:1px solid #262626;">' +
    // topo
    '<tr><td style="padding:0;line-height:0;font-size:0;"><img src="' + escHtml_(srcTopo) + '" width="600" alt="' + escHtml_(empresa) + ' — Sua segurança é o nosso compromisso" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>' +
    // corpo com a linha prateada à esquerda, como no template
    '<tr><td style="padding:30px 28px 8px 28px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td style="border-left:2px solid #a6a6a6;padding:2px 0 2px 22px;">' +
    (titulo ? '<h1 style="margin:0 0 14px;' + fonte + 'font-size:28px;line-height:34px;font-weight:800;color:#ffffff;">' + escHtml_(titulo) + '</h1>' : '') +
    paragrafos + cartao +
    '<p style="margin:0 0 14px;' + fonte + 'font-size:14px;line-height:22px;color:#a8a8a8;">Fale direto com a nossa equipe:</p>' +
    botao(linkWa, '&#128172;&nbsp; Conversar no WhatsApp', '#25D366', '#06240f') +
    botao(linkTel, '&#128222;&nbsp; Ligar: ' + escHtml_(foneFmt), '#e6e6e6', '#0b0b0b') +
    '<p style="margin:22px 0 4px;' + fonte + 'font-size:15px;line-height:22px;color:#bdbdbd;">Atenciosamente,</p>' +
    '<p style="margin:0 0 6px;' + fonte + 'font-size:16px;line-height:22px;color:#ffffff;font-weight:700;">' + escHtml_(lead.responsavelNome || empresa) + '</p>' +
    '<p style="margin:0;' + fonte + 'font-size:13px;line-height:20px;color:#9a9a9a;">' + escHtml_(empresa) + '<br>WhatsApp ' + escHtml_(formatarTelefone_(wa)) + '</p>' +
    '</td></tr></table></td></tr>' +
    // rodapé
    '<tr><td style="padding:24px 0 0;line-height:0;font-size:0;"><img src="' + escHtml_(srcRodape) + '" width="600" alt="Monitoramento 24 horas · Vigilância patrimonial · Sistemas de segurança — Juntos por mais segurança!" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>' +
    '<tr><td style="padding:14px 28px 22px;' + fonte + 'font-size:11px;line-height:17px;color:#7a7a7a;" align="center">' +
    'Você está recebendo este e-mail porque solicitou um orçamento à ' + escHtml_(empresa) + '.' +
    (sair ? '<br>Não quer mais receber estes e-mails? <a href="' + escHtml_(sair) + '" target="_blank" style="color:#bdbdbd;text-decoration:underline;">Clique aqui para cancelar</a>.' : '') +
    '</td></tr></table></td></tr></table></body></html>';

  const textoSimples = corpo + '\n\n' +
    (orc && orc.numero ? 'Orçamento ' + orc.numero + (num_(orc.total) ? ' — ' + moedaBR_(orc.total) : '') + (orc.validade ? ' — válido até ' + br_(orc.validade) : '') + '\n\n' : '') +
    'Conversar no WhatsApp: ' + linkWa + '\nLigar: ' + foneFmt + '\n\nAtenciosamente,\n' + (lead.responsavelNome || empresa) + '\n' + empresa +
    (sair ? '\n\nPara não receber mais estes e-mails: ' + sair : '');

  const opcoes = { htmlBody: html, name: cfg.EMAIL_REMETENTE || empresa };
  if (Object.keys(imagens).length) opcoes.inlineImages = imagens;
  if (cfg.EMAIL_RESPONDER_PARA) opcoes.replyTo = cfg.EMAIL_RESPONDER_PARA;
  return { assunto: assunto, html: html, texto: textoSimples, opcoes: opcoes };
}

function exemploEmail_(u, cfg, para) {
  const hoje = hoje_(cfg);
  return {
    lead: { id: 'EXEMPLO', nome: 'Maria da Silva', email: para || 'cliente@exemplo.com', servico: 'Câmeras de segurança', responsavelNome: u.nome },
    orc: { numero: 'ORC-' + hoje.slice(0, 4) + '-0001', total: '2300', validade: somarDias_(hoje, 15) }
  };
}

function modeloParaEmail_(d) {
  const modelos = ler_(ABAS.MODELOS);
  if (d.corpo) return { corpo: limpa_(d.corpo, 1024), assunto: limpa_(d.assunto, 150), etapa: String(d.etapa || 1) };
  const m = (d.modeloId && modelos.find(function (x) { return x.id === d.modeloId; })) ||
    modelos.find(function (x) { return x.ativo === 'SIM' && String(x.etapa) === '1'; }) || modelos[0];
  if (!m) throw erro_('Nenhum modelo de mensagem cadastrado.');
  return m;
}

function previaEmail_(d, u) {
  const cfg = config_();
  const ex = exemploEmail_(u, cfg);
  const em = montarEmail_(ex.lead, ex.orc, modeloParaEmail_(d), cfg, false);
  return { assunto: em.assunto, html: em.html };
}

function enviarEmailTeste_(d, u) {
  const cfg = config_();
  let para = limpa_(d.para, 120).toLowerCase();
  if (!para) { try { para = Session.getEffectiveUser().getEmail(); } catch (e) { para = ''; } }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) throw erro_('Informe um e-mail válido para receber o teste.');
  const ex = exemploEmail_(u, cfg, para);
  const em = montarEmail_(ex.lead, ex.orc, modeloParaEmail_(d), cfg, true);
  GmailApp.sendEmail(para, '[TESTE] ' + em.assunto, em.texto, em.opcoes);
  comTrava_(function () { registrar_(u, '', 'CONFIG', '', 'E-mail de teste enviado', para); });
  return { para: para, imagensEmbutidas: !!em.opcoes.inlineImages };
}

function paginaDescadastro_(p) {
  const cfg = config_();
  const empresa = cfg.EMPRESA || 'Vegas Vigilância e Segurança';
  const pagina = function (titulo, msg, extra) {
    return HtmlService.createHtmlOutput('<!DOCTYPE html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>body{margin:0;background:#0b0b0b;color:#d9d9d9;font-family:Arial,Helvetica,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}' +
      'main{max-width:460px;border-left:2px solid #a6a6a6;padding:6px 0 6px 22px}small{letter-spacing:3px;color:#9a9a9a;font-size:11px}h1{color:#fff;font-size:26px;margin:10px 0}' +
      'a{display:inline-block;margin-top:14px;background:#e6e6e6;color:#0b0b0b;padding:13px 20px;border-radius:6px;text-decoration:none;font-weight:700}</style></head>' +
      '<body><main><small>' + escHtml_(empresa.toUpperCase()) + '</small><h1>' + titulo + '</h1><p>' + msg + '</p>' + (extra || '') + '</main></body></html>')
      .setTitle(empresa).addMetaTag('viewport', 'width=device-width, initial-scale=1');
  };
  const id = String(p.l || ''), t = String(p.t || '');
  if (!id || t !== assinaturaLead_(id)) return pagina('Link inválido', 'Este link de cancelamento não é válido. Se preferir, responda o e-mail pedindo para não receber mais mensagens.');
  if (p.ok !== '1') {
    let base = '';
    try { base = ScriptApp.getService().getUrl() || ''; } catch (e) { base = ''; }
    const confirmar = base + '?acao=sair&l=' + encodeURIComponent(id) + '&t=' + t + '&ok=1';
    return pagina('Cancelar o recebimento?', 'Você não vai mais receber e-mails de acompanhamento do seu orçamento.', '<a href="' + escHtml_(confirmar) + '" target="_top">Confirmar cancelamento</a>');
  }
  comTrava_(function () {
    const l = ler_(ABAS.LEADS).find(function (x) { return x.id === id; });
    if (!l || l.anonimizado === 'SIM' || l.bloqueado === 'SIM' && l.consentimento === 'NAO' && leadEmOptOut_(l)) return;
    if (l.email) adicionarOptOut_(l.email, 'Cancelou pelo link do e-mail', 'E-mail', EMAIL_SIS);
    if (l.telefone) adicionarOptOut_(l.telefone, 'Cancelou pelo link do e-mail', 'E-mail', EMAIL_SIS);
    l.consentimento = 'NAO'; l.bloqueado = 'SIM'; l.motivoBloqueio = 'Cancelou o recebimento pelo link do e-mail'; l.atualizadoEm = agoraISO_();
    salvar_(ABAS.LEADS, l);
    cancelarPendentes_({ leadId: l.id }, 'Cliente cancelou o recebimento pelo link do e-mail', EMAIL_SIS);
    registrar_(EMAIL_SIS, l.id, 'LEAD', l.id, 'Incluído na lista de não contatar', 'O cliente clicou em cancelar no e-mail');
  });
  return pagina('Pronto!', 'Você não receberá mais e-mails de acompanhamento. Se quiser retomar o orçamento, é só falar com a gente.');
}

/** Pausa os acompanhamentos dos clientes que responderam algum e-mail. */
function verificarRespostasEmail_(cfg) {
  const fila = ler_(ABAS.FILA);
  const primeiroEnvio = {}, comPendente = {};
  fila.forEach(function (f) {
    if (f.canal === 'EMAIL' && f.status === 'ENVIADO' && f.modo === 'REAL' && f.ultimaTentativa) {
      if (!primeiroEnvio[f.leadId] || f.ultimaTentativa < primeiroEnvio[f.leadId]) primeiroEnvio[f.leadId] = f.ultimaTentativa;
    }
    if (FILA_PENDENTES.indexOf(f.status) >= 0) comPendente[f.leadId] = true;
  });
  const alvos = ler_(ABAS.LEADS).filter(function (l) { return comPendente[l.id] && primeiroEnvio[l.id] && l.email; }).slice(0, 25);
  let n = 0;
  alvos.forEach(function (l) {
    const desde = new Date(primeiroEnvio[l.id]);
    const busca = 'from:' + l.email + ' after:' + Utilities.formatDate(new Date(desde.getTime() - 864e5), cfg.FUSO, 'yyyy/MM/dd');
    const respondeu = GmailApp.search(busca, 0, 5).some(function (th) {
      return th.getMessages().some(function (m) {
        return m.getDate().getTime() > desde.getTime() && String(m.getFrom()).toLowerCase().indexOf(l.email) >= 0;
      });
    });
    if (respondeu) {
      comTrava_(function () {
        const atual = ler_(ABAS.LEADS).find(function (x) { return x.id === l.id; });
        if (atual) clienteRespondeuInterno_(atual, EMAIL_SIS, 'Resposta recebida por e-mail');
      });
      n++;
    }
  });
  return n;
}

/* ---------------------------- WhatsApp manual (1 clique) ------------------ */

function textoWhatsAppManual_(l, orcs, pend, cfg) {
  const recentes = orcs.slice().sort(function (a, b) { return a.criadoEm < b.criadoEm ? 1 : -1; });
  const orc = recentes.find(function (o) { return ORC_ABERTOS.indexOf(o.status) >= 0; }) || null;
  if (!orc) {
    return renderizar_('Olá, [NOME]! Aqui é [VENDEDOR], da [EMPRESA]. Recebemos seu pedido sobre [SERVICO] e gostaria de entender melhor a sua necessidade para preparar a melhor proposta. Podemos conversar?', variaveis_(l, null, cfg));
  }
  if (orc.status === 'Negociação') {
    return renderizar_('Olá, [NOME]! Aqui é [VENDEDOR], da [EMPRESA]. Estou retomando nossa conversa sobre o orçamento [ORCAMENTO] de [SERVICO]. Conseguimos avançar?', variaveis_(l, orc, cfg));
  }
  const etapa = pend.length ? String(pend[0].etapa) : '1';
  const modelos = ler_(ABAS.MODELOS).filter(function (m) { return m.ativo === 'SIM'; });
  const mod = modelos.find(function (m) { return String(m.etapa) === etapa; }) || modelos[0];
  return mod ? renderizar_(mod.corpo, variaveis_(l, orc, cfg)) : '';
}

function registrarWhatsAppManual_(d, u) {
  const cfg = config_();
  const l = leadOuErro_(d.leadId, u);
  l.ultimoContato = hoje_(cfg);
  if (l.status === 'Novo') { l.status = 'Em contato'; registrar_(u, l.id, 'LEAD', l.id, 'Status alterado', 'Novo → Em contato'); }
  l.atualizadoEm = agoraISO_();
  salvar_(ABAS.LEADS, l);
  registrar_(u, l.id, 'CONTATO', '', 'WhatsApp manual (aberto pelo CRM)', limpa_(d.texto, 1000));
  return true;
}

/* ========================================================================== */
/* CONFIGURAÇÕES E INTEGRAÇÃO                                                 */
/* ========================================================================== */

function obterConfig_() {
  const cfg = config_();
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('WA_TOKEN') || '';
  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }
  return {
    valores: cfg,
    descricoes: CONFIG_PADRAO.reduce(function (m, x) { m[x[0]] = x[2]; return m; }, {}),
    credenciais: {
      tokenConfigurado: !!token,
      tokenFinal: token ? '••••' + token.slice(-6) : '',
      phoneNumberId: props.getProperty('WA_PHONE_NUMBER_ID') || '',
      wabaId: props.getProperty('WA_WABA_ID') || '',
      verifyToken: props.getProperty('WA_VERIFY_TOKEN') || ''
    },
    webhookUrl: url,
    gatilhoAtivo: ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'processarFila'; })
  };
}

function salvarConfig_(d, u) {
  const valores = d.valores || {};
  const atual = config_();
  const permitidas = CONFIG_PADRAO.map(function (x) { return x[0]; }).filter(function (k) { return k !== 'SEQ_ORCAMENTO'; });
  const novo = {};
  Object.keys(valores).forEach(function (k) {
    if (permitidas.indexOf(k) < 0) throw erro_('Configuração desconhecida: ' + k);
    novo[k] = limpa_(valores[k], 500);
  });
  const final = Object.assign({}, atual, novo);
  ['MODO_TESTE', 'ENVIOS_PAUSADOS', 'REQUER_APROVACAO'].forEach(function (k) { if (['SIM', 'NAO'].indexOf(final[k]) < 0) throw erro_(k + ' deve ser SIM ou NAO.'); });
  ['HORA_INICIO', 'HORA_FIM', 'HORA_PREFERIDA'].forEach(function (k) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(final[k])) throw erro_('Horário inválido em ' + k + ' (use HH:MM).'); });
  if (final.HORA_INICIO >= final.HORA_FIM) throw erro_('O horário de início precisa ser antes do horário de fim.');
  if (final.HORA_PREFERIDA < final.HORA_INICIO || final.HORA_PREFERIDA >= final.HORA_FIM) throw erro_('O horário preferido precisa estar dentro do horário permitido.');
  const etapas = [1, 2, 3].map(function (i) { const n = parseInt(final['DIAS_ETAPA_' + i], 10); if (!(n >= 0 && n <= 90)) throw erro_('Dias da etapa ' + i + ' devem ficar entre 0 e 90.'); return n; });
  const ativas = etapas.filter(function (n) { return n > 0; });
  for (let i = 1; i < ativas.length; i++) if (ativas[i] <= ativas[i - 1]) throw erro_('Cada etapa precisa acontecer depois da anterior (ex.: 2, 5 e 10 dias).');
  if (!diasPermitidos_(final).length) throw erro_('Escolha pelo menos um dia da semana para envios.');
  try { Utilities.formatDate(new Date(), final.FUSO, 'HH:mm'); } catch (e) { throw erro_('Fuso horário inválido.'); }
  [['MAX_MSG_30_DIAS', 1, 10], ['MIN_HORAS_ENTRE_MSG', 0, 240], ['MAX_TENTATIVAS', 1, 5], ['VALIDADE_PADRAO_DIAS', 1, 365]].forEach(function (x) {
    const n = parseFloat(final[x[0]]);
    if (!(n >= x[1] && n <= x[2])) throw erro_(x[0] + ' deve ficar entre ' + x[1] + ' e ' + x[2] + '.');
  });
  if (!/^v\d+\.\d+$/.test(final.GRAPH_VERSAO)) throw erro_('Versão da Graph API inválida (ex.: v23.0).');
  if (['EMAIL', 'WHATSAPP'].indexOf(final.CANAL) < 0) throw erro_('Canal inválido: use EMAIL ou WHATSAPP.');
  ['EMAIL_IMG_TOPO', 'EMAIL_IMG_RODAPE'].forEach(function (k) { if (final[k] && !/^https:\/\//.test(final[k])) throw erro_('O link da imagem precisa começar com https://'); });
  if (final.EMAIL_RESPONDER_PARA && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(final.EMAIL_RESPONDER_PARA)) throw erro_('E-mail para respostas inválido.');
  ['NUMERO_WHATSAPP', 'TELEFONE_CONTATO'].forEach(function (k) { final[k] = normalizarTelefone_(final[k]); if (novo[k] !== undefined) novo[k] = final[k]; if (!telefoneValido_(final[k])) throw erro_('Telefone inválido em ' + k + '.'); });
  ['DETECTAR_RESPOSTA_EMAIL'].forEach(function (k) { if (['SIM', 'NAO'].indexOf(final[k]) < 0) throw erro_(k + ' deve ser SIM ou NAO.'); });
  if (final.MODO_TESTE === 'NAO' && final.CANAL === 'WHATSAPP') {
    const p = PropertiesService.getScriptProperties();
    if (!p.getProperty('WA_TOKEN') || !p.getProperty('WA_PHONE_NUMBER_ID')) throw erro_('Configure e teste as credenciais do WhatsApp antes de desligar o modo teste.');
  }
  const mudancas = [];
  Object.keys(novo).forEach(function (k) {
    if (String(atual[k]) !== novo[k]) { definirConfig_(k, novo[k]); mudancas.push(k + ': ' + atual[k] + ' → ' + novo[k]); }
  });
  if (mudancas.length) registrar_(u, '', 'CONFIG', '', 'Configurações alteradas', mudancas.join('; '));
  return configPublica_();
}

function salvarCredenciais_(d, u) {
  const p = PropertiesService.getScriptProperties();
  const alterados = [];
  if (d.token) {
    const t = String(d.token).trim();
    if (t.length < 50 || /\s/.test(t)) throw erro_('O token parece incompleto. Copie o token de acesso permanente inteiro.');
    p.setProperty('WA_TOKEN', t); alterados.push('token');
  }
  if (d.phoneNumberId) {
    const id = String(d.phoneNumberId).replace(/\D/g, '');
    if (id.length < 10) throw erro_('Identificação do número de telefone inválida (é um número longo, diferente do seu telefone).');
    p.setProperty('WA_PHONE_NUMBER_ID', id); alterados.push('identificação do número');
  }
  if (d.wabaId) { p.setProperty('WA_WABA_ID', String(d.wabaId).replace(/\D/g, '')); alterados.push('conta WhatsApp Business'); }
  if (d.novoVerifyToken) { p.setProperty('WA_VERIFY_TOKEN', Utilities.getUuid().replace(/-/g, '')); alterados.push('token de verificação do webhook'); }
  if (d.removerToken) { p.deleteProperty('WA_TOKEN'); alterados.push('token removido'); }
  if (alterados.length) registrar_(u, '', 'CONFIG', '', 'Credenciais do WhatsApp atualizadas', alterados.join(', '));
  return obterConfig_().credenciais;
}

function testarIntegracao_() {
  const cfg = config_();
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('WA_TOKEN'), id = p.getProperty('WA_PHONE_NUMBER_ID');
  if (!token || !id) throw erro_('Cadastre o token e a identificação do número primeiro.');
  const r = UrlFetchApp.fetch('https://graph.facebook.com/' + cfg.GRAPH_VERSAO + '/' + id + '?fields=display_phone_number,verified_name,quality_rating,code_verification_status,name_status',
    { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  let b = {};
  try { b = JSON.parse(r.getContentText()); } catch (e) { b = {}; }
  if (r.getResponseCode() !== 200) throw erro_('A Meta recusou a conexão: ' + ((b.error && b.error.message) || ('HTTP ' + r.getResponseCode())));
  return { numero: b.display_phone_number, nome: b.verified_name, qualidade: b.quality_rating, verificacao: b.code_verification_status, statusNome: b.name_status };
}

function reinstalarGatilho_(d, u) {
  instalarGatilho_();
  comTrava_(function () { registrar_(u, '', 'CONFIG', '', 'Gatilho da fila reinstalado', 'A cada 10 minutos'); });
  return true;
}

function instalarGatilho_() {
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'processarFila'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('processarFila').timeBased().everyMinutes(10).create();
}

/* ========================================================================== */
/* INSTALAÇÃO (execute uma vez pelo editor)                                   */
/* ========================================================================== */

function instalar() {
  const ss = SpreadsheetApp.getActive();
  if (!ss) throw new Error('Este script precisa ser criado DENTRO de uma planilha (Extensões > Apps Script).');
  Object.keys(ABAS).forEach(function (k) {
    const def = ABAS[k];
    let sh = ss.getSheetByName(def.nome);
    if (!sh) sh = ss.insertSheet(def.nome);
    if (sh.getMaxColumns() < def.cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), def.cols.length - sh.getMaxColumns());
    const ultima = sh.getLastColumn();
    const cab = ultima > 0 ? sh.getRange(1, 1, 1, ultima).getValues()[0].map(String) : [];
    def.cols.forEach(function (c, i) {
      if (cab[i] && cab[i] !== c) throw new Error('A aba ' + def.nome + ' tem a coluna "' + cab[i] + '" onde deveria estar "' + c + '". Não altere a ordem das colunas.');
    });
    sh.getRange(1, 1, 1, def.cols.length).setValues([def.cols]).setFontWeight('bold').setBackground('#1d3348').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), def.cols.length).setNumberFormat('@');
  });
  limparMemo_();

  const existentes = {};
  ler_(ABAS.CONFIG).forEach(function (r) { existentes[r.chave] = true; });
  CONFIG_PADRAO.forEach(function (x) { if (!existentes[x[0]]) inserir_(ABAS.CONFIG, { chave: x[0], valor: x[1], descricao: x[2] }); });

  if (!ler_(ABAS.MODELOS).length) {
    MODELOS_PADRAO.forEach(function (m) {
      inserir_(ABAS.MODELOS, { id: novoId_('M'), nome: m[0], etapa: String(m[1]), templateMeta: m[2], idioma: 'pt_BR', corpo: m[3], ativo: 'SIM', atualizadoEm: agoraISO_(), assunto: ASSUNTOS_PADRAO[m[1]] });
    });
  }
  ler_(ABAS.MODELOS).forEach(function (m) {
    if (!m.assunto) { m.assunto = ASSUNTOS_PADRAO[m.etapa] || 'Seu orçamento de [SERVICO]'; salvar_(ABAS.MODELOS, m); }
  });

  let senhaInicial = '';
  if (!ler_(ABAS.USUARIOS).length) {
    senhaInicial = 'Vegas-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    const adm = { id: novoId_('U'), nome: 'Administrador', email: 'admin', perfil: 'admin', ativo: 'SIM', criadoEm: agoraISO_() };
    definirSenha_(adm, senhaInicial);
    inserir_(ABAS.USUARIOS, adm);
    registrar_(SISTEMA, '', 'USUARIO', adm.id, 'Usuário criado', 'Administrador inicial');
  }

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('WA_VERIFY_TOKEN')) props.setProperty('WA_VERIFY_TOKEN', Utilities.getUuid().replace(/-/g, ''));
  if (!props.getProperty('EMAIL_SEGREDO')) props.setProperty('EMAIL_SEGREDO', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  instalarGatilho_();
  registrar_(SISTEMA, '', 'SISTEMA', '', 'Instalação executada', 'Versão ' + VERSAO);
  SpreadsheetApp.flush();

  console.log('==============================================');
  console.log('CRM Vegas instalado (versão ' + VERSAO + ').');
  if (senhaInicial) {
    console.log('LOGIN DO ADMINISTRADOR: admin');
    console.log('SENHA INICIAL: ' + senhaInicial);
    console.log('Troque a senha no primeiro acesso (menu Minha conta).');
  } else {
    console.log('Usuários já existiam: nenhuma senha foi alterada.');
  }
  console.log('Próximo passo: Implantar > Nova implantação > App da Web.');
  console.log('==============================================');
}

/** Use se perder a senha do administrador: gera uma nova e mostra no registro. */
function redefinirSenhaAdmin() {
  comTrava_(function () {
    const adm = ler_(ABAS.USUARIOS).find(function (u) { return u.email === 'admin'; }) ||
      ler_(ABAS.USUARIOS).find(function (u) { return u.perfil === 'admin'; });
    if (!adm) throw new Error('Nenhum administrador encontrado. Execute instalar().');
    const senha = 'Vegas-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    definirSenha_(adm, senha);
    adm.ativo = 'SIM';
    salvar_(ABAS.USUARIOS, adm);
    registrar_(SISTEMA, '', 'USUARIO', adm.id, 'Senha redefinida pelo editor', adm.email);
    console.log('LOGIN: ' + adm.email + '  |  NOVA SENHA: ' + senha);
  });
}
