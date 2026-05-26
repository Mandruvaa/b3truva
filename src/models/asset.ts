export type AssetType = 'stock' | 'crypto';

export type Asset = {
  id: string;
  symbol: string;
  name: string;
  type: AssetType;
  quantity: number;
  averageCost: number;
  currentPrice?: number;
};
