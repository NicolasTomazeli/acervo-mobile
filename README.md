# Acervo Mobile 0.7.3 — confirmação a partir de 94/100

Regra solicitada: a melhor candidata é confirmada automaticamente quando sua nota visual bruta é **maior ou igual a 94/100**. A diferença para a segunda candidata e os antigos limites individuais de qualidade, hash e gradiente não bloqueiam uma nota suficiente. Abaixo de 94, fica pendente. Se outra obra tiver nota muito próxima, aparece um aviso, sem impedir a confirmação. Em empate exato, a ordenação escolhe o menor ID; a foto sozinha não distingue cadastros com a mesma imagem.

A nota é **semelhança visual, não probabilidade de acerto**. A versão mantém a possibilidade de revisar ou desfazer uma identificação. A exibição trunca a nota em uma casa decimal, evitando mostrar 94,0 quando o valor bruto ainda é menor que 94. O CSV usa a mesma exibição.

## Publicar

1. Exporte um backup em Ajustes.
2. Extraia `acervo-mobile-v0.7.3-94-github.zip` e envie seu conteúdo à raiz do repositório, substituindo os arquivos de mesmo nome. Inclua `sw.js`, `matcher.js`, `foreground.js`, `matcher-worker.js`, `app.js`, `index.html` e a pasta `icons`, além dos demais arquivos do ZIP. Não envie apenas o ZIP nem crie uma subpasta de versão.
3. Aguarde Actions concluir a publicação do GitHub Pages.
4. Abra com internet, feche todas as abas e janelas do Acervo e abra novamente. Em Ajustes aparece **0.7.3** e a regra de 94/100.
5. Use **Reanalisar fotos** para aplicar a regra aos resultados antigos. A conferência anterior é mantida.

Não é necessário apagar dados, reinstalar ou importar o acervo novamente. Fotos, recortes, IDs e histórico são preservados. Descritores da 0.7.1 são compatíveis; os da 0.7.2 são recalculados a partir das fotos na primeira análise.

## Cálculo escolhido

Foi comparado o cálculo do original restaurado com o cálculo de estrutura da 0.7.1, ambos usando exatamente o mesmo limite de 94 e sem margem mínima. O segundo apresentou mais acertos e menos confirmações erradas nos testes disponíveis; por isso é usado nesta edição, com a nova regra simples de decisão. Os pesos são: tons normalizados 35%, pHash 25%, gradientes 22%, orientação de contornos 10% e cores distribuídas pela imagem 8%. São testados recortes e pequenas inclinações; a redução de fundo uniforme também pode contribuir, com desconto de 3% na nota obtida por esse caminho.

As condições internas que descartam representações sem detalhes ou máscaras de fundo inconsistentes continuam fazendo parte do cálculo. Depois que a nota final é obtida, nenhuma regra adicional de qualidade ou margem veta uma nota de pelo menos 94.

## Limites e testes

Em 2.345 consultas simuladas da base fornecida, o original com limite 94 confirmou 1.106, das quais 24 eram erradas; o cálculo escolhido confirmou 1.433, das quais 10 eram erradas. Ao remover a identidade correta do catálogo, as confirmações erradas foram 55/335 e 20/335, respectivamente. A nova regra não elimina falsos reconhecimentos. A comparação não inclui fotos reais novas do celular e não comprova que este seja o melhor método possível em campo. Consulte o relatório entregue.

O código completo e os testes estão na pasta `acervo-mobile-v0.7.3-94` entregue junto ao ZIP. O ZIP de publicação contém os arquivos do aplicativo e este README. Para testar: instale dependências com `npm install`, tenha Chrome instalado e defina `ACERVO_CATALOG` com o caminho do JSON original. Execute `npm test`, `npm run test:browser` e `npm run benchmark`. Para servir localmente: `python -m http.server 8000 --bind 127.0.0.1`.
