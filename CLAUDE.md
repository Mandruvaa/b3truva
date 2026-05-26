@AGENTS.md

## Regras de Design — Mandruva Invest

### Ultra Dark Mode (obrigatório em toda nova tela/componente)

```ts
const C = {
  BG:            '#121212',   // fundo principal
  SIDEBAR:       '#0A0A0A',   // barra lateral
  CARD:          '#1C1C1C',   // cards primários
  CARD2:         '#242424',   // cards secundários / painéis internos
  INPUT:         '#252525',   // campos de texto
  ORANGE:        '#FF6B00',   // destaque principal (botões, ícones ativos, veredito COMPRAR)
  TEXT:          '#F2F2F2',   // texto principal
  TEXT_SUB:      '#A0A0A0',   // texto secundário / labels
  TEXT_MUTED:    '#525252',   // texto terciário / placeholders
  BORDER:        '#282828',   // bordas de separação
  GREEN:         '#4ade80',   // positivo / COMPRAR
  RED:           '#f87171',   // negativo / VENDER
  YELLOW:        '#fbbf24',   // neutro / MANTER
  BLUE:          '#60a5fa',   // EUA / BDR / SMA28
};
```

### Tipografia Fintech

- **Dados financeiros** (preços, tickers, saldos, quantidades): `fontWeight: '700'` ou `'800'`/`'900'` para valores heroicos.
- **Labels descritivos** ("Total investido", "Preço Médio", etc.): `fontWeight` regular/`'400'`–`'600'`, cor `C.TEXT_SUB` ou `C.TEXT_MUTED`.
- Nunca use peso regular em um número de preço ou saldo.

### Botão Voltar padrão

Todas as sub-telas e modais usam um botão circular proeminente:

```ts
backCircleBtn: {
  width: 44, height: 44, borderRadius: 22,
  backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: '#2E2E2E',
  alignItems: 'center', justifyContent: 'center',
}
backCircleBtnIcon: { color: C.ORANGE, fontSize: 28, fontWeight: '700' }
// texto: '‹'
```

### Gráficos

- **Fundo do chart**: `#0D1117` (mais escuro que o card)
- **Grid**: linhas sutis `rgba(255,255,255,0.05)` — estrutura sem poluir o dark mode
- **Candles**: verde sólido `#26a69a` / vermelho sólido `#ef5350` (paleta clássica TradingView/CoinGecko — NÃO usar rgba semi-transparente nos corpos)
- **SMAs**: SMA8 `#e879f9` (rosa) · SMA16 `#FF6B00` (laranja) · SMA28 `#60a5fa` (azul)
- Gráficos de detalhe ocupam **100% da largura** do container (sem `marginHorizontal`)
- **Dados**: sempre reais via `fetchHistoricalOHLC` (CoinGecko USD para crypto, Yahoo/BrAPI BRL para B3). Fallback para mock determinístico `generateOHLC` apenas se a API falhar. Nunca exibir dados mock sem tentar a API primeiro.
- **Motor gráfico**: `TradingViewChart.web.tsx` usa Lightweight Charts na web; `TradingViewChart.tsx` usa SVG nativo no mobile. Ambos aceitam `OHLCCandle[]` com campos `{date, o, h, l, c, v}`.

### Fluxo de navegação

```
Sidebar → Dashboard | Carteira | Hub IA | Vitrine
Hub IA  → Lista de ativos → AssetDetailModal
```

### Estrutura de arquivo

Toda UI em `src/screens/Dashboard.tsx` (componentes + estilos na mesma fonte). Não criar arquivos de componente separados sem necessidade explícita do usuário.

### Referências de design

- `Referencias/Finviz.png` — layout de análise técnica por ativo
- `Referencias/Exemplo organização Graficos.png` — organização do modal de detalhe
