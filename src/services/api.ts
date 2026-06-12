import { Platform } from 'react-native';
import { KnownAsset, KNOWN_ASSETS } from '../data/knownAssets';

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
  coingeckoId?: string; // permite preço de moedas fora da lista KNOWN_ASSETS
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
export async function fetchCryptoPrices(
  symbols: string[],
  idOverrides?: Record<string, string>,
): Promise<CryptoPriceMap> {
  const result: CryptoPriceMap = {};
  if (!symbols.length) return result;

  const symbolToId: Record<string, string> = {};
  for (const sym of symbols) {
    const known = KNOWN_ASSETS.find((a) => a.symbol === sym && a.category === 'crypto');
    const id = idOverrides?.[sym] ?? known?.coingeckoId;
    if (id) symbolToId[sym] = id;
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

// Cotação única via Yahoo v8 (endpoint chart) — usada no auto-preenchimento do formulário
async function fetchYahooQuote(yahooSymbol: string): Promise<number> {
  const res = await fetch(corsUrl(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`
  ));
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const data = await res.json();
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (price == null) throw new Error('Sem preço na resposta Yahoo');
  return price;
}

/**
 * Busca o preço atual de um único ativo (auto-preenchimento do formulário).
 * Cripto → CoinGecko pelo coingeckoId do próprio ativo (funciona para moedas
 * fora da lista local, ex. vindas da busca). Ações → Yahoo (B3 com sufixo .SA).
 */
export async function fetchAssetPrice(asset: KnownAsset): Promise<number> {
  if (asset.category === 'crypto' && asset.coingeckoId) {
    const vs  = asset.currency === 'BRL' ? 'brl' : 'usd';
    const res = await fetch(corsUrl(
      `https://api.coingecko.com/api/v3/simple/price?ids=${asset.coingeckoId}&vs_currencies=${vs}`
    ));
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data  = await res.json();
    const price = data?.[asset.coingeckoId]?.[vs];
    if (price == null) throw new Error('Sem preço na resposta CoinGecko');
    return price;
  }
  const yahooSym = asset.market === 'nacional' ? `${asset.symbol}.SA` : asset.symbol;
  return fetchYahooQuote(yahooSym);
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

export type PortfolioPrices = {
  prices: PriceMap;          // symbol → preço na moeda nativa do ativo
  crypto: CryptoPriceMap;    // dados ricos de cripto (usd, brl, variação 24h)
  b3:     BrazilianStockMap; // cotação B3 + variação diária
};

/**
 * Pipeline unificado de cotações: uma única requisição por provedor.
 * B3 → BrAPI (preço + variação diária) · EUA → Yahoo · Cripto → CoinGecko.
 * Falhas parciais não interrompem as demais requisições; se a BrAPI
 * falhar ou omitir tickers, o Yahoo (.SA) cobre apenas os que faltaram.
 */
export async function fetchPortfolioPrices(assets: AssetForPrice[]): Promise<PortfolioPrices> {
  const uniq = (list: AssetForPrice[]) => [...new Set(list.map((a) => a.symbol))];
  const national = uniq(assets.filter((a) => a.category === 'fiat' && a.market === 'nacional'));
  const foreign  = uniq(assets.filter((a) => a.category === 'fiat' && a.market === 'estrangeiro'));
  const cryptoAssets = assets.filter((a) => a.category === 'crypto');
  const cryptos  = uniq(cryptoAssets);
  // ids salvos no ativo cobrem moedas fora da lista KNOWN_ASSETS (ex. JUP)
  const cryptoIds: Record<string, string> = {};
  for (const a of cryptoAssets) if (a.coingeckoId) cryptoIds[a.symbol] = a.coingeckoId;

  const [b3Result, foreignResult, cryptoResult] = await Promise.allSettled([
    fetchBrazilianStocks(national),
    fetchYahooBatch(foreign, foreign),
    fetchCryptoPrices(cryptos, cryptoIds),
  ]);

  const b3     = b3Result.status     === 'fulfilled' ? b3Result.value     : {};
  const crypto = cryptoResult.status === 'fulfilled' ? cryptoResult.value : {};
  const prices: PriceMap =
    foreignResult.status === 'fulfilled' ? { ...foreignResult.value } : {};

  for (const [sym, q] of Object.entries(b3))     prices[sym] = q.price;
  for (const [sym, p] of Object.entries(crypto)) prices[sym] = p.usd;

  const missingNational = national.filter((s) => !(s in prices));
  if (missingNational.length) {
    try {
      Object.assign(
        prices,
        await fetchYahooBatch(missingNational.map((s) => `${s}.SA`), missingNational)
      );
    } catch (e) {
      console.log('Erro no fallback Yahoo para B3:', e);
    }
  }

  return { prices, crypto, b3 };
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

// ─── Market News (RSS direto → parser próprio) ────────────────────────────────
// O rss2json gratuito passou a responder 422; agora buscamos o XML das fontes
// diretamente (via proxy CORS na web) e parseamos com regex leve — funciona
// igualmente no nativo, onde não há DOMParser.
export type NewsArticle = {
  id:       string;
  title:    string;
  source:   string;
  url:      string;
  pubDate:  string; // ISO
  imageUrl?: string;
};

const NEWS_FEEDS = [
  { url: 'https://www.infomoney.com.br/feed/',       source: 'InfoMoney' },
  { url: 'https://portaldobitcoin.uol.com.br/feed/', source: 'Portal do Bitcoin' },
];

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;|&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function firstTag(chunk: string, name: string): string {
  const m = chunk.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

// Imagem da matéria, em ordem de confiabilidade:
// <enclosure url> → <media:content|thumbnail url> → primeira <img> do description/content
function extractItemImage(chunk: string): string | undefined {
  const enclosure = chunk.match(/<enclosure[^>]+url=["']([^"']+)["']/i)?.[1];
  const media     = chunk.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["']/i)?.[1];
  const html      = decodeXmlEntities(firstTag(chunk, 'description') + firstTag(chunk, 'content:encoded'));
  const inlineImg = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
  const found = [enclosure, media, inlineImg].find(u => u && /^https?:\/\//.test(u));
  return found ? decodeXmlEntities(found) : undefined;
}

function parseRssFeed(xml: string, source: string): NewsArticle[] {
  return xml.split(/<item(?:\s[^>]*)?>/).slice(1).map((chunk, i) => {
    const title   = decodeXmlEntities(firstTag(chunk, 'title').replace(/<[^>]+>/g, ''));
    const link    = firstTag(chunk, 'link');
    const rawDate = firstTag(chunk, 'pubDate');
    const parsed  = new Date(rawDate);
    return {
      id:      firstTag(chunk, 'guid') || link || `${source}-${i}`,
      title,
      source,
      url:     link,
      pubDate: isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString(),
      imageUrl: extractItemImage(chunk),
    };
  }).filter(a => a.title && a.url);
}

/**
 * Busca notícias financeiras direto dos feeds RSS das fontes.
 * Feeds em paralelo; falha parcial não derruba o restante.
 * Lança erro apenas se TODOS os feeds falharem (aciona o fallback mock da UI).
 */
export async function fetchMarketNews(limit = 15): Promise<NewsArticle[]> {
  const results = await Promise.allSettled(
    NEWS_FEEDS.map(async (f) => {
      const res = await fetch(corsUrl(f.url));
      if (!res.ok) throw new Error(`RSS ${f.source} ${res.status}`);
      return parseRssFeed(await res.text(), f.source);
    })
  );
  const all = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
  if (!all.length) throw new Error('Nenhum feed de notícias disponível');
  return all
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, limit);
}

// ─── Busca de ativos EUA (Yahoo Finance Search) ───────────────────────────────
/**
 * Autocomplete de ações/ETFs americanos via Yahoo Finance Search.
 * Retorna no formato KnownAsset para plugar direto nas sugestões do formulário.
 */
export async function searchUsStocks(query: string): Promise<KnownAsset[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const url = corsUrl(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0`
    );
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Yahoo search ${res.status}`);
    const data = await res.json();
    const quotes: any[] = data?.quotes ?? [];
    return quotes
      .filter(it => it?.symbol && (it.quoteType === 'EQUITY' || it.quoteType === 'ETF'))
      .map(it => ({
        symbol:   it.symbol as string,
        name:     (it.shortname || it.longname || it.symbol) as string,
        category: 'fiat' as const,
        currency: 'USD' as const,
        market:   'estrangeiro' as const,
      }));
  } catch (e) {
    console.log('Erro na busca Yahoo (EUA):', e);
    return [];
  }
}

// ─── Busca de criptomoedas (CoinGecko Search) ─────────────────────────────────
/**
 * Autocomplete de criptomoedas no mercado inteiro via CoinGecko /search.
 * Inclui coingeckoId no retorno — essencial para preço automático e gráficos.
 */
export async function searchCryptos(query: string): Promise<KnownAsset[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const url = corsUrl(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`
    );
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CoinGecko search ${res.status}`);
    const data = await res.json();
    const coins: any[] = data?.coins ?? [];
    return coins.slice(0, 8).map(c => ({
      symbol:      String(c.symbol || '').toUpperCase(),
      name:        (c.name || c.symbol) as string,
      category:    'crypto' as const,
      currency:    'USD' as const,
      market:      'estrangeiro' as const,
      coingeckoId: c.id as string,
    })).filter(c => c.symbol && c.coingeckoId);
  } catch (e) {
    console.log('Erro na busca CoinGecko:', e);
    return [];
  }
}
