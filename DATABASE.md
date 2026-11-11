# Modelo de dados — SQLite

O banco é criado automaticamente em `data/sconnect.sqlite` ao iniciar o servidor.

| Entidade | Chave | Relação principal |
|---|---|---|
| `users` | `id` | Identidade, tipo, nome, email único, hash da senha |
| `profiles` | `user_id` | 0..1 perfil por candidato |
| `employers` | `user_id` | 1 cadastro empresarial por empregador |
| `jobs` | `id` | Cada vaga tem `employer_id` |
| `applications` | `id` | `job_id` e `candidate_id`, combinação única |
| `sessions` | `token_hash` | Sessão ligada a `user_id` e token CSRF |

**Cardinalidade:** empregador 1:N vagas; candidato 1:N candidaturas; vaga 1:N candidaturas. Restrição `UNIQUE(job_id,candidate_id)` impede candidatura duplicada. Chaves estrangeiras estão ativadas. O status da vaga é `Aberta`/`Encerrada`; candidatura `Em análise`/`Entrevista`/`Não selecionado`.

**Sem seed fictícia:** toda conta, vaga ou candidatura surge por ação do usuário. O banco não deve ser versionado no Git.

**Backup local antes de alterações:** interromper o servidor, copiar o arquivo SQLite e, se existirem, os arquivos WAL/SHM associados. Testar restauração em diretório separado antes de confiar no backup.

**Evolução necessária:** migrações versionadas, política de retenção e exclusão, auditoria e backups automatizados antes de produção.
