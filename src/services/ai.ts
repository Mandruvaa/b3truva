export type Recommendation = 'COMPRA' | 'VENDA' | 'MANTER';

export type AIAnalysis = {
  recommendation: Recommendation;
  analysis: string;
};

export type AssetData = {
  name: string;
  symbol: string;
  category: 'fiat' | 'crypto';
  currency: 'BRL' | 'USD';
  market: 'nacional' | 'estrangeiro';
  quantity: number;
  purchasePrice: number;
  date: string;
};

// Substitua esta função por uma chamada real ao endpoint LLM quando disponível.
// A assinatura permanece a mesma; só o corpo muda.
export async function analyzeAsset(
  asset: AssetData,
  currentPrice?: number
): Promise<AIAnalysis> {
  const pnl =
    currentPrice != null && asset.purchasePrice > 0
      ? ((currentPrice - asset.purchasePrice) / asset.purchasePrice) * 100
      : null;

  const daysSincePurchase = Math.max(
    0,
    Math.floor((Date.now() - new Date(asset.date).getTime()) / 86_400_000)
  );

  const isCrypto = asset.category === 'crypto';
  const marketLabel =
    isCrypto
      ? 'criptomoeda'
      : asset.market === 'nacional'
        ? 'ação brasileira (B3)'
        : 'ação americana (Nasdaq)';

  if (pnl == null) {
    return {
      recommendation: 'MANTER',
      analysis:
        `${asset.name} (${asset.symbol}) é uma ${marketLabel} mantida em carteira há ${daysSincePurchase} dias. ` +
        `Não foi possível obter o preço atual de mercado; a análise baseia-se apenas nos dados de aquisição. ` +
        `Recomenda-se acompanhar as cotações em tempo real e verificar os fundamentos do ativo antes de qualquer movimentação. ` +
        `Continue monitorando o contexto macroeconômico e os catalisadores específicos do setor.`,
    };
  }

  const sign = pnl >= 0 ? '+' : '';
  const pnlStr = `${sign}${pnl.toFixed(1)}%`;

  if (pnl > 30) {
    return {
      recommendation: 'VENDA',
      analysis:
        `${asset.name} (${asset.symbol}) acumula valorização expressiva de ${pnlStr} em ${daysSincePurchase} dias. ` +
        `Ganhos dessa magnitude tornam a realização parcial de lucros uma estratégia prudente para preservar o capital conquistado. ` +
        `${isCrypto
          ? 'O mercado de criptoativos é altamente volátil; correções abruptas são frequentes após fortes altas e podem apagar rapidamente os ganhos acumulados.'
          : 'Avalie se os múltiplos atuais ainda estão compatíveis com os fundamentos ou se o mercado já precificou o crescimento esperado para os próximos trimestres.'
        } ` +
        `Considere desinvestir uma fração da posição e realocar os recursos em ativos com maior margem de segurança.`,
    };
  }

  if (pnl > 10) {
    return {
      recommendation: 'MANTER',
      analysis:
        `${asset.name} (${asset.symbol}) apresenta valorização saudável de ${pnlStr} em ${daysSincePurchase} dias. ` +
        `O ativo está performando acima do preço médio de compra, indicando uma entrada bem posicionada. ` +
        `Manter a posição é a estratégia mais consistente neste momento, permitindo que os ganhos continuem a se acumular. ` +
        `${isCrypto
          ? 'Fique atento a mudanças regulatórias e ao sentimento geral do mercado cripto.'
          : 'Monitore os próximos resultados trimestrais e indicadores do setor.'
        } ` +
        `Considere ajustar o stop loss para proteger parte dos lucros já obtidos.`,
    };
  }

  if (pnl >= -10) {
    return {
      recommendation: 'MANTER',
      analysis:
        `${asset.name} (${asset.symbol}) opera próximo ao preço médio de compra, com variação de ${pnlStr} em ${daysSincePurchase} dias. ` +
        `Esse comportamento é esperado em fases de consolidação e não representa um sinal de alarme. ` +
        `${isCrypto
          ? 'Para criptoativos, oscilações nessa faixa são consideradas ruído de mercado no curto prazo.'
          : 'Para ações, avalie os fundamentos da empresa e o ambiente macroeconômico antes de qualquer movimentação.'
        } ` +
        `Manter a posição atual é recomendado enquanto os fundamentos permanecerem sólidos. ` +
        `Caso a pressão vendedora persista, reavalie os motivos que motivaram a compra inicial.`,
    };
  }

  if (pnl >= -25) {
    return {
      recommendation: 'MANTER',
      analysis:
        `${asset.name} (${asset.symbol}) acumula queda de ${pnlStr} desde a compra há ${daysSincePurchase} dias. ` +
        `Antes de tomar qualquer decisão, avalie se os fundamentos do ativo se mantêm intactos ou se houve deterioração estrutural. ` +
        `${isCrypto
          ? 'Quedas nessa magnitude são frequentes em ciclos de baixa do mercado cripto e podem representar oportunidade para investidores de longo prazo com convicção na tese.'
          : 'Verifique se a queda é específica da empresa ou reflexo de um movimento mais amplo do setor ou da economia.'
        } ` +
        `Evite aportes adicionais sem uma análise criteriosa e considere reduzir a exposição caso a posição represente uma fatia relevante da carteira.`,
    };
  }

  return {
    recommendation: 'COMPRA',
    analysis:
      `${asset.name} (${asset.symbol}) sofreu depreciação significativa de ${pnlStr} em ${daysSincePurchase} dias, atingindo um nível que pode representar oportunidade de reforço de posição. ` +
      `${isCrypto
        ? 'Em criptoativos com fundamentos sólidos, quedas acentuadas foram historicamente seguidas de recuperações expressivas no longo prazo.'
        : 'Se os fundamentos da empresa permanecem saudáveis, esse preço pode oferecer uma margem de segurança atrativa para novos aportes.'
      } ` +
      `Antes de aumentar a posição, valide que a tese de investimento original ainda é válida e que a queda não reflete uma mudança estrutural negativa. ` +
      `Aportes graduais (estratégia de preço médio) são preferíveis a uma entrada única neste cenário de alta incerteza.`,
  };
}
