# Modernização visual do sistema

Objetivo: deixar a interface mais leve, organizada e profissional, **sem mudar cores, temas, dados, permissões ou qualquer funcionalidade**.

## O que será feito

### 1. Padrões globais (tokens)
- Cantos arredondados um pouco maiores (12–14px) para cards e botões.
- Sombras mais suaves e bordas mais finas nos dois temas.
- Transições rápidas e naturais (~180ms) e respeito a "reduzir movimento" do sistema.
- Espaçamentos padronizados nas páginas.

### 2. Componentes compartilhados
- **Botões**: altura confortável (40–44px), toque mínimo de 44px no celular, peso de fonte consistente, leve elevação no hover, pequeno recuo ao clicar, foco visível pelo teclado e estado desativado claro. Variantes padronizadas: principal, secundário, contorno, discreto, perigo e só ícone.
- **Cards**: borda fina, cantos 12–14px, sombra leve, respiro interno melhor e hierarquia clara entre título, número e texto de apoio.
- **Campos de formulário** (texto, seleção, área de texto, data): mesma altura, mesmo arredondamento, rótulo sempre visível e campo ativo destacado na cor principal atual.
- **Tabelas**: linhas mais legíveis, cabeçalho fixo quando a tabela rola, hover suave, ações compactas e rolagem horizontal controlada no celular.
- **Modais e avisos**: tamanho compacto, nunca maior que a tela, fecha por botão, Esc e clique fora; avisos discretos de sucesso, erro, alerta e informação.

### 3. Menu lateral e cabeçalho
- Menu mais compacto, ícones alinhados, item ativo destacado de forma suave, recolher/expandir no computador e gaveta no celular (mantendo nome e sessão do usuário embaixo).
- Cabeçalho mais baixo e organizado, com título da página visível e ações (tema, sair) equilibradas.

### 4. Verificação
- Conferência nas larguras de celular, tablet e computador, sem texto cortado, rolagem indevida ou modal maior que a tela.
- Checagem de erros no console e build final.

## O que NÃO muda
Paleta de cores, temas claro/escuro, banco de dados, login, permissões, integrações, rotas, campos, filtros e regras de negócio.
