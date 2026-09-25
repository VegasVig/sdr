# SDR Control — Vegas Vigilância e Segurança

Abra `index.html` no navegador. Funciona offline (jsPDF está em `assets/vendor`).

Acessos iniciais (troque em Configurações > Usuários):
- admin / vegas2026 (vê tudo)
- maria / maria123, daiana / daiana123, regiane / regiane123 (cada SDR vê só os próprios clientes)

Dados DEMO: Configurações > Remover dados DEMO.
Backup: Configurações > Baixar backup (JSON). Faça semanalmente.

PWA: publique a pasta em um servidor HTTPS (GitHub Pages, Netlify) para instalar no celular.
Migração para Supabase/Firebase: reescrever apenas `Adapter.load/save` em script.js.
