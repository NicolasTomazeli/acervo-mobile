# Acervo Mobile 0.7.2 — reconhecimento original restaurado

Esta edição recupera o cálculo visual e os critérios de confirmação do projeto enviado originalmente. As versões 0.6 e 0.7 trocaram esse motor e introduziram condições que deixavam casos reconhecidos pelo original como pendentes. A recuperação mantém o processamento em segundo plano, os recortes manuais, a importação que reúne fotos do mesmo patrimônio e a preservação dos dados.

## Como atualizar no GitHub

1. No aplicativo atual, use Ajustes → Exportar backup.
2. Extraia `acervo-mobile-v0.7.2-original-github.zip` e envie **o conteúdo extraído**, substituindo os arquivos de mesmo nome na raiz do repositório. Não envie apenas o ZIP nem crie uma subpasta para esta versão. Inclua `sw.js` e a pasta `icons`.
3. Aguarde a publicação do GitHub Pages terminar com sucesso em Actions.
4. Abra o aplicativo com internet, feche todas as abas do site e o aplicativo instalado e abra novamente. Em Ajustes deve aparecer **0.7.2 — reconhecimento do projeto original restaurado**.
5. Para testar resultados antigos, use **Reanalisar fotos**. A nova conferência será salva separadamente. Os descritores serão preparados automaticamente na primeira análise, sem apagar fotos, IDs ou histórico.

Não precisa importar o acervo novamente, limpar os dados do site ou reinstalar. O banco continua sendo `acervo-mobile-db`, versão 2, na mesma origem e no mesmo perfil do navegador. Arquivos antigos de testes ou `foreground.js` que já estejam no repositório não são carregados pelo aplicativo desta edição.

## O que foi restaurado

- Imagem inteira preservando proporção e recorte central quadrado, como no original.
- Mesmos quatro cruzamentos entre as duas representações das fotos.
- Mesmos pesos de hash médio (22%), cores (25%), tons normalizados (31%) e contornos (22%).
- Confirmação a partir de 0,82 e diferença de pelo menos 0,035 para a segunda obra; com uma única candidata, vale o limite de pontuação original.
- Sem os bloqueios adicionais de pHash, gradientes e qualidade introduzidos nas versões seguintes. A redução automática de fundo também deixou de participar da comparação. A delimitação manual permanece disponível.

Os descritores antigos são recalculados a partir das fotos preservadas. Imagens uniformes, que produziam divisões por zero no código original, ficam pendentes com índice numérico em vez de contaminar a ordenação com NaN.

## Limites

Esta é uma recuperação do comportamento original, não uma alegação de aumento geral de precisão. O motor original também pode errar e continua sensível a iluminação e fundo. Duas referências muito parecidas ainda podem exigir confirmação. Os testes não incluem novas fotos reais do celular do usuário. Consulte o relatório de validação para os erros observados e a metodologia.

## Desenvolvimento e testes

O código completo e os testes ficam na pasta `acervo-mobile-v0.7.2-original` entregue junto do ZIP. O ZIP de publicação contém apenas os arquivos necessários ao site e este README.

Para testar localmente: `python -m http.server 8000 --bind 127.0.0.1` nesta pasta; abra http://127.0.0.1:8000. Para os testes automatizados, instale as dependências com `npm install`, tenha Chrome instalado e defina `ACERVO_CATALOG` como o caminho do JSON original. Execute `npm test`, `npm run test:browser` e `npm run benchmark`. O catálogo pessoal não está incluído nos pacotes.
