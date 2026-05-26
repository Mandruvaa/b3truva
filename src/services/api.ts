import { Platform } from 'react-native';
import { KNOWN_ASSETS } from '../data/knownAssets';

export const DOLLAR_RATE_FALLBACK = 5.0;

export type PriceMap = Record<string, number>;

export type CryptoPrice = {
  usd: number;
  brl: number;
  usd_24h_change: number;
  brl_24h_change: number;
};
export type CryptoPriceMap = Record<string, CryptoPrice>;

type AssetForPrice = {
  symbol: string;
  category: 'fiat' | 'crypto';
  market: 'nacional' | 'estrangeiro';
};

function corsUrl(url: string): string {
  if (Platform.OS === 'web') return `https://corsproxy.io/?${url}`;
  return url;
}

// Batch fetch via Yahoo Finance v7 (suporta múltiplos símbolos em uma requisição)
async function fetchYahooBatch(
  yahooSymbols: string[],
  originalSymbols: string[]
): Promise<PriceMap> {
  const prices: PriceMap = {};
  if (yahooSymbols.length === 0) return prices;

  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbols.join(','))}`;
  const res = await fetch(corsUrl(url));
  if (!res.ok) throw new Error(`Yahoo batch ${res.status}`);
  const data = await res.json();
  const results: any[] = data?.quoteResponse?.result ?? [];

  for (const [i, original] of originalSymbols.entries()) {
    const yahoo = yahooSymbols[i];
    const match = results.find(
      (r: any) => r.symbol === yahoo || r.symbol === original
    );
    if (match?.regularMarketPrice != null) {
      prices[original] = match.regularMarketPrice;
    }
  }
  return prices;
}

/**
 * Busca preços e variação 24h de criptomoedas via CoinGecko (sem auth, CORS nativo).
 * Retorna mapa symbol → { usd, brl, usd_24h_change, brl_24h_change }.
 */
export async function fetchCryptoPrices(symbols: string[]): Promise<CryptoPriceMap> {
  const result: CryptoPriceMap = {};
  if (!symbols.length) return result;

  const symbolToId: Record<string, string> = {};
  for (const sym of symbols) {
    const known = KNOWN_ASSETS.find((a) => a.symbol === sym && a.category === 'crypto');
    if (known?.coingeckoId) symbolToId[sym] = known.coingeckoId;
  }
  const ids = [...new Set(Object.values(symbolToId))];
  if (!ids.length) return result;

  try {
    const url = corsUrl(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd,brl&include_24hr_change=true`
    );
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = await res.json();

    for (const [sym, id] of Object.entries(symbolToId)) {
      const e = data?.[id];
      if (!e) continue;
      result[sym] = {
        usd:            e.usd            ?? 0,
        brl:            e.brl            ?? 0,
        usd_24h_change: e.usd_24h_change ?? 0,
        brl_24h_change: e.brl_24h_change ?? 0,
      };
    }
  } catch (e) {
    console.log('Erro na API CoinGecko:', e);
  }
  return result;
}

// Extrai apenas o preço USD para alimentar o PriceMap de fetchAllPrices
async function fetchCryptoBatch(symbols: string[]): Promise<PriceMap> {
  const rich = await fetchCryptoPrices(symbols);
  const prices: PriceMap = {};
  for (const [sym, p] of Object.entries(rich)) prices[sym] = p.usd;
  return prices;
}

export type DollarRateResult = { rate: number; online: boolean };

/**
 * Busca a cotação USD/BRL via AwesomeAPI (URL direta, sem proxy).
 * Em produção funciona nativamente; em localhost cai no fallback graciosamente.
 * Retorna { rate, online } — online=false quando aciona o fallback.
 */
export async function fetchDollarRate(): Promise<DollarRateResult> {
  try {
    const res = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL');
    if (!res.ok) throw new Error(`AwesomeAPI ${res.status}`);
    const data = await res.json();
    const rate = parseFloat(data?.USDBRL?.ask);
    if (!rate || isNaN(rate)) throw new Error('Taxa inválida na resposta');
    return { rate, online: true };
  } catch (e) {
    console.log('Erro na API Dólar:', e);
    return { rate: DOLLAR_RATE_FALLBACK, online: false };
  }
}

export type BrazilianStockQuote = { price: number; changePercent: number };
export type BrazilianStockMap   = Record<string, BrazilianStockQuote>;

/**
 * Busca preço atual e variação diária de ações B3 via BrAPI (URL direta, sem proxy).
 * Retorna mapa ticker → { price, changePercent }.
 */
export async function fetchBrazilianStocks(tickers: string[]): Promise<BrazilianStockMap> {
  const result: BrazilianStockMap = {};
  if (!tickers.length) return result;
  try {
    const res = await fetch(`https://brapi.dev/api/quote/${tickers.join(',')}`);
    if (!res.ok) throw new Error(`BrAPI ${res.status}`);
    const data = await res.json();
    const quotes: any[] = data?.results ?? [];
    for (const q of quotes) {
      if (q?.symbol && q?.regularMarketPrice != null) {
        result[q.symbol] = {
          price:         q.regularMarketPrice,
          changePercent: q.regularMarketChangePercent ?? 0,
        };
      }
    }
  } catch (e) {
    console.log('Erro na API BrAPI (B3):', e);
  }
  return result;
}

