# Padrão de código

- JavaScript estrito; identação de dois espaços.
- Backend concentrado em `server.js` para manter o MVP compreensível à equipe; separar em módulos de rotas, autenticação, serviços e acesso a dados antes de ampliar o sistema.
- Usar validação no servidor para entradas de usuários, independentemente da validação no HTML.
- Consultas ao SQLite com parâmetros preparados; não concatenar valores do usuário em SQL.
- Escapar conteúdo exibido em HTML com a função `html()`; nunca inserir texto de usuário diretamente como marcação.
- Decidir permissão no backend por sessão e propriedade, nunca somente na interface.
- Novas funcionalidades precisam de teste automatizado e atualização em `docs/`.
- Não alterar o banco do usuário, VPS ou ambiente produtivo durante testes.
