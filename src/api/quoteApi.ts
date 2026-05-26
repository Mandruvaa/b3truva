import { Platform } from 'react-native';
import { KnownAsset } from '../data/knownAssets';

export type QuoteResponse = {
  symbol: string;
  price: number;
  currency: string;
  timestamp: string;
};

// No web, o browser bloqueia Yahoo Finance por CORS. Usamos um proxy apenas nessa plataforma.
function yahooUrl(symbol: string): string {
  const direct = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
  if (Platform.OS === 'web') {
    return `https://corsproxy.io/?${direct}`;
  }
  return direct;
}

async function fetchYahooQuote(symbol: string): Promise<number> {
  const res = await fetch(yahooUrl(symbol));
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const data = await res.json();
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (price == null) throw new Error('Sem preço na resposta Yahoo');
  return price;
}

// CoinGecko suporta CORS nativamente — sem proxy necessário
async function fetchCoinGeckoPrice(
  coingeckoId: string,
  vs: 'usd' | 'brl'
): Promise<number> {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=${vs}`
  );
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data = await res.json();
  const price = data?.[coingeckoId]?.[vs];
  if (price == null) throw new Error('Sem preço na resposta CoinGecko');
  return price;
}

// Frankfurter API: gratuita, sem auth, suporta CORS em qualquer plataforma
export async function fetchExchangeRate(): Promise<number> {
  const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=BRL');
  if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
  const data = await res.json();
  const rate = data?.rates?.BRL;
  if (!rate) throw new Error('Sem taxa de câmbio');
  return rate;
}

export async function fetchAssetPrice(asset: KnownAsset): Promise<number> {
  if (asset.category === 'crypto' && asset.coingeckoId) {
    const vs = asset.currency === 'BRL' ? 'brl' : 'usd';
    return fetchCoinGeckoPrice(asset.coingeckoId, vs);
  }
  // B3 e BDRs: sufixo .SA (ex: PETR3.SA, AAPL34.SA)
  if (asset.market === 'nacional') {
    return fetchYahooQuote(`${asset.symbol}.SA`);
  }
  // Nasdaq: símbolo direto (ex: TSLA, AAPL)
  return fetchYahooQuote(asset.symbol);
}

// Compatibilidade com quoteService existente
export async function fetchQuote(symbol: string): Promise<QuoteResponse> {
  const price = await fetchYahooQuote(symbol);
  return {
    symbol,
    price,
    currency: 'USD',
    timestamp: new Date().toISOString(),
  };
}
