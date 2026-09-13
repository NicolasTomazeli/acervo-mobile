# Validação — Acervo Mobile 0.6.0

Executada em 13/09/2026, Chrome em modo headless, Windows, com o JSON fornecido. O código funciona como site estático, sem servidor de reconhecimento nem envio das fotos para serviços externos.

## Resultado e limites

O primeiro candidato correto passou de **1851/2345 (78.9%)** para **2292/2345 (97.7%)** no teste sintético. Esses números medem recuperação de uma referência conhecida, não precisão comprovada com câmera no trabalho.

| Consulta | Primeiro correto: antigo | Primeiro correto: novo | Automáticas: antigo | Automáticas: novo | Automáticas erradas: antigo / novo |
|---|---:|---:|---:|---:|---:|
| Referência original | 325/335 | 335/335 | 287 | 312 | 0 / 0 |
| Luz aumentada | 324/335 | 334/335 | 278 | 71 | 0 / 0 |
| Foto escurecida | 114/335 | 334/335 | 49 | 150 | 3 / 0 |
| Margem ao redor | 222/335 | 324/335 | 70 | 0 | 4 / 0 |
| Inclinação de 6° | 316/335 | 318/335 | 244 | 0 | 0 / 0 |
| Recorte central | 221/335 | 319/335 | 119 | 0 | 3 / 0 |
| Desfoque artificial | 329/335 | 328/335 | 298 | 32 | 0 / 0 |

Com a obra correta removida do catálogo, houve **32/335** confirmações incorretas no motor antigo e **2/335** no novo. As duas restantes envolvem referências visualmente muito próximas de “Paisagem” e “Paisagem II”. As cinco imagens uniformes (branco, preto, cinza, vermelho e azul) ficaram pendentes no motor novo, com índices finitos.

O limite automático foi ajustado durante o desenvolvimento usando esta mesma base. Portanto, os testes não são uma avaliação independente. O limite conservador reduz bastante a confirmação automática de fotos recortadas, inclinadas ou com margem; nesses casos, a melhoria está na ordem das sugestões e na revisão com miniaturas. Um índice 98,5/100 não significa 98,5% de chance de acerto.

## Como o teste foi montado

- 370 linhas consolidadas em 348 cadastros usando a mesma regra de patrimônio para os dois motores; fotos complementares mantidas nos dois lados da comparação.
- 374 arquivos de referência após retirar uma repetição idêntica dentro do mesmo patrimônio. 335 cadastros têm foto; 13 não têm.
- Uma primeira referência por cadastro com foto, original e em seis transformações, totalizando 2.345 consultas. As referências não foram fotografadas novamente.
- Transformações em Canvas: brilho 1,2 e contraste 0,85; brilho 0,65; margem de 12% de cada lado; rotação de 6°; recorte de 7% de cada lado; desfoque de 2 pixels. Imagens transformadas têm largura 320 e JPEG de qualidade 0,85.
- Motor antigo: funções preservadas do ZIP e descritores pré-calculados do JSON, com limites originais 0,82 e margem 0,035.
- Motor novo: descritores extraídos das fotos, dois enquadramentos de referência e sete de consulta; pHash/DCT, luminância normalizada, gradientes e cor auxiliar. Limite automático 0,985, margem 0,065, com critérios adicionais de estrutura e qualidade.
- O teste de obra ausente retira todas as referências do cadastro consultado, mantendo os demais cadastros. Não substitui um conjunto de fotos externas e negativas reais.

## Eficiência

O novo motor gasta mais CPU por consulta: aproximadamente **9–11 ms**, contra **4 ms** do antigo neste computador, incluindo extração e classificação no teste. Isso não mede a latência de um celular e não inclui transferência para o Worker. Não há alegação de motor numericamente mais rápido.

Os ganhos de eficiência estão em manter a interface livre usando Worker, enviar o catálogo uma vez por conferência, reaproveitar descritores válidos, evitar ler o banco inteiro a cada tecla e limitar a primeira listagem a 60 obras. As URLs temporárias de imagens são liberadas após carregar ou remover as imagens.

A serialização JSON dos descritores das 375 fotos passou de 17,974,400 para 11,914,594 caracteres: redução de **33.7%**. Isso mede o tamanho dos descritores serializados, não toda a memória RAM nem o armazenamento interno do IndexedDB.

Na importação pela interface, a base completa levou aproximadamente **1 segundo** neste computador. Em aparelhos antigos ou na primeira atualização de referências, pode demorar mais.

## Verificações funcionais

Passaram: cadastro com campos e foto; edição e remoção de foto; exclusão; importação de toda a base; reunião de fotos por patrimônio; reimportação sem duplicar; busca sem acento; migração de descritores antigos preservando IDs e histórico; reconhecimento via Worker e fallback sem Worker; revisão/desfazer; atualização do índice ao confirmar outro candidato; CSV com 348 obras; backup com ida e volta; rejeição de backup inválido; importação inválida sem gravação parcial; rollback de transação; recuperação da interface após imagem inválida; reabertura e conferência offline. Nenhum erro JavaScript não tratado nesses fluxos.

Cinco testes unitários cobrem imagens uniformes, duplicidade visual, escurecimento, descritores inválidos e catálogo vazio. Scripts de navegador e benchmark acompanham o projeto.

## Próxima validação necessária

Separar fotos reais novas, com o patrimônio correto informado: fotos frontais, diferentes distâncias, luz fraca, reflexos, ângulos, obras parecidas e objetos fora do acervo. Revisar também as 28 duplas sinalizadas no arquivo de revisão de fotos. O motor não detecta várias obras numa única foto, não autentica arte e não verifica estado de conservação. Perspectiva forte, reflexos e recortes severos continuam exigindo nova foto ou confirmação manual.
