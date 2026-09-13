# Acervo Mobile 0.6.0

Versão aprimorada do projeto fornecido. Mantém o uso local no navegador e a compatibilidade com o JSON de importação 0.5.1 e os backups antigos.

## O que mudou

- Reconhecimento mais resistente a mudanças de luz e enquadramento; confirmação automática conservadora e sugestões para revisão.
- Miniaturas das referências, desfazer identificação e seleção de qualquer obra para confirmação manual.
- Motor em Worker, descritores menores, busca com acentos normalizados e carregamento da lista em lotes de 60.
- Importação reúne fotos de linhas com o mesmo patrimônio; imagens idênticas no mesmo cadastro não se repetem.
- Importação em lote atômica e restauração de backup validada antes da substituição. Falhas liberam os controles.
- Correção do carregamento offline: um arquivo JavaScript indisponível não recebe HTML no lugar dele.

## Colocar no lugar da versão atual

1. No aplicativo atual, exporte um **backup completo** e guarde o JSON.
2. Extraia o ZIP. Substitua os arquivos do site pelo conteúdo desta pasta no mesmo endereço de hospedagem. Inclua obrigatoriamente `matcher.js`, `matcher-worker.js` e `visual-client.js`, além dos arquivos já existentes. Não é necessário executar npm para publicar ou usar o app.
3. Depois da atualização, feche todas as abas/janelas do Acervo e abra novamente com internet. Confira a versão **0.6.0** em Ajustes. O Service Worker deixa a versão anterior terminar de ser usada antes de ativar a nova.
4. Os dados do aparelho continuam no mesmo banco. As referências antigas são atualizadas na primeira conferência. Se mudar de navegador, aparelho ou domínio, importe o backup guardado.
5. Para acrescentar as fotos que a versão antiga descartava em linhas repetidas, importe novamente o **JSON de importação original** em Ajustes → Importar acervo em lote. Em uma base vazia, o arquivo fornecido resulta em 348 cadastros e 374 fotos.

O ZIP contém código e documentação. O JSON do acervo não é embutido no site: use o arquivo original enviado. A análise das fotos suspeitas foi entregue separadamente, porque exige conferência do responsável pelo acervo.

## Usar a conferência

Use uma foto por obra, de frente, com a obra ocupando boa parte da imagem. Escolha até sete fotos por conferência. O app ordena cinco candidatos e mostra referências para comparação. Quando a correspondência não atende ao limite conservador, fica pendente. É possível selecionar outra obra do acervo ou deixar pendente.

“Índice visual” é uma medida de semelhança, não uma probabilidade de acerto. Para peças semelhantes ou fotos associadas ao cadastro errado, confira patrimônio e detalhes da peça. A versão não localiza várias obras numa foto de sala inteira.

## Testar localmente

Na pasta extraída, execute `python -m http.server 8000 --bind 127.0.0.1` e abra `http://127.0.0.1:8000`. Não abra `index.html` por duplo clique: câmera, Worker e instalação offline dependem da origem do site. No celular, utilize a hospedagem HTTPS habitual.

## Testes para desenvolvimento

Com Node.js instalado, `npm test` executa os cinco testes unitários sem dependências adicionais. Os testes de navegador usam Chrome instalado e Playwright 1.62.1:

```powershell
npm install
$env:ACERVO_CATALOG = "C:\caminho\acervo_importacao_base_obras_gpt_v0_5_1.json"
npm run test:browser
npm run benchmark
```

Os scripts iniciam um servidor temporário restrito a localhost e usam um navegador de teste isolado. Resultados ficam em `.test-results/`. Os testes funcionais verificam as contagens específicas da base fornecida; outro acervo exige adaptar essas expectativas.

Leia `VALIDACAO.md` para os resultados, a metodologia e as limitações. Os testes com transformações artificiais melhoraram, mas a precisão em campo ainda precisa ser medida com fotos novas de celular.
