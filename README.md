# B3truva

Aplicativo pessoal de gerenciamento de portfólio para Bolsa, Criptomoedas e mercado estrangeiro, construído com **Expo SDK 54 · React Native · TypeScript**.

Design visual inspirado no **Itaú íon** — Ultra Dark Mode com elevação, acento dourado B3truva, tipografia fintech.

---

## Telas e Fluxo de Navegação

```
Sidebar (72 px, sempre visível ≥ 640 px)
  ⌂  Dashboard (Home)
  📊  Minha Carteira
  📰  Hub de IA
  +   Vitrine / Investir (modal-like)
  ⚙   Configurações (modal)
  →   Sair (logout alert)
```

### Dashboard (Home)

Visão consolidada do portfólio em tempo real.

- **Tabela "Na bolsa agora"** — lista todos os ativos com Ticker (bold), Quantidade, Preço atual, Variação % e Total investido. Suporta filtro de texto e mercado + ordenação por data / nome / valor.
- **Card "Seus investimentos"** — Total investido, Rendimento (R$), Rentabilidade (%) e Período.
- **Slide Toggle BRL / USD** — alterna a exibição de todos os valores entre Real e Dólar usando a cotação live da AwesomeAPI.
- **Indicador de mercado** — "Mercado aberto / fechado" calculado pelo horário B3 (UTC-3, seg-sex 10h–17h).
- **Coluna de notícias** (visível ≥ 1040 px) — feed ao vivo via Google News RSS convertido em JSON pela rss2json. Fallback elegante para cache local em caso de falha na API.

### Vitrine / Investir

Ativada pelo botão `+` na Sidebar ou pelo card do Dashboard.

- Grid de categorias: Ações Brasil · Ações EUA · Criptomoedas.
- Strip de ativos em destaque com variação e preço.
- Abre o **formulário de adição** pré-configurado para a categoria selecionada.

**Formulário de Ativo:**
- Campos: Nome, Ticker (com autocomplete), Quantidade, Preço de Compra, Categoria, Moeda (BRL / USD), Mercado, Data de obtenção.
- Busca de ativos conhecidos com preenchimento automático de preço via API.
- Seletor de data: calendário visual + picker de mês/ano + checkbox "Hoje".
- Ao adicionar um ativo já existente, agrupa automaticamente pela média ponderada.

### Minha Carteira

Visão analítica do portfólio.

- **4 cards de métricas**: Patrimônio atual · Total investido · Rendimento · Rentabilidade.
- **Gráfico de linha interativo** — modos Rentabilidade (%) / Rendimento (R$) com períodos Dia / Semana / Mês / Ano / Total.
- **Breakdown por ativo** — barra de participação percentual, valor atual e PnL de cada ativo.

### Hub de IA & Análise Técnica

Central de inteligência artificial com dois fluxos de entrada:

```
Hub (dois cards grandes)
  ├── Minha Carteira (Manter/Vender)
  │     └── Lista de ativos da carteira → Detalhes do Ativo
  └── Oportunidades (Comprar)
        └── Lista de ativos recomendados → Detalhes do Ativo
```

**Tela de Detalhes do Ativo (Finviz-style):**
- Botão `‹` circular proeminente (laranja) no canto superior esquerdo.
- Header: Ticker · Badge de variação · Nome · Setor · Preço atual.
- Strip de notícias do dia (scroll horizontal).
- **Gráfico de candlestick full-width** com dados históricos reais de 3 meses:
  - Crypto → CoinGecko OHLC em USD
  - Ações B3 → Yahoo Finance em BRL
  - Ações EUA → Yahoo Finance em USD
  - Spinner de carregamento enquanto busca; fallback para candles mock se a API falhar.
  - Motor gráfico: **Lightweight Charts (TradingView)** na web; SVG nativo no mobile.
  - Paleta clássica de mercado: verde `#26a69a` / vermelho `#ef5350`; fundo `#0D1117`.
  - 3 SMAs sobrepostas: SMA8 rosa `#e879f9` · SMA16 laranja `#FF6B00` · SMA28 azul `#60a5fa`.
- Painel de Análise Integrada por IA: veredito COMPRAR / MANTER / VENDER + texto combinado (técnico + notícias).

---

## Integração de APIs

