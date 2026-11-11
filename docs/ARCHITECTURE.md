# Arquitetura

```text
Navegador (HTML + CSS + JS sem frameworks)
            |
       fetch JSON
            |
      Node.js HTTP
  autenticação / autorização
            |
      SQLite local
```

- `public/index.html`: estrutura semântica, acesso à aplicação.
- `public/style.css`: responsividade mobile-first e componentes.
- `public/app.js`: estado de navegação, formulários e requisições.
- `server.js`: servidor de arquivos, endpoints REST, validações, sessões e regras de negócio.
- `data/sconnect.sqlite`: persistência local e restrições relacionais.

Sem APIs externas, serviços pagos ou infraestrutura paralela. Inicia somente em `127.0.0.1:3000`, configurável por `HOST`/`PORT` para homologações autorizadas. Não foi preparado para distribuição pública.

**Rotas de sistema relevantes:** `/api/auth/*`, `/api/profile`, `/api/employer`, `/api/jobs*`, `/api/applications/*`.

**Decisão técnica:** reduzir a curva de instalação para a equipe acadêmica, usando os módulos nativos `node:http`, `node:crypto`, `node:sqlite` do Node 22. No Node 22, `node:sqlite` ainda é experimental.
