# AGENTS — orientação de desenvolvimento

**Estado:** MVP acadêmico local, sem implantação pública.

1. Ler `README.md`, `docs/PRD.md`, `docs/SECURITY.md` e `docs/TESTING.md` antes de alterações.
2. Não criar usuários, empresas, vagas ou candidaturas fictícias em banco compartilhado. Somente testes isolados usam dados de ensaio.
3. Não alterar VPS, produção, deploy, bancos externos ou outros repositórios sem autorização específica.
4. Antes de mudar a estrutura do banco, criar plano de migração e backup restaurável; nada destrutivo por padrão.
5. Validar que permissões de cada endpoint são aplicadas no servidor; jamais presumir isolamento por esconder controles no frontend.
6. Executar `npm test`, revisar diffs, registrar riscos e confirmar manualmente fluxos críticos em navegador.
7. Em handoff: registrar arquivos modificados, testes executados (com resultados), pendências, riscos e próximo passo.