/**
 * Busca cotações em tempo real para todos os ativos da carteira.
 * Retorna um mapa symbol → preço na moeda nativa do ativo.
 * Falhas parciais não interrompem as demais requisições.
 */
export async function fetchAllPrices(assets: AssetForPrice[]): Promise<PriceMap> {
  const uniqueNational = [
    ...new Set(
      assets
        .filter((a) => a.category === 'fiat' && a.market === 'nacional')
        .map((a) => a.symbol)
    ),
  ];
  const uniqueForeign = [
    ...new Set(
      assets
        .filter((a) => a.category === 'fiat' && a.market === 'estrangeiro')
        .map((a) => a.symbol)
    ),
  ];
  const uniqueCrypto = [
    ...new Set(
      assets.filter((a) => a.category === 'crypto').map((a) => a.symbol)
    ),
  ];

  // B3/BDRs usam sufixo .SA; Nasdaq usa símbolo direto. Ambos em um único request.
  const [stockResult, cryptoResult] = await Promise.allSettled([
    fetchYahooBatch(
      [...uniqueNational.map((s) => `${s}.SA`), ...uniqueForeign],
      [...uniqueNational, ...uniqueForeign]
    ),
    fetchCryptoBatch(uniqueCrypto),
  ]);

  return {
    ...(stockResult.status === 'fulfilled' ? stockResult.value : {}),
    ...(cryptoResult.status === 'fulfilled' ? cryptoResult.value : {}),
  };
}

// ─── Historical OHLC (90 days, daily candles) ─────────────────────────────────
export type OHLCBar = {
  time:  string; // 'YYYY-MM-DD'
  open:  number;
  high:  number;
  low:   number;
  close: number;
};

function tsToISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

async function fetchCoinGeckoOHLC(coingeckoId: string): Promise<OHLCBar[]> {
  try {
    const url = corsUrl(
      `https://api.coingecko.com/api/v3/coins/${coingeckoId}/ohlc?vs_currency=usd&days=90`
    );
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CoinGecko OHLC ${res.status}`);
    const data: [number, number, number, number, number][] = await res.json();
    return data
      .sort((a, b) => a[0] - b[0])
      .map(([ts, o, h, l, c]) => ({ time: tsToISO(ts), open: o, high: h, low: l, close: c }));
  } catch (e) {
    console.log('Erro CoinGecko OHLC histórico:', e);
    return [];
  }
}

async function fetchYahooOHLC(yahooSymbol: string): Promise<OHLCBar[]> {
  try {
    const url = corsUrl(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=3mo&interval=1d&includePrePost=false`
    );
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Yahoo OHLC ${res.status}`);
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('Yahoo OHLC: sem resultado');
    const timestamps: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    const bars: OHLCBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;
      bars.push({ time: tsToISO(timestamps[i] * 1000), open: o, high: h, low: l, close: c });
    }
    return bars;
  } catch (e) {
    console.log('Erro Yahoo OHLC histórico:', e);
    return [];
  }
}

/**
 * Busca dados históricos OHLC diários para qualquer ativo.
 * Crypto → CoinGecko em USD. Ações → Yahoo Finance (B3 em BRL, EUA em USD).
 */
export async function fetchHistoricalOHLC(
  symbol:       string,
  category:     'fiat' | 'crypto',
  market:       'nacional' | 'estrangeiro',
  coingeckoId?: string,
): Promise<OHLCBar[]> {
  if (category === 'crypto' && coingeckoId) {
    return fetchCoinGeckoOHLC(coingeckoId);
  }
  const yahooSym = market === 'nacional' ? `${symbol}.SA` : symbol;
  return fetchYahooOHLC(yahooSym);
}

// ─── Market News (rss2json → Google News RSS) ─────────────────────────────────
export type NewsArticle = {
  id:       string;
  title:    string;
  source:   string;
  url:      string;
  pubDate:  string; // ISO or "YYYY-MM-DD HH:mm:ss"
  imageUrl?: string;
};

const GNEWS_RSS =
  'https://news.google.com/rss/search?q=mercado+financeiro+bolsa+criptomoedas&hl=pt-BR&gl=BR&ceid=BR:pt-BR';

function parseGNewsTitle(raw: string): { title: string; source: string } {
  const idx = raw.lastIndexOf(' - ');
  if (idx > 0) return { title: raw.slice(0, idx).trim(), source: raw.slice(idx + 3).trim() };
  return { title: raw, source: 'Notícias' };
}

/**
 * Busca notícias financeiras via rss2json (converte RSS do Google News em JSON).
 * Gratuito, sem chave de API, CORS-friendly.
 */
export async function fetchMarketNews(limit = 15): Promise<NewsArticle[]> {
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(GNEWS_RSS)}&count=${limit}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`rss2json ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error('rss2json error');

  return (data.items as any[]).slice(0, limit).map((item: any, i: number) => {
    const { title, source } = parseGNewsTitle(item.title ?? '');
    return {
      id:       item.guid || item.link || String(i),
      title,
      source,
      url:      item.link ?? '',
      pubDate:  item.pubDate ?? new Date().toISOString(),
      imageUrl: item.thumbnail || undefined,
    };
  });
}
