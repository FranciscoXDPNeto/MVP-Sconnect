# Sconnect — MVP acadêmico

Plataforma web de oportunidades de trabalho com foco inicial em Saquarema (RJ), desenvolvida para o projeto de Práticas Extensionistas IV. **Este repositório contém um MVP com backend e banco de dados reais, distinto do protótipo somente em memória da Seção 9.**

## O que funciona

- Cadastro de candidato e empresa com **nome informado pela pessoa**, e-mail e senha. **Nenhum usuário ou nome é criado automaticamente.**
- Login com sessão por cookie HttpOnly e senha armazenada com hash `scrypt` e salt aleatório.
- Perfil do candidato: formação, experiência, habilidades e edição.
- Perfil da empresa: responsável, nome e localização, com edição.
- Criação, edição, encerramento e reabertura de vagas pela **empresa proprietária**.
- Busca pública de vagas abertas por cargo, empresa ou cidade, com filtros por tipo de contrato.
- Candidatura única por candidato/vaga e acompanhamento de situação.
- Visualização de candidatos e atualização de situação pela empresa responsável pela vaga.
- Dados persistidos em SQLite, com relações e restrições no banco.
- Interface responsiva para smartphone e computador.

## Requisitos

- **Node.js 22.13 ou superior** (recomendação: Node 22 LTS, testado no 22.16).
- Windows, Linux ou macOS.
- VS Code e navegador atual.
- **Não precisa instalar pacotes npm externos**, VPS, Vercel, serviços pagos ou servidor de banco separado.

A API `node:sqlite` ainda é experimental na linha Node 22; por isso o comando de execução inclui `--experimental-sqlite`. Teste uma versão compatível antes de atualizar o Node.

## Como executar no VS Code

1. Extraia a pasta `Sconnect_MVP` e abra **essa pasta** no VS Code.
2. Abra **Terminal > Novo Terminal**.
3. Confirme `node -v` (precisa ser pelo menos 22.13).
4. Execute:

```bash
npm start
```

5. Acesse **http://127.0.0.1:3000** no navegador.

A aplicação cria automaticamente o arquivo `data/sconnect.sqlite` na primeira inicialização. **Não abra o `index.html` diretamente**: as telas dependem da API local para cadastro e vagas.

Para reiniciar o servidor, interrompa com `Ctrl + C` e execute `npm start` outra vez. Os dados permanecem no SQLite.

### Testes automatizados

```bash
npm test
```

Os nove testes cobrem cadastro, login, permissões, CRUD de vagas, filtros, candidatura única, consulta e alteração de situações, atualização de perfil e proteção CSRF.

## Estrutura

```text
Sconnect_MVP/
├── public/
│   ├── index.html         # Estrutura semântica da aplicação
│   ├── style.css          # Layout responsivo e identidade visual
│   └── app.js             # Navegação e chamadas à API
├── server.js              # Servidor HTTP, regras, sessão e SQLite
├── data/
│   └── .gitkeep           # Banco SQLite é criado ao iniciar (ignorado no Git)
├── tests/
│   └── flows.test.js      # Testes automatizados, Node test runner
├── docs/                  # Requisitos, arquitetura e procedimentos
├── package.json
├── .gitignore
└── README.md
```

## Como verificar o fluxo completo

1. Abra o site e crie uma **conta empresarial**, usando dados de teste.
2. A empresa deve publicar uma vaga válida no painel.
3. Abra uma **janela anônima ou outro navegador** e crie uma conta de candidato, com o nome que desejar. Isso mantém as duas sessões separadas.
4. No painel do candidato, busque a vaga, consulte detalhes e envie sua candidatura.
5. Volte à sessão da empresa, clique em **Candidaturas** na vaga e altere a situação para **Entrevista**.
6. Retorne à sessão do candidato e abra **Candidaturas**: o novo status estará visível.
7. Recarregue a página: a conta e os dados continuarão no banco; o nome exibido é sempre o cadastrado.

**Observação:** não há vagas iniciais pré-cadastradas. O banco começa vazio; por isso a primeira ação útil é cadastrar uma empresa e publicar uma vaga.

## API resumida

| Método e rota | Finalidade | Perfil |
|---|---|---|
| `POST /api/auth/register` | Cadastro | Público |
| `POST /api/auth/login` | Login | Público |
| `POST /api/auth/logout` | Sair | Autenticado |
| `GET /api/auth/me` | Sessão e CSRF | Público |
| `GET /api/jobs` | Buscar vagas abertas | Público |
| `GET /api/jobs/:id` | Detalhes da vaga | Público (aberta) |
| `GET/PUT /api/profile` | Perfil profissional | Candidato |
| `GET/PUT /api/employer` | Dados da empresa | Empregador |
| `GET /api/employer/jobs` | Vagas próprias | Empregador |
| `POST /api/jobs` | Publicar vaga | Empregador |
| `PATCH /api/jobs/:id` | Editar/encerrar/reabrir | Dono da vaga |
| `POST /api/jobs/:id/apply` | Candidatar-se | Candidato |
| `GET /api/applications/mine` | Minhas candidaturas | Candidato |
| `GET /api/jobs/:id/applications` | Inscrições recebidas | Dono da vaga |
| `PATCH /api/applications/:id/status` | Atualizar situação | Dono da vaga |

Nas operações autenticadas de escrita, o navegador envia o token CSRF retornado na sessão. Os dados privados dos candidatos só são retornados à empresa proprietária da vaga à qual se candidataram.

## Segurança e limitações

**MVP para ambiente local e homologação acadêmica, não homologado para produção pública.** Há controles iniciais (hash de senha, cookies HttpOnly/SameSite, consultas preparadas, CSRF, autorização e limites de entrada), mas ainda faltam testes de segurança especializados, HTTPS em implantação, recuperação de senha, confirmação de e-mail, política de privacidade e consentimento, exclusão/exportação de dados, gestão de retenção, backups/restauração comprovados, observabilidade, revisão de acessibilidade e testes com participantes externos.

O armazenamento inclui nomes, e-mails e qualificações; use **dados fictícios nos testes** e não exponha o serviço na internet até realizar as validações. O arquivo `data/sconnect.sqlite` está excluído do Git. Não copie esse banco para o repositório.

**Sem publicação automática:** o comando `npm start` apenas executa no computador local (`127.0.0.1`); não altera sites, VPS ou repositórios existentes.

## Estado das evidências

- **Implementado:** código da API, UI e banco, com nove testes de integração aprovados no ambiente de desenvolvimento.
- **Verificado na interface:** cadastro com nome informado, saudação, perfil e edição de nome em teste de interface com API simulada.
- **Ainda não comprovado:** testes ponta a ponta no navegador conectado ao backend e validação com usuários externos. Esses itens permanecem pendentes nas Seções 9.2–9.5 e 10.4 do relatório.

Imagem demonstrativa em `docs/assets/tela-principal-teste.png`: teste da interface com dados de ensaio, não registro de usuário real.

## Documentação de engenharia

- [PRD](docs/PRD.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Banco de dados](docs/DATABASE.md)
- [Segurança](docs/SECURITY.md)
- [Padrão de código](docs/CODE_STYLE.md)
- [Testes](docs/TESTING.md)
- [Guia para agentes](docs/AGENTS.md)

Projeto acadêmico Sconnect — Engenharia de Software — Práticas Extensionistas IV.
