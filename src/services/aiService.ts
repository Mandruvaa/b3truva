export type AiAnalysisRequest = {
  symbol: string;
  timeframe: '1D' | '1W' | '1M' | '3M' | '1Y';
  signalType: 'technical' | 'sentiment' | 'news';
};

export type AiAnalysisResponse = {
  symbol: string;
  score: number;
  recommendation: 'buy' | 'sell' | 'hold';
  summary: string;
};

export async function analyzeWithAI(request: AiAnalysisRequest): Promise<AiAnalysisResponse> {
  // Aqui será implementada a integração com LLM ou serviço de IA.
  return {
    symbol: request.symbol,
    score: 0,
    recommendation: 'hold',
    summary: 'Análise de IA ainda não disponível.',
  };
}
