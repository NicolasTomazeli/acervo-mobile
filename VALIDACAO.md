# Validação — versão 0.7.0

Executada em 13/09/2026 no Windows, usando Chrome headless. Não houve fotos novas de câmera disponíveis. Nenhum número abaixo deve ser interpretado como precisão comprovada em campo.

## Mudança de fundo — comparação com 0.6.0

Foram desenhadas em Canvas 32 garrafas opacas com a mesma silhueta, quatro cores de corpo e padrões distintos no rótulo. Cada referência tinha um fundo uniforme. As consultas mudaram cor do fundo e, em uma condição, posição e tamanho. A identidade correta é conhecida porque as imagens são geradas pelo teste.

| Condição | Primeiro candidato correto na 0.6.0 | Primeiro candidato correto na 0.7.0 |
|---|---:|---:|
| cinza | 8/32 | 32/32 |
| fundo escuro | 8/32 | 20/32 |
| posição e tamanho | 0/32 | 31/32 |

O motor novo não fez nenhuma confirmação automática errada nessas 96 consultas. Outras 32 garrafas com rótulos não cadastrados não foram confirmadas automaticamente. A análise e a classificação de uma consulta demoraram aproximadamente 3 ms para esse catálogo de 32 peças no computador de teste, sem contar transporte para Worker e carregamento inicial.

Isso demonstra uma melhora no cenário sintético testado. Não demonstra que uma garrafa real, especialmente transparente ou com reflexos, será identificada corretamente. O fundo escuro continua sendo uma limitação nesse teste: houve 12 primeiras sugestões incorretas em 32 casos, mantidas para revisão.

## Regressão com a base fornecida

370 linhas reunidas em 348 cadastros por patrimônio, com 374 referências distintas dentro dos cadastros. Há 335 cadastros com foto e 13 sem foto. Para ambos os motores, todas as referências complementares do mesmo patrimônio foram mantidas. A coluna antiga usa o motor do ZIP original, anterior à 0.6.0, e os descritores do JSON.

| Consulta | Primeiro correto: ZIP original | Primeiro correto: 0.7.0 | Confirmações erradas: original / 0.7.0 |
|---|---:|---:|---:|
| Referência original | 325/335 | 335/335 | 0 / 0 |
| Luz aumentada | 324/335 | 334/335 | 0 / 0 |
| Escurecimento | 114/335 | 334/335 | 3 / 0 |
| Margem ao redor | 222/335 | 324/335 | 4 / 0 |
| Inclinação de 6° | 316/335 | 318/335 | 0 / 0 |
| Recorte central | 221/335 | 323/335 | 3 / 0 |
| Desfoque | 329/335 | 328/335 | 0 / 0 |

Total: **2.296/2.345 primeiras sugestões corretas** no teste da 0.7.0, contra 2.292/2.345 na 0.6.0. A diferença entre 0.6.0 e 0.7.0 ocorreu nas consultas recortadas: 319 passaram para 323 acertos; as demais condições mantiveram as contagens anteriores.

Ao retirar o cadastro correto antes da consulta, a 0.7.0 fez **2 confirmações erradas em 335 casos**, o mesmo resultado da 0.6.0. O motor do ZIP original fez 32. As duas falhas envolvem as referências muito próximas de “Paisagem” e “Paisagem II”. Cinco imagens de cor uniforme continuaram pendentes.

As transformações são feitas na primeira referência de cada cadastro: brilho 1,2/contraste 0,85; brilho 0,65; margem de 12% de cada lado; inclinação de 6°; recorte de 7% de cada lado; desfoque de 2 pixels. Imagens transformadas têm largura 320 e JPEG de qualidade 0,85. Como a consulta deriva da própria referência e esta base já foi usada no desenvolvimento, não é avaliação independente. Os resultados detalhados estão em `tests/resultado-validacao.json` e `tests/resultado-fundos.json`.

## Implementação e limites

O motor continua comparando cores, luminância normalizada, pHash/DCT e gradientes, com vários enquadramentos. A análise adicional de fundo usa uma imagem com lado máximo de 160 pixels, estima a cor predominante da borda e remove somente pixels de cor próxima conectados às bordas. Exige borda suficientemente uniforme e um componente de objeto dominante; outras situações retornam sem essa análise auxiliar.

Quando ambas as fotos geram uma área de objeto válida e de proporção compatível, o motor compara essas áreas. O índice desse caminho é limitado a 97/100, abaixo do limite de confirmação automática de 98,5/100. Ele pode reordenar sugestões, mas não confirmar sozinho. Também continua exigindo margem e critérios de detalhes para confirmação pela comparação original. Os índices não são probabilidades.

Os parâmetros de fundo foram definidos e verificados com os testes sintéticos deste pacote. Não são uma segmentação semântica treinada. Fundo complexo, baixo contraste, transparência, iluminação irregular, reflexo e mudança forte de perspectiva continuam exigindo seleção manual, nova foto ou revisão.

Na seleção manual, o retângulo é guardado em coordenadas proporcionais à foto. A imagem original não é substituída. Os descritores são recalculados quando a seleção muda, e o backup preserva essas coordenadas. Exibir a área no resultado exige gerar temporariamente o recorte a partir da foto original.

## Verificações funcionais

Passaram os oito testes unitários, incluindo imagens uniformes, objeto em dois fundos, rejeição de fundo complexo, descritores inválidos, duplicidade visual e catálogo vazio. Passaram os testes de seleção por arraste, cancelamento sem alteração, cadastro com recorte, preservação do original, reconhecimento do recorte, backup e restauração de áreas, rejeição de área inválida, retorno à foto inteira e seleção offline.

Também passaram novamente os testes anteriores: importar 348 cadastros, reunir fotos, reimportar sem duplicar, cadastrar, editar, remover foto, excluir, buscar sem acento, atualizar descritores antigos, reconhecer via Worker e fallback, desfazer e confirmar outro candidato, exportar CSV, restaurar backup, reverter transação abortada, preservar dados em importação inválida, liberar a interface após falha de imagem e reconhecer offline. Nenhum erro JavaScript não tratado nesses fluxos.
