# Movimentação de posto em lote nas Folhas

## Entrega
- Adicionar uma opção com ícone na aba **Usuários** de Folhas de Ponto.
- Abrir uma janela para buscar o posto de destino, escolher a data e o motivo.
- Permitir importar uma planilha com os colaboradores ou selecionar colaboradores encontrados na NEXTI.
- Mostrar a prévia com colaborador, posto atual e situação da validação.
- Enviar todos os colaboradores válidos diretamente à NEXTI em uma única ação.
- Exibir ao final quantos foram movimentados e os motivos de cada falha.

## Regras
- Validar colaborador, posto de destino e vaga compatível antes de cada movimentação.
- Não movimentar quem já estiver no posto escolhido.
- Processar cada colaborador separadamente para uma falha não impedir os demais.
- Manter intactos os cadastros, sincronizações e demais opções da página.

## Detalhes técnicos
- Reutilizar as consultas de colaboradores/postos e a validação de vagas já existentes.
- Criar uma função protegida para executar o lote diretamente no endpoint de movimentações da NEXTI.
- Não alterar tabelas nem o fluxo atual de movimentação individual com assinatura e aprovação.
