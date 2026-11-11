# Plano e evidências de teste

Execute `npm test` com Node 22.13+.

**Verificado em testes automatizados de backend:** banco inicial vazio; cadastro com nome informado; proteção contra e-mail duplicado; separação de candidato/empresa; publicação; busca; candidatura única; isolamento entre empregadores; alteração de situação; edição de perfil; edição e encerramento de vaga; CSRF; senha errada; logout.

**Verificado na interface (API simulada no navegador isolado):** cadastro com nome escolhido, saudação personalizada, abertura de perfil e edição do nome.

**Não realizado nesta entrega:** teste ponta a ponta de navegador real conectado ao backend, testes externos com participantes do público-alvo, benchmark de carga, revisão de acessibilidade com tecnologia assistiva e pentest. O navegador automático desta execução bloqueou conexões a localhost, motivo pelo qual backend e interface foram verificados em ambientes separados.

## Procedimento manual sugerido

1. Empresa cria conta com dados de teste e publica vaga.
2. Candidato cria conta em janela anônima e pesquisa a vaga.
3. Candidato visualiza detalhes e se inscreve (não pode repetir).
4. Empresa consulta inscritos e atualiza status para Entrevista.
5. Candidato vê o novo status em Minhas candidaturas.
6. Tente com outra empresa acessar a vaga/inscrições e confirme acesso negado.
7. Recarregue e confirme que os dados continuam no SQLite.

Registre tempos, obstáculos, perfis codificados de participantes e autorizações antes de preencher os resultados de usabilidade do relatório.
