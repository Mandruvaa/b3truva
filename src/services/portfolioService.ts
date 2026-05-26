import { Portfolio } from '../models';
import { getItem, setItem } from '../database/storage';

const STORAGE_KEY = 'madruvainvest_portfolio';

export async function loadPortfolio(): Promise<Portfolio> {
  const stored = await getItem<Portfolio>(STORAGE_KEY);

  if (stored) {
    return stored;
  }

  return {
    id: 'default',
    name: 'Carteira Principal',
    assets: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function savePortfolio(portfolio: Portfolio): Promise<void> {
  await setItem(STORAGE_KEY, {
    ...portfolio,
    updatedAt: new Date().toISOString(),
  });
}
