# Foto de perfil na página de Usuários

## Resultado
- Permitir que o administrador escolha, substitua ou remova a foto de cada usuário.
- Exibir a foto ao lado do nome na lista de usuários, mantendo a inicial como alternativa.
- Preservar todas as ações e regras atuais da página.

## Implementação
- Salvar a imagem no armazenamento do projeto com limite de tamanho e formatos de imagem permitidos.
- Registrar a referência da foto no perfil do usuário e carregá-la junto à listagem.
- Adicionar uma janela simples de edição da foto, com prévia, envio e remoção.

## Verificação
- Testar envio, substituição e remoção da foto.
- Confirmar a exibição na lista e a inicial quando não houver foto.
- Conferir a página em desktop e celular sem alterar outras funções.
