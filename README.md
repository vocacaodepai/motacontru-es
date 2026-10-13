# Dashboard Mota Construções

Sistema de gestão para construtora (estilo SaaS): **obras, equipe, materiais, terceirizadas, documentação técnica, financeiro, comercial e sócios** num só lugar.
Nasceu do dashboard da OnTrade (mesma base: Node + Express + PostgreSQL, interface em HTML/CSS/JS puro) e foi adaptado e ampliado para construção civil.

> **Tudo o que vem de demonstração é fictício** (obras, clientes, valores, CPFs, números de ART…). Os nomes dos sócios (Diogo e Marcelo Mota) e do engenheiro (Rodrigo Carvalho) foram usados só como acessos de exemplo.

## O que tem

| Área | O que faz |
|---|---|
| **Visão Geral** | Obras em andamento, avanço médio, carteira, margem, caixa, pessoas nas obras hoje, alertas do dia, agenda e gráfico de entradas × saídas |
| **Painel do Investidor** | Capital aportado, carteira contratada, margem e retorno sobre o custo, recebimentos futuros, parte de cada sócio, pipeline comercial, PDF mensal aos sócios |
| **Meu Dia (engenheiro)** | Alertas ("hoje chega o caminhão de cimento", entrega atrasada, etapa atrasada, documento vencendo), avisos da gestão, agenda e as obras dele |
| **Obras** | Lista com fase atual, prazo, equipe do dia e custo × orçado. Em cada obra: Resumo, **Cronograma (Gantt)**, **Equipe e presença**, **Materiais**, **Terceirizadas**, **Documentação**, **Diário de obra**, **Agenda** e **Financeiro** (medições, custos por categoria) |
| **Curva S e indicadores** | Avanço planejado × realizado, SPI/CPI, custo por etapa, previsão de custo final, aditivos de contrato, fluxo de caixa projetado (13 semanas), folha de diárias |
| **Fotos e Modo Campo** | Fotos por etapa (reduzidas no celular), tela simples para o mestre/engenheiro no canteiro, PWA instalável |
| **Pendências e termo de entrega** | Lista de vistoria por obra e termo de entrega em PDF |
| **Segurança do trabalho** | Treinamentos (NR-18, NR-35…), entrega de EPI, inspeção por checklist e alertas do que vence |
| **Relatórios em PDF** | Relatório da obra (cliente, sem custos, ou interno), diário de obra (RDO) e termo de entrega |
| **Portal do cliente** | Login próprio: o cliente vê só a obra dele (avanço, fotos liberadas, medições, pendências), sem custos nem equipe |
| **Mapa de obras** | Todas as obras no mapa (OpenStreetMap) com situação e avanço |
| **Importar planilhas** | Funcionários e fornecedores por CSV, com modelo e prévia antes de gravar |
| **Avisos por WhatsApp** | Fila diária de alertas urgentes por pessoa; link wa.me ou envio automático por provedor (ver abaixo) |
| **Marca e Histórico** | Nome, cor e logo da empresa; quem alterou o quê e quando |
| **Agenda** | Calendário do mês com entregas, concretagens, vistorias, reuniões, fim de etapas e medições |
| **Materiais** | Pedido → entrega → aplicado, por obra e fornecedor; "pagar" lança a saída no caixa ligada à obra (sem custo em dobro) |
| **Terceirizadas** | Empresas de LED, piscina, elétrica, esquadrias… com contrato por obra, valor pago, nota, certidões e seguro |
| **Documentação** | ART, RRT, alvará, CNO, PGR, PCMSO, seguro, bombeiros, habite-se…: **quem emitiu** (profissional + CREA/CAU), nº, validade e **arquivo anexado**; matriz de conformidade de todas as obras |
| **Equipe e Funcionários** | Ficha completa, **função na obra** (peão, servente, pedreiro, mestre de obras, engenheiro…), diária, faltas e atestados |
| **Financeiro** | Caixa diário e fechamento, extratos (OFX/CSV; PDF/foto com IA), controle mensal em Excel, patrimônio (equipamentos e almoxarifado), orçamentos aprovados → **Criar obra** |
| **Comercial e Marketing** | CRM, orçamentos com follow-up em 3/7/14/21 dias, cobrança, campanhas e origem dos clientes |
| **Almoxarifado** | Itens, entradas e saídas (cada saída informa a obra), alerta de estoque mínimo |
| **Sociedade** | Quadro societário e relatório mensal em PDF |

## Perfis de acesso

| Perfil | Pode |
|---|---|
| **Administrador** (donos) | Tudo: criar/remover/alterar obras, equipe, materiais, contratos, documentos, usuários |
| **Engenheiro(a)** | Só as obras sob sua responsabilidade: avanço das etapas, presença, diário, materiais, agenda e documentos (com anexo). **Não vê valores de contrato nem o financeiro** |
| **Sócio / investidor** | Consulta visão geral, obras, painel do investidor, controle mensal, patrimônio e quadro societário |
| Operador, Financeiro, Leitor, Comercial, Marketing, Almoxarifado | Herdados do dashboard da OnTrade, com as áreas de obra que fazem sentido para cada um |

