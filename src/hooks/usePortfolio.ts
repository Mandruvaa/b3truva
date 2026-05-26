import { useEffect, useState } from 'react';
import { Portfolio } from '../models';
import { loadPortfolio, savePortfolio } from '../services/portfolioService';

export function usePortfolio() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const data = await loadPortfolio();
      setPortfolio(data);
      setIsLoading(false);
    }

    init();
  }, []);

  const persistPortfolio = async (updatedPortfolio: Portfolio) => {
    await savePortfolio(updatedPortfolio);
    setPortfolio(updatedPortfolio);
  };

  return {
    portfolio,
    isLoading,
    persistPortfolio,
  };
}
