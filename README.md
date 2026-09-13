# Acervo Mobile 0.7.0

Atualização dedicada à interferência do fundo nas fotos. Mantém cadastro, importação, backup, conferências e processamento local das versões anteriores.

## Para testar a garrafa com outro fundo

1. No cadastro da peça, toque em **Editar** e depois em **Delimitar obra**, abaixo da foto de referência.
2. Arraste um retângulo envolvendo a peça inteira, deixando pouco fundo. Toque em **Usar esta área** e depois em **Salvar alterações**.
3. Na nova conferência, escolha a foto e use **Delimitar obra** para enquadrar a mesma peça inteira. Inicie a conferência.
4. Compare as referências sugeridas. Resultados incertos ficam pendentes; você pode confirmar, escolher outra obra ou desfazer uma identificação.

O retângulo pode ser ajustado por toque/mouse ou pelos controles em **Ajustar pelas margens**. **Foto inteira** desfaz a seleção; **Cancelar** mantém o enquadramento anterior. Não é necessário cortar as fotos em outro aplicativo.

## Redução automática de fundo

O motor procura uma região de fundo de cor aproximadamente uniforme, conectada às bordas da foto, e compara também o objeto restante em um enquadramento normalizado. Isso ajuda quando a parede muda de cor ou a peça aparece em outro tamanho/posição.

Essa análise é auxiliar: não é uma IA que entende qualquer objeto e não promete remover cenários complexos. Quando o fundo não atende aos critérios, a comparação original continua disponível. Uma sugestão obtida somente por essa redução de fundo **sempre exige confirmação manual**, porque descartar pixels pode eliminar detalhes importantes.

Para fundos estampados, objetos transparentes, reflexos, sombras fortes ou peça pouco contrastante, use a seleção manual e deixe pouco fundo nos dois lados da comparação. Se a foto já foi tirada muito de longe, selecionar a área não cria os detalhes que faltam.

## Fotos e compatibilidade

- A seleção é não destrutiva: o banco mantém a foto original, o retângulo selecionado e os descritores da área usada. Não salva uma nova foto comprimida sobre o original.
- O resultado mostra a área analisada. O backup exporta a foto original e as seleções de referências e conferências.
- Os backups antigos e o JSON de importação 0.5.1 continuam aceitos. A restauração valida as seleções antes de substituir dados.
- O banco mantém nome e versão de esquema. Descritores antigos são recalculados na primeira análise ou ao salvar uma referência editada.
- A importação continua reunindo fotos de linhas com o mesmo patrimônio, sem repetir arquivos idênticos.

## Atualizar o site

1. Exporte um backup completo da versão em uso.
2. Extraia o ZIP e substitua o conteúdo do site pelos arquivos desta pasta no mesmo endereço. Inclua também os novos `foreground.js` e `focus-crop.js`; não precisa executar npm para usar ou publicar.
3. Feche todas as abas e janelas do Acervo e abra novamente com internet. Confirme a versão **0.7.0** em Ajustes. A nova versão do cache assume depois que as abas antigas forem fechadas.
4. Depois do primeiro carregamento, a seleção de área e a análise funcionam offline.

O acervo não está embutido no código. Para uma instalação vazia, use o JSON original enviado. No mesmo navegador e domínio, o banco existente é reaproveitado.

## Desenvolvimento e testes

Para abrir localmente: execute `python -m http.server 8000 --bind 127.0.0.1` nesta pasta e acesse `http://127.0.0.1:8000`. No celular, use a hospedagem HTTPS habitual. Abrir `index.html` por duplo clique não habilita todas as funções.

Com Node.js, `npm test` executa oito testes unitários. Para testes em Chrome instalado:

```powershell
npm install
$env:ACERVO_CATALOG = "C:\caminho\acervo_importacao_base_obras_gpt_v0_5_1.json"
npm run test:browser
npm run test:background
npm run benchmark
```

Os scripts usam um navegador de teste isolado e um servidor temporário restrito a localhost. Os resultados ficam em `.test-results/`. O teste de importação espera as contagens da base fornecida. O arquivo `tests/matcher-v3.js` preserva o motor 0.6.0 apenas para comparação no teste de fundos; não é carregado pelo aplicativo.

Leia `VALIDACAO.md`: os testes sintéticos ajudam a detectar regressões, mas ainda não medem a precisão real com fotos novas no trabalho.
