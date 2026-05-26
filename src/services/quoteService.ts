import { fetchQuote, QuoteResponse } from '../api/quoteApi';

export async function getMarketQuote(symbol: string): Promise<QuoteResponse> {
  return fetchQuote(symbol);
}

export async function getMultipleQuotes(symbols: string[]): Promise<QuoteResponse[]> {
  return Promise.all(symbols.map(fetchQuote));
}
