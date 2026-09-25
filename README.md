# SDR Control — Vegas Vigilância e Segurança

Sistema limpo, **sem dados de demonstração**, com **banco de dados central** no Google Apps Script (Planilha Google). O site continua no GitHub Pages.

- Tudo o que uma SDR cadastra aparece para o administrador em até 25 segundos, em qualquer aparelho.
- Cada SDR vê e altera **apenas os próprios clientes**, visitas e orçamentos. Isso é garantido pelo servidor, e não só pela tela.
- **Sem internet:** o que a SDR cadastrar fica guardado no celular e é enviado sozinho quando a conexão voltar. Aparece o aviso "Sem conexão · X pendentes".
- **Senhas:** são conferidas no servidor e nunca ficam no navegador.

---

## 1) Banco de dados no Google Apps Script

1. **Crie o projeto.** Acesse **script.google.com** com a conta Google da empresa, clique em **Novo projeto** e renomeie para **SDR Control – Banco**.
2. **Cole o servidor.** Abra o `Código.gs`, apague tudo e cole o conteúdo de **`apps-script/Code.gs`**.
3. **Ajuste o manifesto.** Vá em **⚙ Configurações do projeto** e marque **Mostrar arquivo de manifesto "appsscript.json"**. Volte ao editor e cole o conteúdo de **`apps-script/appsscript.json`**.
4. **Salve e instale.** Salve (Ctrl+S). Escolha a função **instalar** e clique em **▶ Executar**. Autorize: **Revisar permissões**, depois **Avançado**, **Acessar** e **Permitir**.
   - Isso cria a planilha **"SDR Control · Banco de Dados"** no seu Google Drive, vazia, só com os usuários.
5. **Publique.** Vá em **Implantar → Nova implantação**, escolha o tipo **App da Web** e configure:
   - **Executar como:** Eu
   - **Quem pode acessar:** **Qualquer pessoa**
   - Clique em **Implantar** e **copie o URL** que termina em **/exec**.

## 2) Site no GitHub (repositório `VegasVig/sdr`)

1. **Envie os arquivos novos.** No repositório, clique em **Add file → Upload files** e envie **todos os arquivos desta pasta**, menos a pasta `apps-script`: `index.html`, `script.js`, `style.css`, `sw.js`, `config.js`, `manifest.json`, `README.md` e a pasta `assets`. Confirme a substituição dos antigos e clique em **Commit changes**.
2. **Configure o endereço do banco.** Abra **`config.js`** no GitHub, clique no ✏ e troque `COLE_AQUI_O_ENDERECO_DO_APPS_SCRIPT` pelo endereço **/exec**, mantendo as aspas. Clique em **Commit changes**.
3. **Espere e recarregue.** Aguarde 1 a 2 minutos. Abra o site e recarregue com **Ctrl+F5**. No celular com o app instalado, feche e abra de novo.

## 3) Primeiro acesso

| Usuário | Senha inicial | Perfil |
|---|---|---|
| admin | vegas2026 | Administrador (vê tudo) |
| maria | maria123 | SDR Maria Izabel |
| daiana | daiana123 | SDR Daiana |
| regiane | regiane123 | SDR Regiane |

**Todos devem trocar a senha** em Configurações → Minha senha. A dica com a senha foi retirada da tela de login.

## Trazer o que já foi cadastrado na versão antiga

A versão antiga guardava os dados **no navegador de cada pessoa**. Para não perder nada:

1. **Antes de atualizar o GitHub**, peça para cada pessoa abrir o sistema antigo e ir em **Configurações → Baixar backup (JSON)**. Na versão antiga, só o login **admin** tem essa opção. Se a SDR usou o próprio aparelho, entre como admin nele para baixar.
2. Depois de atualizar, entre como **admin** e vá em **Configurações → Importar backup antigo**, um arquivo por vez.
3. A importação **junta** os dados, sem apagar o que já existe, e **ignora os dados DEMO** automaticamente.

## Bom saber
- **Planilha:** fica no seu Google Drive, com as abas Usuarios, Clientes, Visitas, Orcamentos, Notificacoes e Config. Pode ser consultada à vontade, mas **não edite a coluna `json`**, porque ela guarda o registro completo.
- **Número do orçamento:** é controlado pelo servidor. Se duas SDRs criarem orçamento ao mesmo tempo, a segunda recebe o próximo número livre, e o sistema avisa.
- **Telefone repetido:** se uma SDR cadastrar um telefone que já é de cliente de outra SDR, o sistema avisa quem já atende aquele contato.
- **Atualizar o Code.gs depois:** vá em **Implantar → Gerenciar implantações → ✏ → Nova versão → Implantar**. O endereço /exec continua o mesmo.
