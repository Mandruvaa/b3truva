import { Asset } from './asset';

export type Portfolio = {
  id: string;
  name: string;
  assets: Asset[];
  updatedAt: string;
};