O servidor confere o perfil em **cada** rota (o menu só esconde o que a pessoa não acessa).

## Rodar

```bash
npm install
DEMO=1 npm start      # http://localhost:3000 — com dados fictícios de demonstração
npm start             # sem DEMO: banco limpo, pede para criar o administrador
npm run demo          # popula o banco configurado com os dados fictícios (se ainda não houver obras)
npm test              # 89 testes
```

Requer Node ≥ 22. Sem configuração o sistema usa um Postgres embutido (PGlite) em `data/pg`; com `DATABASE_URL` usa o Supabase.

### Acessos da demonstração (senha `mota2026`)

| Quem | Login | Perfil |
|---|---|---|
| Diogo Mota | `diogo.mota` | Administrador |
| Marcelo Mota | `marcelo.mota` | Administrador |
| Rodrigo Carvalho | `rodrigo.carvalho` | Engenheiro (obras Alphaville, Recreio e Jacarepaguá) |
| Camila Duarte | `camila.duarte` | Engenheira (obras Porto Belo, Cobertura Barra e Fachada Centro) |
| Ana Paula | `ana.financeiro` | Financeiro |
| Júlia Andrade | `julia.comercial` | Comercial |
| Investidor Exemplo | `investidor` | Sócio / investidor |
| Pedro Lacerda | `pedro.estoque` | Almoxarifado |
| Marina Albuquerque | `cliente.albuquerque` | Cliente (obra Alphaville) |
| Roberto Vista Mar | `cliente.vistamar` | Cliente (Cobertura Barra) |
| Bianca Freitas | `bianca.marketing` | Marketing |

Para trocar a senha da demonstração: `DEMO_SENHA=outra-senha`. **Não deixe dados de demonstração e senha conhecida em um endereço público de verdade.**

## Publicar (Vercel + Supabase)

1. **Supabase:** crie o projeto; o sistema cria as tabelas sozinho (`src/schema.sql`). RLS fica ligado sem políticas: só o servidor acessa os dados.
2. **Vercel → Environment Variables:** `DATABASE_URL` (Transaction pooler do Supabase), `SETUP_TOKEN` (código para criar o 1º administrador) e, opcional, `ANTHROPIC_API_KEY` (extratos em PDF/foto).
3. **Demonstração no Supabase:** rode **uma vez, no seu computador** `DATABASE_URL="..." npm run demo` (evita timeout da função na Vercel).
4. Faça o deploy. Em produção real, use banco limpo (sem `npm run demo`) e crie o administrador pela tela de primeiro acesso.

### Avisos por WhatsApp (envio automático)

O sistema já monta a fila diária; sem provedor, cada aviso tem um botão “Enviar pelo WhatsApp” (link wa.me). Para envio automático contrate um provedor de API de WhatsApp (ex.: Z-API, Evolution API, Twilio, Meta Cloud API) e aponte para um webhook que aceite `POST {to, text}`:

- `WHATSAPP_WEBHOOK_URL` — endereço do provedor/automação (n8n, Make…). `WHATSAPP_TOKEN` — opcional, enviado como `Bearer`.
- `CRON_SECRET` — segredo da rotina diária `GET /api/cron/avisos` (a Vercel chama às 7h de Brasília, ver `vercel.json`, enviando `Authorization: Bearer <CRON_SECRET>`).
- Cadastre o telefone de cada pessoa em **Importar Planilhas → Avisos por WhatsApp**.
- Sem essas credenciais reais, o envio automático **não funciona** (o fluxo é testado com um provedor simulado).

## Estrutura

```
src/schema.sql     tabelas (financeiro + obras)
src/obras.js       obras, etapas, equipe/presença, diário, agenda, medições
src/materiais.js   materiais, fornecedores, terceirizadas e contratos
src/documentos.js  ART/RRT/alvará…, anexos e conformidade
src/painel.js      visão geral, Meu dia, alertas, avisos, investidor
src/demo-mota.js   dados fictícios de demonstração
public/obras.js    telas de obra, materiais, terceirizadas, documentação
public/gestao.js   visão geral, investidor, Meu dia, agenda
(demais arquivos: financeiro, comercial, DP, marketing, estoque… herdados e adaptados)
```

## Pontos para confirmar com a Mota

- Quais documentos cada tipo de obra realmente exige (o checklist é uma **sugestão** do sistema; o responsável técnico confirma).
- Contas, categorias de custo e empresas do grupo (hoje: *Mota Construções* e *Mota Empreendimentos*, fictícias).
- Se o "ABIT" citado na conversa era a **ART**: o sistema trata ART (CREA) e RRT (CAU).
- "Porto Belo" foi cadastrado como condomínio em Mangaratiba/RJ (ajustar na obra se for outro local).

## Logo

Coloque a logo em `public/logo.png`: ela aparece no menu e na tela de entrada. Sem o arquivo, o site mostra o nome em texto. As cores (grafite e laranja de obra) estão em `public/style.css` (variáveis no topo).
