# Segurança — estado verificado e pendências

**Implementado:** senhas com `scrypt` e salt aleatório; sessões usando token aleatório cujo hash fica no banco; cookie `HttpOnly; SameSite=Strict`, `Secure` se conexão HTTPS direta; CSRF em requisições autenticadas; bloqueio de escritas com origem diferente; validação de tamanho e tipo JSON; queries preparadas; autorização de candidato/empregador; verificação de propriedade da vaga; e-mail único; restrição contra duplicidade de candidaturas; limite simples de requisições de login/cadastro por IP.

**Ambiente:** `127.0.0.1` por padrão. **Não** colocar este MVP em produção pública sem avaliação específica.

**Pendências relevantes:** HTTPS e proxy confiável, verificação e recuperação de e-mail, proteção antifraude/rate limit persistente, monitoramento/auditoria, testes de segurança especializados, backup e restauração, proteção de dados LGPD (base legal, informação ao titular, exclusão/exportação, política de retenção), revisão de acessibilidade, validação de conteúdo publicado e integração contínua.

**Dados reais:** não utilizar informações pessoais reais até que exista processo ético e de proteção adequado. Não incluir o arquivo SQLite em commits.