| API | Dados | Fallback |
|---|---|---|
| **AwesomeAPI** | Cotação USD/BRL em tempo real | Taxa fixa R$ 5,00 |
| **CoinGecko** | Preços spot e OHLC histórico (crypto) | Mock determinístico |
| **BrAPI** | Preços e variação diária de ações B3 | Sem exibição de variação |
| **Yahoo Finance** | OHLC histórico (ações nacionais e EUA) | Mock determinístico |
| **rss2json + Google News RSS** | Feed de notícias financeiras PT-BR | Cache local (NEWS_DB) |

Todas as chamadas de API têm `try/catch` individual — falhas parciais não interrompem as demais.

---

## Arquitetura do Código

Todo o UI da aplicação vive em um único arquivo (`src/screens/Dashboard.tsx`) para facilitar iterações rápidas. Serviços e dados ficam em subpastas dedicadas.

```
E:\InvestmentControl\
├── App.tsx                      # Entry point — monta ScreenContainer + Dashboard
├── src/
│   ├── screens/
│   │   └── Dashboard.tsx        # Toda a UI (componentes + estilos inline)
│   ├── components/
│   │   ├── TradingViewChart.web.tsx  # Lightweight Charts (web)
│   │   └── TradingViewChart.tsx      # SVG nativo (mobile fallback)
│   ├── services/
│   │   ├── api.ts               # fetchAllPrices, fetchHistoricalOHLC, fetchMarketNews
│   │   └── ai.ts                # analyzeAsset → AIAnalysis
│   ├── data/
│   │   └── knownAssets.ts       # KNOWN_ASSETS[] com coingeckoId para crypto
│   └── api/
│       └── quoteApi.ts          # fetchAssetPrice, fetchExchangeRate
├── assets/                      # Ícones e splash screen
├── Referencias/                 # Mockups de referência de design
└── package.json
```

### Componentes em Dashboard.tsx (ordem de declaração)

| Componente | Função |
|---|---|
| `InvestirView` | Vitrine de categorias + strip de ativos |
| `MinhaCarteiraView` | Métricas + gráfico de linha + breakdown |
| `AssetDetailModal` | Modal Finviz: candle chart real + IA |
| `NoticiasView` | Hub IA (hub → lista → detail) |
| `Sidebar` | Navegação lateral compacta |
| `NewsCard` | Card de notícia na coluna direita |
| `AssetTableRow` | Linha da tabela de ativos |
| `Dashboard` | Root — estados globais + render |

### Estado e persistência

- **AsyncStorage** — carteira salva em `@mandruva_invest_assets`
- **PriceMap** — cotações em tempo real via `fetchAllPrices`
- **OHLC real** — `fetchHistoricalOHLC(symbol, category, market, coingeckoId)` com fallback para `generateOHLC` (mock determinístico via `symHash`)
- **News real** — `fetchMarketNews()` → rss2json → Google News RSS; fallback para `NEWS_DB` (mock local)

---

## Design System

- **Paleta Ultra Dark**: `#121212` BG · `#0A0A0A` Sidebar · `#1C1C1C` Card
- **Destaque laranja**: `#FF6B00` (botões primários, ícones ativos, SMA16, veredito COMPRAR)
- **Verde** `#4ade80` · **Vermelho** `#f87171` · **Amarelo** `#fbbf24` para variações e vereditos IA
- **Verde gráfico** `#26a69a` · **Vermelho gráfico** `#ef5350` — paleta clássica TradingView exclusiva para candles
- **Tipografia fintech**: peso 700–900 em todos os dados financeiros (preços, tickers, saldos); regular para labels descritivos
- **Botão voltar**: círculo 44×44 · fundo `#1E1E1E` · borda `#2E2E2E` · ícone `‹` laranja

---

## Como rodar

```bash
npm install
npm start        # Metro Bundler
npm run web      # Navegador (localhost:8081)
npm run android  # Android
npm run ios      # iOS
```

---

## Fases do projeto

| Fase | Status | Descrição |
|---|---|---|
| 1 — Interface & CRUD | ✅ | Dashboard, formulário, persistência local |
| 2 — Cotações e dados reais | ✅ | AwesomeAPI · CoinGecko · BrAPI · Yahoo Finance · rss2json |
| 3 — IA & Análise Técnica | 🔄 Em andamento | Hub IA com vereditos mock; gráficos reais; conectar LLMs reais |
| 4 — Auto-Trading | ⏳ | Integração com exchanges, backtesting |
