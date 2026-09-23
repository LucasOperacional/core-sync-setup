# Departamento Comercial completo

## Objetivo
Criar dentro da categoria **Comercial** um espaço completo para acompanhar clientes, vendas, propostas de terceirização, agenda, contratos e desempenho, reaproveitando os usuários e a autenticação atuais. O módulo terá identidade preta e vermelha apenas em suas telas, sem alterar as demais áreas do sistema.

## Estrutura das telas
- Adicionar ao menu Comercial: **Visão geral**, **Clientes**, **Funil**, **Propostas**, **Agenda**, **Contratos** e **Relatórios**; manter **Prospecção Google Maps** como origem de novos leads.
- Criar uma navegação interna compacta e adaptada para celular, com ações principais sempre visíveis.
- Usar superfícies escuras, vermelho como destaque, alta legibilidade, bordas discretas e os controles já existentes no projeto.

## Dados e segurança
- Criar o cadastro comercial sem duplicar usuários: responsáveis e vendedores serão vinculados aos usuários já existentes.
- Criar estruturas próprias para unidades, equipe comercial, clientes, contatos, interações, oportunidades, etapas do funil, propostas e versões, itens de postos/funções, atividades, contratos, documentos e auditoria comercial.
- Manter os papéis comerciais em tabela separada: **gestor comercial** e **vendedor**. Administradores atuais continuarão com acesso total.
- Proteger todas as tabelas: administrador vê tudo; gestor vê a equipe comercial; vendedor vê somente registros atribuídos a ele. Dados sem autorização não serão retornados nem pelo endereço direto da página.
- Registrar em auditoria inclusões, alterações de etapa, versões de propostas, perdas, contratos e exclusões.
- Preparar armazenamento protegido para documentos de propostas e contratos.

## Funcionalidades
### Visão geral
- Indicadores de leads recebidos, propostas enviadas, negociações, ganhos, perdas, valor previsto e conversão.
- Filtros por período, vendedor, cliente e unidade.
- Resumos do funil, atividades próximas e contratos a vencer.

### Clientes e leads
- Cadastro com razão social, nome fantasia, CNPJ validado, contatos, endereço, segmento, origem, responsável e unidade.
- Histórico cronológico de contatos, reuniões, notas e alterações.
- Permitir transformar um resultado da Prospecção Google Maps em lead, evitando duplicidade por CNPJ e, na ausência dele, por nome/telefone.

### Funil de vendas
- Quadro visual com as etapas iniciais: Novo lead, Primeiro contato, Diagnóstico, Proposta enviada, Negociação, Ganho e Perdido.
- Etapas administráveis e ordenáveis pelo gestor.
- Movimentação entre etapas por ação direta, com valor, probabilidade, responsável e previsão de fechamento.
- Motivo obrigatório quando uma oportunidade for marcada como perdida.

### Propostas
- Formulário para postos de trabalho, funções, quantidade de profissionais, jornada, escala, local, custos, margem, impostos, valor mensal e prazo.
- Cálculos automáticos dos totais, prévia completa antes do envio e histórico imutável de versões.
- Estados de rascunho, enviada, aprovada, recusada e expirada.
- Geração de PDF da proposta e exportação dos dados em Excel.

### Agenda
- Agenda e lista de tarefas, reuniões, retornos e lembretes vinculados ao cliente ou oportunidade.
- Filtros por responsável, tipo, período e situação; destaque para itens atrasados e próximos.

### Contratos
- Contratos gerados a partir de propostas aprovadas, com início, vigência, valor, reajuste, responsável e documentos.
- Alertas de vencimento e painel de implantação.
- Encaminhamento registrado para os departamentos responsáveis, com status de recebimento e implantação.

### Relatórios
- Desempenho por vendedor, origem, etapa e período.
- Conversão, valores ganhos/perdidos e tempo médio por etapa.
- Exportação em PDF e Excel, respeitando os mesmos filtros e permissões da tela.

## Integração técnica
- Usar consultas paginadas e filtros no banco para evitar lentidão; índices para responsável, cliente, etapa, unidade e datas.
- Usar carregamento sob demanda por tela e atualizar apenas as listas afetadas após cada ação.
- Reaproveitar os componentes, mensagens, autenticação e padrões de formulários existentes.
- Preservar a página atual de Prospecção Google Maps e conectá-la ao novo cadastro de leads.

## Validação
- Testar como administrador, gestor comercial e vendedor, comprovando a separação dos dados.
- Testar criação e edição de cliente, movimentação no funil, perda com motivo, versão e prévia de proposta, agenda, contrato e encaminhamento.
- Conferir os indicadores e exportações com dados reais cadastrados durante o teste.
- Validar computador e celular, inclusive formulários longos e quadro do funil.
- Validar tipagem, segurança das tabelas e o fluxo completo sem alterar módulos fora da categoria Comercial.
