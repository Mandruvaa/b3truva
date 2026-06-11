import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Calendar } from 'react-native-calendars';
import { KnownAsset, KNOWN_ASSETS, searchAssets } from '../data/knownAssets';
import { fetchPortfolioPrices, fetchAssetPrice, fetchDollarRate, fetchHistoricalOHLC, fetchMarketNews, NewsArticle, PriceMap, CryptoPriceMap, BrazilianStockMap, DollarRateResult, DOLLAR_RATE_FALLBACK } from '../services/api';
import { analyzeAsset, AIAnalysis } from '../services/ai';
import Svg, { Path, Defs, LinearGradient as SVGGradient, Stop } from 'react-native-svg';
import TradingViewChart from '../components/TradingViewChart';

// ─── Types ────────────────────────────────────────────────────────────────────
type Category   = 'fiat' | 'crypto';
type Currency   = 'BRL' | 'USD';
type Market     = 'nacional' | 'estrangeiro';
type SortBy     = 'data' | 'nome' | 'valor';
type ActiveView = 'dashboard' | 'investir' | 'carteira' | 'noticias';
type Period    = 'dia' | 'semana' | 'mes' | 'ano' | 'total';
type ChartMode = 'rentabilidade' | 'rendimento';

interface Asset {
  id: string; name: string; symbol: string;
  category: Category; currency: Currency; market: Market;
  quantity: number; purchasePrice: number; date: string;
}
interface NewsItem {
  id: string; title: string; source: string; time: string;
  keywords: string[]; bgColor: string; emoji: string; imageUrl?: string;
}
interface PresetFields {
  category: Category; currency: Currency; market: Market;
}

// ─── Color Palette ────────────────────────────────────────────────────────────
const C = {
  BG:            '#121212',
  SIDEBAR:       '#0A0A0A',
  CARD:          '#1C1C1C',
  CARD2:         '#242424',
  INPUT:         '#252525',
  ORANGE:        '#FF6B00',
  ORANGE_DIM:    'rgba(255,107,0,0.13)',
  ORANGE_BORDER: 'rgba(255,107,0,0.45)',
  TEXT:          '#F2F2F2',
  TEXT_SUB:      '#A0A0A0',
  TEXT_MUTED:    '#525252',
  BORDER:        '#282828',
  BORDER_LIGHT:  '#363636',
  GREEN:         '#4ade80',
  GREEN_DOT:     '#22c55e',
  GREEN_DIM:     'rgba(74,222,128,0.12)',
  GREEN_BORDER:  'rgba(74,222,128,0.3)',
  RED:           '#f87171',
  RED_DIM:       'rgba(248,113,113,0.12)',
  RED_BORDER:    'rgba(248,113,113,0.3)',
  YELLOW:        '#fbbf24',
  YELLOW_DIM:    'rgba(251,191,36,0.12)',
  YELLOW_BORDER: 'rgba(251,191,36,0.4)',
  BLUE:          '#60a5fa',
  BLUE_DIM:      'rgba(96,165,250,0.12)',
  BLUE_BORDER:   'rgba(96,165,250,0.3)',
};

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY = '@mandruva_invest_assets';
const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const AI_PHRASES = ['Acessando dados de mercado...','Avaliando notícias recentes...','Calculando tendências...','Cruzando indicadores técnicos...'];
const ASSET_EXAMPLES = {
  fiat:   { BRL: { ticker:'PETR4', name:'Petrobras' }, USD: { ticker:'TSLA34', name:'Tesla' } },
  crypto: { BRL: { ticker:'BTC',   name:'Bitcoin'   }, USD: { ticker:'ETH',   name:'Ethereum' } },
};

// ─── Category definitions ─────────────────────────────────────────────────────
const INVEST_CATEGORIES = [
  {
    id: 'br',
    icon: '🇧🇷',
    title: 'Ações Brasil',
    exchange: 'B3 · Ibovespa',
    description: 'Monitore empresas nacionais, ações, FIIs e fundos imobiliários listados na bolsa brasileira.',
    examples: ['PETR4','VALE3','ITUB4','WEGE3'],
    accent:    C.GREEN_DOT,
    accentDim: 'rgba(34,197,94,0.10)',
    accentBorder: 'rgba(34,197,94,0.30)',
    preset: { category:'fiat' as Category, currency:'BRL' as Currency, market:'nacional' as Market },
  },
  {
    id: 'us',
    icon: '🌎',
    title: 'Ações EUA',
    exchange: 'Nasdaq · NYSE',
    description: 'Acompanhe as gigantes da tecnologia e o mercado americano em dólar.',
    examples: ['AAPL34','TSLA34','NVDA34','MSFT34'],
    accent:    C.BLUE,
    accentDim: C.BLUE_DIM,
    accentBorder: C.BLUE_BORDER,
    preset: { category:'fiat' as Category, currency:'USD' as Currency, market:'estrangeiro' as Market },
  },
  {
    id: 'crypto',
    icon: '₿',
    title: 'Criptomoedas',
    exchange: 'Bitcoin · Ethereum · Alt',
    description: 'Monitore Bitcoin, Ethereum e ativos descentralizados do mercado cripto.',
    examples: ['BTC','ETH','SOL','XRP'],
    accent:    C.ORANGE,
    accentDim: C.ORANGE_DIM,
    accentBorder: C.ORANGE_BORDER,
    preset: { category:'crypto' as Category, currency:'USD' as Currency, market:'estrangeiro' as Market },
  },
];

// ─── Mock News DB ─────────────────────────────────────────────────────────────
const NEWS_DB: NewsItem[] = [
  { id:'n1',  title:'Petrobras anuncia dividendos recordes para o trimestre',        source:'InfoMoney',       time:'1h atrás',   keywords:['PETR4','PETR3','petrobras'],           bgColor:'#1B2A1A', emoji:'🛢️' },
  { id:'n2',  title:'Vale reporta produção recorde de minério de ferro em maio',     source:'Valor Econômico', time:'2h atrás',   keywords:['VALE3','vale'],                        bgColor:'#1A2118', emoji:'⛏️' },
  { id:'n3',  title:'Itaú Unibanco reporta lucro recorde no primeiro trimestre',     source:'Exame',           time:'3h atrás',   keywords:['ITUB4','ITUB3','itau','itaú'],         bgColor:'#151520', emoji:'🏦' },
  { id:'n4',  title:'Bitcoin ultrapassa US$ 100 mil após aprovação de ETF à vista',  source:'CriptoFácil',     time:'30min atrás',keywords:['BTC','bitcoin'],                       bgColor:'#201A0A', emoji:'₿' },
  { id:'n5',  title:'Ethereum: protocolo é atualizado e moeda sobe 8%',              source:'Portal do Bitcoin',time:'1h atrás',  keywords:['ETH','ethereum'],                     bgColor:'#10152A', emoji:'⟠' },
  { id:'n6',  title:'Tesla supera estimativas de entrega no segundo trimestre',       source:'Reuters',         time:'4h atrás',   keywords:['TSLA','TSLA34','tesla'],               bgColor:'#1A1A1A', emoji:'⚡' },
  { id:'n7',  title:'Apple anuncia nova linha de produtos para o outono',             source:'MacRumors',       time:'5h atrás',   keywords:['AAPL','AAPL34','apple'],               bgColor:'#181820', emoji:'🍎' },
  { id:'n8',  title:'Nubank cresce 40% em base de usuários no último trimestre',      source:'Exame',           time:'2h atrás',   keywords:['NU','NUBS34','nubank'],                bgColor:'#180A2A', emoji:'💜' },
  { id:'n9',  title:'HASH11 rende 18% no mês com alta das criptomoedas',             source:'Suno',            time:'3h atrás',   keywords:['HASH11','BITH11','hashdex'],           bgColor:'#201508', emoji:'🔗' },
  { id:'n10', title:'BBAS3: Banco do Brasil bate consenso e eleva guidance',          source:'SpreadInvest',    time:'4h atrás',   keywords:['BBAS3','banco do brasil'],             bgColor:'#101820', emoji:'🏛️' },
  { id:'n11', title:'Ambev expande para novos mercados com nova linha premium',       source:'Valor',           time:'5h atrás',   keywords:['ABEV3','ambev'],                       bgColor:'#1A1508', emoji:'🍺' },
  { id:'n12', title:'WEG registra margem EBITDA recorde e eleva guidance 2025',      source:'Suno',            time:'6h atrás',   keywords:['WEGE3','weg'],                         bgColor:'#0A1A14', emoji:'⚙️' },
  { id:'n13', title:'Ibovespa fecha em alta com dados de inflação melhores',          source:'InfoMoney',       time:'2h atrás',   keywords:['ibovespa','b3','bolsa'],               bgColor:'#0A1420', emoji:'📈' },
  { id:'n14', title:'Mercado cripto reage positivamente ao halving do Bitcoin',       source:'CoinTelegraph',   time:'1h atrás',   keywords:['BTC','ETH','bitcoin','cripto'],        bgColor:'#1A0F05', emoji:'🚀' },
  { id:'n15', title:'Solana supera recordes de transações diárias na rede',           source:'The Block',       time:'3h atrás',   keywords:['SOL','solana'],                        bgColor:'#0A1520', emoji:'◎' },
];

// ─── Utility Functions ────────────────────────────────────────────────────────
function getLocalDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function getMarketStatus(): { open: boolean; label: string; dotColor: string } {
  // B3 horário: seg-sex 10h–17h, fuso Brasília = UTC-3
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const day      = brt.getUTCDay(); // 0=dom, 6=sab
  const timeMin  = brt.getUTCHours() * 60 + brt.getUTCMinutes();
  const open     = day >= 1 && day <= 5 && timeMin >= 600 && timeMin < 1020; // 10h=600, 17h=1020
  return {
    open,
    label:    open ? 'Mercado aberto' : 'Mercado fechado',
    dotColor: open ? C.GREEN_DOT : C.RED,
  };
}
function formatBRL(v: number) {
  try { return v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' }); }
  catch { return `R$ ${v.toFixed(2)}`; }
}
function getValueInBRL(v: number, cur: Currency, rate: number) { return cur === 'USD' ? v * rate : v; }
function formatDisplay(brlValue: number, displayCur: Currency, rate: number) {
  if (displayCur === 'USD') return `$ ${formatDecimal(brlValue / rate)}`;
  return formatBRL(brlValue);
}
function formatDecimal(v: number, dec = 2) {
  const [i, d] = v.toFixed(dec).split('.');
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g,'.')},${d ?? '00'}`;
}
function formatCurrency(v: number, cur: Currency) { return cur === 'USD' ? `$ ${formatDecimal(v)}` : formatBRL(v); }
function formatQuantity(q: number) { return q.toLocaleString('pt-BR', { maximumFractionDigits: 8 }); }
function formatMoneyDisplay(raw: string) {
  if (!raw) return '';
  const n = parseFloat(raw);
  if (isNaN(n)) return raw.replace('.', ',');
  const [i, d = '00'] = n.toFixed(2).split('.');
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g,'.')},${d}`;
}
function formatDate(ds: string) {
  try { const [y,m,d] = ds.split('-'); return `${d}/${m}/${y}`; } catch { return ds; }
}
function getAssetExample(cat: Category, cur: Currency) { return ASSET_EXAMPLES[cat][cur]; }

// ─── News filter ──────────────────────────────────────────────────────────────
function getNewsForMyAssets(assets: Asset[]): NewsItem[] {
  if (!assets.length) return NEWS_DB.slice(0,4);
  const syms = new Set(assets.map(a => a.symbol.toUpperCase()));
  const words = new Set<string>();
  assets.forEach(a => a.name.toLowerCase().split(/[\s,.-]+/).forEach(w => { if (w.length>3) words.add(w); }));
  const rel = NEWS_DB.filter(n => n.keywords.some(k => {
    if (syms.has(k.toUpperCase())) return true;
    for (const w of words) { if (k.toLowerCase().includes(w)) return true; }
    return false;
  }));
  if (rel.length < 3) return [...rel, ...NEWS_DB.filter(n => !rel.find(r=>r.id===n.id)).slice(0, 4-rel.length)];
  return rel.slice(0,7);
}

// ─── News helpers (UI) ────────────────────────────────────────────────────────
function newsTimeAgo(pubDate: string): string {
  const diff = Date.now() - new Date(pubDate).getTime();
  const min  = Math.max(0, Math.floor(diff / 60000));
  if (min < 60)  return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h  < 24)   return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function newsEmoji(title: string): string {
  const t = title.toLowerCase();
  if (/bitcoin|btc/.test(t))               return '₿';
  if (/ethereum|eth/.test(t))              return '⟠';
  if (/cripto|crypto|blockchain/.test(t))  return '🔗';
  if (/petrobras|petr/.test(t))            return '🛢️';
  if (/vale|minério/.test(t))              return '⛏️';
  if (/itaú|itau|bradesco|banco|bank/.test(t)) return '🏦';
  if (/dólar|dollar|usd/.test(t))          return '💵';
  if (/selic|juros|fed|inflação/.test(t))  return '🏛️';
  if (/bolsa|ibovespa|ação|ações/.test(t)) return '📈';
  if (/tesla|tsla/.test(t))               return '⚡';
  if (/apple|aapl/.test(t))              return '🍎';
  if (/nvidia|nvda/.test(t))             return '🤖';
  return '📰';
}

function newsBgColor(title: string): string {
  const t = title.toLowerCase();
  if (/bitcoin|btc/.test(t))              return '#201A0A';
  if (/ethereum|eth/.test(t))             return '#10152A';
  if (/cripto|crypto/.test(t))            return '#1A0F05';
  if (/petrobras/.test(t))               return '#1B2A1A';
  if (/vale|minério/.test(t))            return '#1A2118';
  if (/dólar|dollar/.test(t))            return '#0A1820';
  if (/bolsa|ibovespa/.test(t))          return '#0A1420';
  return '#1A1A1A';
}

function articleToNewsItem(a: NewsArticle): NewsItem {
  return {
    id:       a.id,
    title:    a.title,
    source:   a.source,
    time:     newsTimeAgo(a.pubDate),
    keywords: [],
    bgColor:  newsBgColor(a.title),
    emoji:    newsEmoji(a.title),
    imageUrl: a.imageUrl,
  };
}

// ─── AI Analysis helpers ──────────────────────────────────────────────────────
type AIVerdict = 'COMPRAR' | 'MANTER' | 'VENDER';

function symHash(symbol: string) {
  return symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}

function getAIVerdict(asset: Asset, currentPrice?: number): AIVerdict {
  const pnl = currentPrice && asset.purchasePrice > 0
    ? ((currentPrice - asset.purchasePrice) / asset.purchasePrice) * 100 : 0;
  const h = symHash(asset.symbol);
  if (pnl > 8 || (pnl > -2 && h % 3 === 0)) return 'COMPRAR';
  if (pnl < -6 || h % 7 === 2) return 'VENDER';
  return 'MANTER';
}

const IA_TEXTS: Record<AIVerdict, string[]> = {
  COMPRAR: [
    'Ativo operando acima da SMA de 200 dias com forte volume comprador. RSI 14 em tendência positiva, confirmando continuidade do movimento de alta.',
    'Golden Cross identificado: SMA 20 cruzou a SMA 50 para cima. Suporte técnico sólido com potencial de valorização de 12–18% no médio prazo.',
    'Volume 40% acima da média histórica nas últimas sessões, sinalizando interesse institucional. MACD com histograma em expansão positiva.',
  ],
  MANTER: [
    'Ativo em consolidação lateral após forte rali. Aguardar rompimento do canal de resistência antes de ampliar posição. Risco/retorno neutro no curto prazo.',
    'Fundamentos sólidos, mas RSI próximo de 70 (sobrecompra). Recomenda-se aguardar correção técnica saudável para reforçar posição.',
    'Sem catalisadores imediatos. Médias móveis convergindo — aguardar definição de tendência. Manter posição conforme estratégia de longo prazo.',
  ],
  VENDER: [
    'Rompimento de suporte chave com volume elevado. SMA 200 atuando como resistência. MACD e Estocástico em território negativo.',
    'Death Cross confirmado: SMA 20 cruzou a SMA 50 para baixo. Ativo abaixo de todas as médias relevantes. Considerar redução de exposição.',
    'Divergência baixista no RSI com volume em queda. Resistência sólida na zona atual. Gestão de risco sugere redução da posição.',
  ],
};

function getAIText(asset: Asset, verdict: AIVerdict) {
  return IA_TEXTS[verdict][symHash(asset.symbol) % IA_TEXTS[verdict].length];
}

// ─── Hub IA: detail target, mock data, combined analysis ─────────────────────
interface DetailTarget {
  symbol: string; name: string; currency: Currency;
  category: 'fiat' | 'crypto'; market: Market;
  sector?: string; currentPrice?: number; purchasePrice?: number;
  change?: number; portfolioAsset?: Asset; coingeckoId?: string;
}

const MOCK_OPPORTUNITIES: DetailTarget[] = [
  { symbol:'PETR4',  name:'Petrobras',     currency:'BRL', category:'fiat',   market:'nacional',    sector:'Petróleo & Gás', currentPrice:38.42, change: 2.34 },
  { symbol:'WEGE3',  name:'WEG',           currency:'BRL', category:'fiat',   market:'nacional',    sector:'Indústria',      currentPrice:48.90, change: 3.15 },
  { symbol:'ITUB4',  name:'Itaú Unibanco', currency:'BRL', category:'fiat',   market:'nacional',    sector:'Bancos',         currentPrice:35.11, change: 1.25 },
  { symbol:'BTC',    name:'Bitcoin',       currency:'USD', category:'crypto', market:'estrangeiro', sector:'Criptomoedas',   currentPrice:97200, change: 4.50, coingeckoId:'bitcoin'  },
  { symbol:'ETH',    name:'Ethereum',      currency:'USD', category:'crypto', market:'estrangeiro', sector:'Criptomoedas',   currentPrice:3400,  change: 2.10, coingeckoId:'ethereum' },
  { symbol:'NVDA34', name:'NVIDIA',        currency:'USD', category:'fiat',   market:'estrangeiro', sector:'Tecnologia',     currentPrice:880,   change: 5.40 },
  { symbol:'VALE3',  name:'Vale',          currency:'BRL', category:'fiat',   market:'nacional',    sector:'Mineração',      currentPrice:61.80, change: 1.80 },
];

const ASSET_NEWS_MOCK: Record<string, string> = {
  PETR4:  'Petrobras anuncia dividendos recordes — yield projetado supera 8% ao ano segundo analistas da XP',
  VALE3:  'Vale reporta produção recorde de minério em maio e revisa guidance de exportações para cima',
  ITUB4:  'Itaú reporta lucro recorde de R$10,8 bi no trimestre — carteira de crédito cresce 12% a.a.',
  BTC:    'Bitcoin ultrapassa US$97.000 com fluxo líquido positivo de US$1,2 bi em ETFs à vista nos EUA',
  ETH:    'Ethereum: atualização de protocolo reduz taxas em 40% e dispara adoção de DeFi',
  WEGE3:  'WEG registra margem EBITDA recorde de 22% e eleva guidance de receita para 2025',
  NVDA34: 'NVIDIA supera estimativas pela 5ª vez consecutiva — expansão de data centers no Brasil confirmada',
};
function getAssetNews(symbol: string, name: string): string {
  return ASSET_NEWS_MOCK[symbol.toUpperCase()]
    ?? `${name} em destaque — indicadores técnicos apontam momentum positivo nas próximas sessões`;
}

const IA_COMBINED_TEXTS: Record<AIVerdict, string[]> = {
  COMPRAR: [
    'O gráfico confirma rompimento da resistência histórica com volume 35% acima da média — sinal claro de força compradora. Aliado ao bom resultado dos dividendos anunciados hoje, o cenário favorece acumulação de posição no curto prazo.',
    'Padrão "Morning Star" identificado na base do suporte. O Golden Cross (SMA20 cruzando SMA50) soma-se ao catalisador fundamental das notícias recentes, projetando valorização de 12–18% no médio prazo.',
    'Volume institucional acima da média nas últimas 5 sessões comprova acumulação silenciosa. A notícia de hoje serve de gatilho para o rompimento do canal de resistência de 90 dias — RSI em 58 deixa espaço para alta.',
  ],
  MANTER: [
    'O ativo toca a média móvel de 50 dias — zona de suporte técnico crítica. Aliado ao resultado misto das notícias do dia, o mercado aguarda catalisador mais claro. Manter posição e aguardar resolução do canal lateral.',
    'Consolidação em triângulo simétrico com volume decrescente. A notícia de hoje foi precificada sem reação expressiva, indicando equilíbrio entre compradores e vendedores. Aguardar rompimento com volume.',
    'Ativo operando entre SMA20 e SMA50 sem tendência definida. As notícias têm impacto neutro. Manter posição atual com stop na mínima da semana.',
  ],
  VENDER: [
    'O ativo rompeu o suporte da SMA200 com volume acima da média — sinal de distribuição institucional. A notícia de hoje reforça a pressão vendedora: MACD cruzou para baixo e RSI está em queda livre.',
    'Death Cross confirmado (SMA20 abaixo da SMA50) com três candles vermelhos de corpo longo. Apesar da tentativa de recuperação nas notícias, o cenário técnico prevalece com resistência sólida no nível atual.',
    'Divergência baixista entre preço e RSI identifica enfraquecimento da tendência. A notícia desfavorável de hoje age como catalisador para a realização. Gestão de risco sugere redução gradual da exposição.',
  ],
};
function getAICombinedText(symbol: string, verdict: AIVerdict): string {
  return IA_COMBINED_TEXTS[verdict][symHash(symbol) % IA_COMBINED_TEXTS[verdict].length];
}

// ─── Chart helpers ────────────────────────────────────────────────────────────
const PERIODS: { id: Period; label: string }[] = [
  { id:'dia',    label:'Dia'    },
  { id:'semana', label:'Semana' },
  { id:'mes',    label:'Mês'    },
  { id:'ano',    label:'Ano'    },
  { id:'total',  label:'Total'  },
];

function generateChartPoints(
  assets: Asset[], period: Period, totalInvested: number, totalCurrent: number,
): number[] {
  const counts: Record<Period,number> = { dia:24, semana:7, mes:30, ano:52, total:24 };
  const n = counts[period];
  if (!assets.length || totalInvested === 0) return Array(n).fill(totalInvested);
  const seed = assets.reduce((a, x) => a + x.symbol.charCodeAt(0) * 31, 0);
  const totalChange = totalCurrent - totalInvested;
  const vol = totalInvested * 0.012;
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1);
    const smooth = p * p * (3 - 2 * p);
    const trend = totalInvested + totalChange * smooth;
    const r = Math.sin(seed + i * 127.1) * 43758.5453;
    pts.push(trend + (r - Math.floor(r) - 0.5) * vol);
  }
  pts[n - 1] = totalCurrent;
  return pts;
}

function buildSvgPath(
  values: number[], w: number, h: number, closeFill = false,
): string {
  if (values.length < 2) return '';
  const pad = 8;
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const toX = (i: number) => pad + (i / (values.length - 1)) * (w - pad * 2);
  const toY = (v: number) => pad + ((maxV - v) / range) * (h - pad * 2);
  const pts = values.map((v, i) => ({ x: toX(i), y: toY(v) }));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const cpx = (pts[i].x - pts[i-1].x) / 3;
    d += ` C ${pts[i-1].x + cpx},${pts[i-1].y} ${pts[i].x - cpx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
  }
  if (closeFill) {
    d += ` L ${pts[pts.length-1].x},${h} L ${pts[0].x},${h} Z`;
  }
  return d;
}

// ─── Vitrine data ─────────────────────────────────────────────────────────────
const VT_CATEGORIES = [
  { id:'br',     icon:'🇧🇷', title:'Ações Brasil',  exchange:'B3 · Ibovespa',
    description:'Empresas nacionais, ações ordinárias e preferenciais listadas na bolsa brasileira.',
    count:'1.358+ opções',
    accent:C.GREEN_DOT, accentDim:'rgba(34,197,94,0.10)', accentBorder:'rgba(34,197,94,0.30)',
    preset:{ category:'fiat' as Category, currency:'BRL' as Currency, market:'nacional' as Market } },
  { id:'us',     icon:'🌎', title:'Ações EUA',      exchange:'Nasdaq · NYSE',
    description:'Gigantes da tecnologia e do mercado americano negociadas em dólar.',
    count:'800+ opções',
    accent:C.BLUE, accentDim:C.BLUE_DIM, accentBorder:C.BLUE_BORDER,
    preset:{ category:'fiat' as Category, currency:'USD' as Currency, market:'estrangeiro' as Market } },
  { id:'bdr',    icon:'🔄', title:'BDRs',           exchange:'B3 · Mercado Internacional',
    description:'Recibos de depósito de ativos estrangeiros negociados diretamente na B3.',
    count:'500+ opções',
    accent:C.YELLOW, accentDim:C.YELLOW_DIM, accentBorder:C.YELLOW_BORDER,
    preset:{ category:'fiat' as Category, currency:'BRL' as Currency, market:'nacional' as Market } },
  { id:'fii',    icon:'🏢', title:'FIIs & ETFs',    exchange:'B3 · Fundos',
    description:'Fundos imobiliários, ETFs de renda variável e fundos de índice.',
    count:'719 opções',
    accent:'#a78bfa', accentDim:'rgba(167,139,250,0.12)', accentBorder:'rgba(167,139,250,0.3)',
    preset:{ category:'fiat' as Category, currency:'BRL' as Currency, market:'nacional' as Market } },
  { id:'crypto', icon:'₿',  title:'Criptomoedas',  exchange:'Bitcoin · Ethereum · Alt',
    description:'Bitcoin, Ethereum, Solana e os principais ativos do mercado descentralizado.',
    count:'3.000+ opções',
    accent:C.ORANGE, accentDim:C.ORANGE_DIM, accentBorder:C.ORANGE_BORDER,
    preset:{ category:'crypto' as Category, currency:'USD' as Currency, market:'estrangeiro' as Market } },
  { id:'rf',     icon:'🏛️', title:'Renda Fixa',    exchange:'Tesouro · CDB · LCI',
    description:'CDBs, LCIs, LCAs, debêntures e títulos do Tesouro Direto Nacional.',
    count:'200+ opções',
    accent:'#34d399', accentDim:'rgba(52,211,153,0.12)', accentBorder:'rgba(52,211,153,0.3)',
    preset:{ category:'fiat' as Category, currency:'BRL' as Currency, market:'nacional' as Market } },
];

const VT_TOP_ASSETS = [
  { id:'t1', ticker:'PETR4',  name:'Petrobras',     category:'Ações',  sector:'petróleo & gás',
    badgeBg:'rgba(34,197,94,0.12)',  badgeColor:C.GREEN_DOT, change:'+2,34%', varColor:C.GREEN, price:'R$ 38,42',
    preset:{ category:'fiat' as Category, currency:'BRL' as Currency, market:'nacional' as Market } },
  { id:'t2', ticker:'VALE3',  name:'Vale',          category:'Ações',  sector:'mineração',
    badgeBg:'rgba(34,197,94,0.12)',  badgeColor:C.GREEN_DOT, change:'-1,12%', varColor:C.RED,   price:'R$ 61,80',
    preset:{ category:'fiat' as Category, currency:'BRL' as Currency, market:'nacional' as Market } },
  { id:'t3', ticker:'BTC',    name:'Bitcoin',       category:'Cripto', sector:'criptomoeda',
    badgeBg:'rgba(255,107,0,0.12)',  badgeColor:C.ORANGE,    change:'+4,50%', varColor:C.GREEN, price:'$ 97.200',
    preset:{ category:'crypto' as Category, currency:'USD' as Currency, market:'estrangeiro' as Market } },
  { id:'t4', ticker:'AAPL34', name:'Apple',         category:'BDR',    sector:'tecnologia',
    badgeBg:'rgba(96,165,250,0.12)', badgeColor:C.BLUE,      change:'+0,87%', varColor:C.GREEN, price:'R$ 12,12',
    preset:{ category:'fiat' as Category, currency:'USD' as Currency, market:'estrangeiro' as Market } },
  { id:'t5', ticker:'ITUB4',  name:'Itaú Unibanco', category:'Ações',  sector:'bancos',
    badgeBg:'rgba(34,197,94,0.12)',  badgeColor:C.GREEN_DOT, change:'+1,25%', varColor:C.GREEN, price:'R$ 35,11',
    preset:{ category:'fiat' as Category, currency:'BRL' as Currency, market:'nacional' as Market } },
  { id:'t6', ticker:'ETH',    name:'Ethereum',      category:'Cripto', sector:'criptomoeda',
    badgeBg:'rgba(255,107,0,0.12)',  badgeColor:C.ORANGE,    change:'+2,10%', varColor:C.GREEN, price:'$ 3.400',
    preset:{ category:'crypto' as Category, currency:'USD' as Currency, market:'estrangeiro' as Market } },
  { id:'t7', ticker:'WEGE3',  name:'WEG',           category:'Ações',  sector:'indústria',
    badgeBg:'rgba(34,197,94,0.12)',  badgeColor:C.GREEN_DOT, change:'+3,15%', varColor:C.GREEN, price:'R$ 48,90',
    preset:{ category:'fiat' as Category, currency:'BRL' as Currency, market:'nacional' as Market } },
];

// ═══════════════════════════════════════════════════════════════════════════════
// ─── CurrencyToggle — pílula deslizante BRL / USD ─────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const PILL_W     = 116;
const PILL_PAD   = 3;
const PILL_INNER = PILL_W - PILL_PAD * 2;

function CurrencyToggle({
  value, onChange,
}: { value: Currency; onChange: (c: Currency) => void }) {
  const anim = useRef(new Animated.Value(value === 'USD' ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue:        value === 'USD' ? 1 : 0,
      duration:       180,
      useNativeDriver: false,
    }).start();
  }, [value]);

  const sliderLeft = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, PILL_INNER / 2],
  });

  return (
    <View style={ct.pill}>
      <Animated.View style={[ct.slider, { width: PILL_INNER / 2, left: sliderLeft }]} />
      {(['BRL', 'USD'] as Currency[]).map(cur => (
        <TouchableOpacity key={cur} style={ct.side} onPress={() => onChange(cur)} activeOpacity={0.8}>
          <Text style={[ct.label, value === cur && ct.labelActive]}>{cur}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const ct = StyleSheet.create({
  pill: {
    width: PILL_W, flexDirection: 'row',
    backgroundColor: '#1A1A1A', borderRadius: 20,
    padding: PILL_PAD, borderWidth: 1, borderColor: C.BORDER,
    position: 'relative' as any, overflow: 'hidden',
  },
  slider: {
    position: 'absolute' as any, top: PILL_PAD, bottom: PILL_PAD,
    borderRadius: 17, backgroundColor: C.ORANGE,
  },
  side:        { flex: 1, paddingVertical: 5, alignItems: 'center', zIndex: 1 },
  label:       { color: C.TEXT_MUTED, fontSize: 11, fontWeight: '700' },
  labelActive: { color: '#fff' },
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── DragRail — horizontal ScrollView with mouse drag support (web) ───────────
// ═══════════════════════════════════════════════════════════════════════════════
function DragRail({ style, contentContainerStyle, children }: {
  style?: any; contentContainerStyle?: any; children: React.ReactNode;
}) {
  const ref        = useRef<ScrollView>(null);
  const dragging   = useRef(false);
  const startX     = useRef(0);
  const startScroll = useRef(0);

  const webHandlers = Platform.OS === 'web' ? ({
    onMouseDown: (e: any) => {
      dragging.current = true;
      startX.current = e.clientX;
      const node = (ref.current as any)?.getScrollableNode?.();
      startScroll.current = node?.scrollLeft ?? 0;
    },
    onMouseMove: (e: any) => {
      if (!dragging.current) return;
      const dx = e.clientX - startX.current;
      const node = (ref.current as any)?.getScrollableNode?.();
      if (node) node.scrollLeft = startScroll.current - dx;
    },
    onMouseUp:    () => { dragging.current = false; },
    onMouseLeave: () => { dragging.current = false; },
  } as any) : {};

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={contentContainerStyle}
      {...webHandlers}
    >
      {children}
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── InvestirView ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function InvestirView({
  onBack,
  onSelectCategory,
}: {
  onBack: () => void;
  onSelectCategory: (preset: PresetFields, categoryId?: string) => void;
}) {
  return (
    <ScrollView style={s.ivScroll} contentContainerStyle={s.vtContent}>

      {/* Back */}
      <TouchableOpacity style={s.backCircleBtn} onPress={onBack} activeOpacity={0.8}>
        <Text style={s.backCircleBtnIcon}>‹</Text>
      </TouchableOpacity>

      {/* ── Promo Banner ── */}
      <View style={s.vtBanner}>
        <View style={s.vtBannerLeft}>
          <Text style={s.vtBannerTag}>MANDRUVA INVEST</Text>
          <Text style={s.vtBannerTitle}>Invista com taxa zero de corretagem e poucos cliques</Text>
          <Text style={s.vtBannerSub}>
            Monitore ações, criptomoedas e fundos em um só lugar — cotações ao vivo e análise por IA.
          </Text>
        </View>
        <Text style={s.vtBannerEmoji}>📊</Text>
      </View>

      {/* ── Rail: Diversifique ── */}
      <View style={s.vtSectionHead}>
        <Text style={s.vtSectionTitle}>Diversifique seus investimentos</Text>
        <Text style={s.vtSectionSub}>
          Mais de 5.000 opções para investir — selecione uma categoria para começar
        </Text>
      </View>

      <DragRail contentContainerStyle={s.vtRailContent} style={s.vtRail}>
        {VT_CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={s.vtCatCard}
            onPress={() => onSelectCategory(cat.preset, cat.id)}
            activeOpacity={0.75}
          >
            <Text style={s.vtCatIcon}>{cat.icon}</Text>
            <Text style={[s.vtCatTitle, { color: cat.accent }]}>{cat.title}</Text>
            <Text style={s.vtCatExchange}>{cat.exchange}</Text>
            <Text style={s.vtCatDesc} numberOfLines={2}>{cat.description}</Text>
            <View style={s.vtCatFooter}>
              <Text style={s.vtCatCount}>{cat.count}</Text>
              <Text style={[s.vtCatArrow, { color: cat.accent }]}>›</Text>
            </View>
          </TouchableOpacity>
        ))}
      </DragRail>

      {/* ── Rail: Carteira Top 5 ── */}
      <View style={[s.vtSectionHead, { marginTop: 36 }]}>
        <Text style={s.vtSectionTitle}>Carteira Top 5</Text>
        <Text style={s.vtSectionSub}>As cinco ações preferidas pelos estrategistas da Mandruva</Text>
      </View>

      <DragRail contentContainerStyle={s.vtRailContent} style={s.vtRail}>
        {VT_TOP_ASSETS.map(a => (
          <TouchableOpacity
            key={a.id}
            style={s.vtAssetCard}
            onPress={() => onSelectCategory(a.preset)}
            activeOpacity={0.75}
          >
            <View style={s.vtAssetCardHead}>
              <View style={[s.vtAssetBadge, { backgroundColor: a.badgeBg }]}>
                <Text style={[s.vtAssetBadgeText, { color: a.badgeColor }]}>{a.category}</Text>
              </View>
              <Text style={[s.vtAssetChange, { color: a.varColor }]}>{a.change}</Text>
            </View>
            <Text style={s.vtAssetTicker}>{a.ticker}</Text>
            <Text style={s.vtAssetSector}>{a.sector}</Text>
            <Text style={s.vtAssetName} numberOfLines={1}>{a.name}</Text>
            <View style={s.vtAssetPriceLine}>
              <Text style={s.vtAssetPriceLabel}>Última preço</Text>
              <Text style={s.vtAssetPrice}>{a.price}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </DragRail>

      {/* Footer: custom add */}
      <View style={s.vtFooter}>
        <TouchableOpacity
          style={s.vtCustomBtn}
          onPress={() => onSelectCategory({ category:'fiat', currency:'BRL', market:'nacional' })}
        >
          <Text style={s.vtCustomBtnText}>+ Adicionar ativo personalizado</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MinhaCarteiraView ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function MinhaCarteiraView({
  assets, currentPrices, totalInvested, totalCurrent, dollarRate,
}: {
  assets: Asset[]; currentPrices: PriceMap;
  totalInvested: number; totalCurrent: number; dollarRate: number;
}) {
  const [period,    setPeriod]    = useState<Period>('mes');
  const [chartMode, setChartMode] = useState<ChartMode>('rentabilidade');
  const { width }  = useWindowDimensions();
  const chartW = Math.min(width - 168, 860);
  const chartH = 200;

  const rendimento    = totalCurrent - totalInvested;
  const rentabilidade = totalInvested > 0 ? (rendimento / totalInvested) * 100 : 0;

  const rawPoints = useMemo(
    () => generateChartPoints(assets, period, totalInvested, totalCurrent),
    [assets, period, totalInvested, totalCurrent],
  );

  const displayPoints = useMemo(() => {
    const base = rawPoints[0] || 1;
    return chartMode === 'rentabilidade'
      ? rawPoints.map(v => ((v - base) / base) * 100)
      : rawPoints.map(v => v - base);
  }, [rawPoints, chartMode]);

  const finalVal = displayPoints[displayPoints.length - 1] ?? 0;
  const isPos    = finalVal >= 0;
  const accentColor = isPos ? C.GREEN : C.RED;

  const linePath = buildSvgPath(rawPoints, chartW, chartH, false);
  const fillPath = buildSvgPath(rawPoints, chartW, chartH, true);

  return (
    <ScrollView style={s.ivScroll} contentContainerStyle={s.ivContent}>

      {/* Header */}
      <View style={s.cwHeader}>
        <Text style={s.cwTitle}>Minha Carteira</Text>
        <Text style={s.cwSubtitle}>Evolução do seu portfólio</Text>
      </View>

      {/* Metric cards */}
      <View style={s.cwMetricsRow}>
        {[
          { label:'Patrimônio atual', value: formatBRL(totalCurrent),           color: C.TEXT },
          { label:'Total investido',  value: formatBRL(totalInvested),           color: C.TEXT_SUB },
          { label:'Rendimento',       value: `${rendimento>=0?'+':''}${formatBRL(rendimento)}`,              color: rendimento>=0?C.GREEN:C.RED },
          { label:'Rentabilidade',    value: `${rentabilidade>=0?'+':''}${formatDecimal(Math.abs(rentabilidade))}%`, color: rentabilidade>=0?C.GREEN:C.RED },
        ].map(m => (
          <View key={m.label} style={s.cwMetricCard}>
            <Text style={s.cwMetricLabel}>{m.label}</Text>
            <Text style={[s.cwMetricValue, { color: m.color }]}>{m.value}</Text>
          </View>
        ))}
      </View>

      {/* Chart card */}
      <View style={s.cwChartCard}>

        {/* Top row: mode toggle + period pills */}
        <View style={s.cwChartTopRow}>
          <View style={s.cwPeriodRow}>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[s.cwPeriodTab, period===p.id && s.cwPeriodTabActive]}
                onPress={() => setPeriod(p.id)}
              >
                <Text style={[s.cwPeriodTabText, period===p.id && s.cwPeriodTabTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.cwModeToggle}>
            {(['rentabilidade','rendimento'] as ChartMode[]).map(m => (
              <TouchableOpacity
                key={m}
                style={[s.cwModeBtn, chartMode===m && s.cwModeBtnActive]}
                onPress={() => setChartMode(m)}
              >
                <Text style={[s.cwModeBtnText, chartMode===m && s.cwModeBtnTextActive]}>
                  {m==='rentabilidade' ? 'Rent. (%)' : 'Rend. (R$)'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Big value */}
        <View style={s.cwBigValRow}>
          <Text style={[s.cwBigValNum, { color: isPos ? C.GREEN : C.RED }]}>
            {chartMode==='rentabilidade'
              ? `${finalVal>=0?'+':''}${formatDecimal(Math.abs(finalVal))}%`
              : `${finalVal>=0?'+':''}${formatBRL(Math.abs(finalVal))}`}
          </Text>
          <Text style={s.cwBigValPeriod}>no período</Text>
        </View>

        {/* SVG chart */}
        {assets.length > 0 ? (
          <View style={{ height: chartH + 16, marginHorizontal: -4 }}>
            <Svg width={chartW} height={chartH}>
              <Defs>
                <SVGGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0"   stopColor={accentColor} stopOpacity="0.35" />
                  <Stop offset="0.7" stopColor={accentColor} stopOpacity="0.06" />
                  <Stop offset="1"   stopColor={accentColor} stopOpacity="0"    />
                </SVGGradient>
              </Defs>
              <Path d={fillPath} fill="url(#grad)" />
              <Path d={linePath} fill="none" stroke={accentColor} strokeWidth={2.5}
                strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
        ) : (
          <View style={[s.cwChartEmpty, { height: chartH }]}>
            <Text style={s.cwEmptyText}>Adicione ativos para ver a evolução do portfólio</Text>
          </View>
        )}
      </View>

      {/* Composition breakdown */}
      <View style={s.cwBreakCard}>
        <Text style={s.cwBreakTitle}>Composição da carteira</Text>
        {assets.length === 0 ? (
          <Text style={[s.cwEmptyText, { paddingVertical: 16 }]}>Nenhum ativo cadastrado</Text>
        ) : (
          assets.map((asset, idx) => {
            const cp  = currentPrices[asset.symbol] ?? asset.purchasePrice;
            const cur = getValueInBRL(asset.quantity * cp, asset.currency, dollarRate);
            const pct = totalCurrent > 0 ? (cur / totalCurrent) * 100 : 0;
            const pnl = asset.purchasePrice > 0
              ? ((cp - asset.purchasePrice) / asset.purchasePrice) * 100 : 0;
            return (
              <View key={asset.id} style={[s.cwBreakRow, idx===assets.length-1&&{borderBottomWidth:0}]}>
                <View style={s.cwBreakLeft}>
                  <Text style={s.cwBreakSymbol}>{asset.symbol}</Text>
                  <Text style={s.cwBreakName} numberOfLines={1}>{asset.name}</Text>
                </View>
                <View style={s.cwBreakBarWrap}>
                  <View style={[s.cwBreakBarFill, { width: `${Math.min(pct,100)}%` as any }]} />
                </View>
                <View style={s.cwBreakRight}>
                  <Text style={s.cwBreakValue}>{formatBRL(cur)}</Text>
                  <Text style={[s.cwBreakPnl, { color: pnl>=0?C.GREEN:C.RED }]}>
                    {pnl>=0?'↑':'↓'} {formatDecimal(Math.abs(pnl))}%
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>

    </ScrollView>
  );
}

// ─── OHLC Candlestick Chart ───────────────────────────────────────────────────
interface OHLC { date: string; o: number; h: number; l: number; c: number; v: number; }

function generateOHLC(symbol: string, seedPrice: number, n = 60): OHLC[] {
  const seed   = symHash(symbol);
  const target = Math.max(seedPrice, 0.01);
  const base   = target * 0.82;
  const result: OHLC[] = [];
  let p = base;
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const r = (k: number) => { const x = Math.sin(seed * 0.137 + i * k) * 43758.5453; return x - Math.floor(x); };
    const trend = (target - base) / (n * Math.max(base * 0.15, 1));
    const vol   = (r(127.1) - 0.44) * 0.055 + trend;
    const o = p, c = p * (1 + vol);
    const swing = Math.abs(c - o) + p * 0.003;
    const h = Math.max(o, c) + swing * r(311.7) * 0.8 + p * 0.002 * r(199.3);
    const l = Math.min(o, c) - swing * r(571.3) * 0.8 - p * 0.002 * r(401.7);
    const d = new Date(now);
    d.setDate(d.getDate() - (n - 1 - i));
    result.push({ date: d.toISOString().slice(0, 10), o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v: 0.08 + r(991.7) * 0.92 });
    p = c;
  }
  return result;
}

const SMA_CONFIG = [
  { period: 8,  color: '#e879f9' },
  { period: 16, color: C.ORANGE  },
  { period: 28, color: C.BLUE    },
];

// ═══════════════════════════════════════════════════════════════════════════════
// ─── AssetDetailModal — Finviz-style ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function AssetDetailModal({ item, visible, onClose }: {
  item: DetailTarget | null; visible: boolean; onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const chartW = width;
  const chartH = Math.min(Math.max(260, height * 0.30), 320);

  const [ohlcData,    setOhlcData]    = useState<OHLC[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    if (!visible || !item) return;
    let cancelled = false;
    setChartLoading(true);
    setOhlcData([]);
    fetchHistoricalOHLC(item.symbol, item.category, item.market, item.coingeckoId)
      .then(bars => {
        if (cancelled) return;
        if (bars.length > 0) {
          setOhlcData(bars.map(b => ({ date: b.time, o: b.open, h: b.high, l: b.low, c: b.close, v: 1 })));
        } else {
          setOhlcData(generateOHLC(item.symbol, item.currentPrice || item.purchasePrice || 100, 60));
        }
      })
      .catch(() => {
        if (!cancelled) setOhlcData(generateOHLC(item.symbol, item.currentPrice || item.purchasePrice || 100, 60));
      })
      .finally(() => { if (!cancelled) setChartLoading(false); });
    return () => { cancelled = true; };
  }, [visible, item?.symbol]);

  const verdict = item?.portfolioAsset
    ? getAIVerdict(item.portfolioAsset, item.currentPrice)
    : 'COMPRAR';

  const newsText = item ? getAssetNews(item.symbol, item.name) : '';
  const aiText   = item ? getAICombinedText(item.symbol, verdict) : '';

  const vStyle = verdict === 'COMPRAR'
    ? { bg:C.GREEN_DIM,  border:C.GREEN_BORDER,  color:C.GREEN  }
    : verdict === 'VENDER'
    ? { bg:C.RED_DIM,    border:C.RED_BORDER,    color:C.RED    }
    : { bg:C.YELLOW_DIM, border:C.YELLOW_BORDER, color:C.YELLOW };

  const pnlPct = item?.currentPrice && item?.purchasePrice && item.purchasePrice > 0
    ? ((item.currentPrice - item.purchasePrice) / item.purchasePrice) * 100
    : item?.change ?? null;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.detailModal}>

          {/* ── Floating back button (top-left, outside scroll) ── */}
          <TouchableOpacity style={s.detailBackBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={s.detailBackBtnIcon}>‹</Text>
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

            {/* ── Header ── */}
            <View style={s.detailHeader}>
              <View style={{ flex:1, paddingLeft:52 }}>
                <View style={{ flexDirection:'row', alignItems:'center', gap:10, flexWrap:'wrap' as any }}>
                  <Text style={s.detailTicker}>{item?.symbol ?? '—'}</Text>
                  {pnlPct != null && (
                    <View style={[s.detailChangeBadge, {
                      backgroundColor: pnlPct >= 0 ? C.GREEN_DIM : C.RED_DIM,
                      borderColor:     pnlPct >= 0 ? C.GREEN_BORDER : C.RED_BORDER,
                    }]}>
                      <Text style={[s.detailChangeText, { color: pnlPct >= 0 ? C.GREEN : C.RED }]}>
                        {pnlPct >= 0 ? '↑' : '↓'} {formatDecimal(Math.abs(pnlPct))}%
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={s.detailName}>{item?.name ?? ''}</Text>
                {item?.sector ? <Text style={s.detailSector}>{item.sector}</Text> : null}
              </View>
              <View style={{ alignItems:'flex-end' as any }}>
                {item?.currentPrice != null && (
                  <Text style={s.detailPrice}>{formatCurrency(item.currentPrice, item?.currency ?? 'BRL')}</Text>
                )}
              </View>
            </View>

            {/* ── News strip ── */}
            <View style={s.detailNewsStrip}>
              <Text style={s.detailNewsIcon}>📰</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex:1 }}>
                <Text style={s.detailNewsText} numberOfLines={1}>{newsText}</Text>
              </ScrollView>
            </View>

            {/* ── Chart toolbar ── */}
            <View style={s.detailChartToolbar}>
              <Text style={s.detailChartToolbarTitle}>Candle Diário · Análise Técnica</Text>
              <View style={{ flexDirection:'row', gap:10 }}>
                {([
                  { label:'SMA 8',  color:'#e879f9' },
                  { label:'SMA 16', color:C.ORANGE  },
                  { label:'SMA 28', color:C.BLUE    },
                ] as const).map(l => (
                  <View key={l.label} style={{ flexDirection:'row', alignItems:'center', gap:4 }}>
                    <View style={{ width:16, height:2, backgroundColor:l.color, borderRadius:1 }} />
                    <Text style={{ color:l.color, fontSize:10, fontWeight:'700' }}>{l.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ── Candlestick chart — TradingView Lightweight Charts ── */}
            {chartLoading ? (
              <View style={[s.detailChartArea, { height: chartH, justifyContent:'center', alignItems:'center' }]}>
                <ActivityIndicator size="large" color="#26a69a" />
                <Text style={{ color:'#525252', fontSize:11, marginTop:8 }}>Carregando dados reais…</Text>
              </View>
            ) : ohlcData.length > 0 ? (
              <TradingViewChart data={ohlcData} width={chartW} height={chartH} smas={SMA_CONFIG} />
            ) : null}

            {/* ── AI Analysis panel (rodapé) ── */}
            <View style={s.detailAIPanel}>
              <View style={s.detailAIPanelHeader}>
                <Text style={s.detailAIPanelTitle}>✦ Análise Integrada por IA</Text>
                <View style={[s.detailVerdictBadge, { backgroundColor:vStyle.bg, borderColor:vStyle.border }]}>
                  <Text style={[s.detailVerdictText, { color:vStyle.color }]}>{verdict}</Text>
                </View>
              </View>
              <Text style={s.detailAIText}>{aiText}</Text>
            </View>

          </ScrollView>

          <TouchableOpacity style={[s.aiCloseBtn, { margin:20, marginTop:8 }]} onPress={onClose}>
            <Text style={s.aiCloseBtnText}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── NoticiasView → Hub IA & Análise Técnica ─────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
type IAHubView = 'hub' | 'carteira' | 'oportunidades';

function NoticiasView({ assets, currentPrices, onBack }: {
  assets: Asset[]; currentPrices: PriceMap; onBack: () => void;
}) {
  const [hubView,    setHubView]    = useState<IAHubView>('hub');
  const [detailItem, setDetailItem] = useState<DetailTarget | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const openDetail = (item: DetailTarget) => { setDetailItem(item); setDetailOpen(true); };
  const closeDetail = () => setDetailOpen(false);

  // Build DetailTarget list from portfolio assets
  const portfolioItems: DetailTarget[] = assets.map(a => {
    const known = KNOWN_ASSETS.find(k => k.symbol === a.symbol);
    return {
      symbol:        a.symbol,
      name:          a.name,
      currency:      a.currency,
      category:      a.category,
      market:        a.market,
      coingeckoId:   known?.coingeckoId,
      currentPrice:  currentPrices[a.symbol],
      purchasePrice: a.purchasePrice,
      change:        currentPrices[a.symbol] && a.purchasePrice > 0
        ? ((currentPrices[a.symbol] - a.purchasePrice) / a.purchasePrice) * 100
        : undefined,
      portfolioAsset: a,
    };
  });

  const listItems  = hubView === 'carteira' ? portfolioItems : MOCK_OPPORTUNITIES;
  const listTitle  = hubView === 'carteira' ? 'Minha Carteira' : 'Oportunidades';
  const listIcon   = hubView === 'carteira' ? '📊' : '🚀';

  // ── Hub view (two big entry cards) ────────────────────────────────────────
  if (hubView === 'hub') {
    const carteiraVerdict = assets.length
      ? (() => {
          const counts = { COMPRAR:0, MANTER:0, VENDER:0 };
          assets.forEach(a => counts[getAIVerdict(a, currentPrices[a.symbol])]++);
          return counts;
        })()
      : null;

    return (
      <>
        <ScrollView style={s.ivScroll} contentContainerStyle={s.ivContent}>
          <TouchableOpacity style={s.backCircleBtn} onPress={onBack} activeOpacity={0.8}>
            <Text style={s.backCircleBtnIcon}>‹</Text>
          </TouchableOpacity>

          <View style={s.cwHeader}>
            <View style={{ flexDirection:'row', alignItems:'center', gap:10, marginBottom:6 }}>
              <Text style={[s.cardTitleIcon, { fontSize:18 }]}>✦</Text>
              <Text style={s.cwTitle}>Hub de Análise IA</Text>
            </View>
            <Text style={s.cwSubtitle}>
              Inteligência artificial e gráficos técnicos para cada ativo
            </Text>
          </View>

          <View style={s.iaHubGrid}>

            {/* ── Card: Minha Carteira ── */}
            <TouchableOpacity
              style={[s.iaHubCard, s.iaHubCardPortfolio]}
              onPress={() => setHubView('carteira')}
              activeOpacity={0.82}
            >
              <View style={s.iaHubCardTop}>
                <Text style={s.iaHubCardIcon}>📊</Text>
                <View style={s.iaHubCardBadge}>
                  <Text style={s.iaHubCardBadgeText}>{assets.length} ativos</Text>
                </View>
              </View>
              <Text style={s.iaHubCardTitle}>Minha Carteira</Text>
              <Text style={s.iaHubCardSub}>Manter / Vender</Text>
              {carteiraVerdict ? (
                <View style={s.iaHubVerdictRow}>
                  <Text style={[s.iaHubVerdictChip, { color:C.GREEN }]}>▲ {carteiraVerdict.COMPRAR}</Text>
                  <Text style={[s.iaHubVerdictChip, { color:C.YELLOW }]}>● {carteiraVerdict.MANTER}</Text>
                  <Text style={[s.iaHubVerdictChip, { color:C.RED }]}>▼ {carteiraVerdict.VENDER}</Text>
                </View>
              ) : (
                <Text style={s.iaHubCardEmpty}>Adicione ativos para ver análise</Text>
              )}
              <View style={s.iaHubCardArrow}><Text style={s.iaHubCardArrowText}>Ver análise  →</Text></View>
            </TouchableOpacity>

            {/* ── Card: Oportunidades ── */}
            <TouchableOpacity
              style={[s.iaHubCard, s.iaHubCardOpp]}
              onPress={() => setHubView('oportunidades')}
              activeOpacity={0.82}
            >
              <View style={s.iaHubCardTop}>
                <Text style={s.iaHubCardIcon}>🚀</Text>
                <View style={[s.iaHubCardBadge, { backgroundColor:'rgba(255,107,0,0.18)', borderColor:C.ORANGE_BORDER }]}>
                  <Text style={[s.iaHubCardBadgeText, { color:C.ORANGE }]}>IA recomenda</Text>
                </View>
              </View>
              <Text style={s.iaHubCardTitle}>Oportunidades</Text>
              <Text style={s.iaHubCardSub}>Comprar agora</Text>
              <View style={s.iaHubVerdictRow}>
                {MOCK_OPPORTUNITIES.slice(0,4).map(o => (
                  <Text key={o.symbol} style={s.iaHubOppTicker}>{o.symbol}</Text>
                ))}
              </View>
              <View style={s.iaHubCardArrow}><Text style={s.iaHubCardArrowText}>Ver lista  →</Text></View>
            </TouchableOpacity>

          </View>
        </ScrollView>

        <AssetDetailModal item={detailItem} visible={detailOpen} onClose={closeDetail} />
      </>
    );
  }

  // ── Asset list view ────────────────────────────────────────────────────────
  return (
    <>
      <ScrollView style={s.ivScroll} contentContainerStyle={s.ivContent}>
        <TouchableOpacity style={s.backCircleBtn} onPress={() => setHubView('hub')} activeOpacity={0.8}>
          <Text style={s.backCircleBtnIcon}>‹</Text>
        </TouchableOpacity>

        <View style={s.cwHeader}>
          <View style={{ flexDirection:'row', alignItems:'center', gap:10, marginBottom:6 }}>
            <Text style={{ fontSize:18 }}>{listIcon}</Text>
            <Text style={s.cwTitle}>{listTitle}</Text>
          </View>
          <Text style={s.cwSubtitle}>
            {hubView === 'carteira'
              ? 'Análise técnica por ativo da sua carteira'
              : 'Ativos recomendados pela IA com sinal de compra'}
          </Text>
        </View>

        {listItems.length === 0 ? (
          <View style={s.emptyTableBox}>
            <Text style={{ fontSize:36, marginBottom:12 }}>📊</Text>
            <Text style={s.emptyTableText}>Nenhum ativo encontrado.</Text>
          </View>
        ) : (
          <View style={s.iaListCard}>
            {listItems.map((item, idx) => {
              const isLast  = idx === listItems.length - 1;
              const verdict = item.portfolioAsset
                ? getAIVerdict(item.portfolioAsset, item.currentPrice)
                : 'COMPRAR';
              const pct = item.change ?? null;
              const vStyle = verdict === 'COMPRAR'
                ? { bg:C.GREEN_DIM,  border:C.GREEN_BORDER,  color:C.GREEN  }
                : verdict === 'VENDER'
                ? { bg:C.RED_DIM,    border:C.RED_BORDER,    color:C.RED    }
                : { bg:C.YELLOW_DIM, border:C.YELLOW_BORDER, color:C.YELLOW };

              return (
                <TouchableOpacity
                  key={item.symbol + idx}
                  style={[s.iaListRow, isLast && { borderBottomWidth:0 }]}
                  onPress={() => openDetail(item)}
                  activeOpacity={0.75}
                >
                  <View style={s.iaListLeft}>
                    <Text style={s.iaListTicker}>{item.symbol}</Text>
                    <Text style={s.iaListName} numberOfLines={1}>{item.name}</Text>
                  </View>

                  <View style={s.iaListMid}>
                    {item.currentPrice != null && (
                      <Text style={s.iaListPrice}>
                        {formatCurrency(item.currentPrice, item.currency)}
                      </Text>
                    )}
                    {pct != null ? (
                      <Text style={[s.iaListChange, { color: pct >= 0 ? C.GREEN : C.RED }]}>
                        {pct >= 0 ? '↑' : '↓'} {formatDecimal(Math.abs(pct))}%
                      </Text>
                    ) : <Text style={{ color:C.TEXT_MUTED, fontSize:11 }}>—</Text>}
                  </View>

                  <View style={[s.iaListVerdict, { backgroundColor:vStyle.bg, borderColor:vStyle.border }]}>
                    <Text style={[s.iaListVerdictText, { color:vStyle.color }]}>{verdict}</Text>
                  </View>

                  <Text style={s.iaListArrow}>›</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <AssetDetailModal item={detailItem} visible={detailOpen} onClose={closeDetail} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Sidebar ──────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function Sidebar({
  onInvestir, onHome, onCarteira, onNoticias, onSettings, onLogout, activeView,
}: {
  onInvestir:  () => void;
  onHome:      () => void;
  onCarteira:  () => void;
  onNoticias:  () => void;
  onSettings:  () => void;
  onLogout:    () => void;
  activeView: ActiveView;
}) {
  const [tooltip, setTooltip] = useState(false);

  const navItems = [
    { icon:'⌂', title:'Início',    active: activeView === 'dashboard', onPress: onHome     },
    { icon:'📊', title:'Carteira', active: activeView === 'carteira',  onPress: onCarteira },
    { icon:'📰', title:'Hub IA',   active: activeView === 'noticias',  onPress: onNoticias },
  ];

  return (
    <View style={s.sidebar}>
      {/* Logo */}
      <View style={s.sidebarLogo}>
        <Text style={s.sidebarLogoText}>M</Text>
      </View>

      {/* Nav items */}
      <View style={s.sidebarNav}>
        {navItems.map((item, i) => (
          <TouchableOpacity
            key={i}
            style={[s.sidebarItem, item.active && s.sidebarItemActive]}
            onPress={item.onPress}
          >
            <Text style={[s.sidebarIcon, !item.active && s.sidebarIconInactive]}>
              {item.icon}
            </Text>
          </TouchableOpacity>
        ))}

        {/* ── CTA: Investir / Monitorar ── */}
        <View style={s.sidebarAddWrapper}>
          <Pressable
            style={[s.sidebarAddBtn, activeView === 'investir' && s.sidebarAddBtnActive]}
            onPress={onInvestir}
            onHoverIn={() => setTooltip(true)}
            onHoverOut={() => setTooltip(false)}
          >
            <Text style={s.sidebarAddBtnText}>+</Text>
          </Pressable>
          {tooltip && (
            <View style={s.sidebarTooltip}>
              <View style={s.sidebarTooltipArrow} />
              <Text style={s.sidebarTooltipText}>Investir / Monitorar</Text>
            </View>
          )}
        </View>
      </View>

      {/* Bottom items */}
      <View style={s.sidebarBottom}>
        <TouchableOpacity style={s.sidebarItem} onPress={onSettings}>
          <Text style={s.sidebarIconDim}>⚙</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.sidebarItem} onPress={onLogout}>
          <Text style={s.sidebarIconDim}>→</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── NewsCard ─────────────────────────────────────────────────────────────────
const NewsCard = React.memo(function NewsCard({ item }: { item: NewsItem }) {
  return (
    <View style={s.newsCard}>
      <View style={[s.newsImgArea, { backgroundColor: item.bgColor }]}>
        <Text style={s.newsEmoji}>{item.emoji}</Text>
      </View>
      <View style={s.newsCardBody}>
        <Text style={s.newsCardTitle} numberOfLines={3}>{item.title}</Text>
        <View style={s.newsCardFooter}>
          <Text style={s.newsSource}>{item.source}</Text>
          <Text style={s.newsTime}>{item.time}</Text>
        </View>
      </View>
    </View>
  );
});

// ─── AssetTableRow ────────────────────────────────────────────────────────────
const AssetTableRow = React.memo(function AssetTableRow({
  asset, currentPrice, loadingPrice,
  cryptoChange, loadingCrypto,
  b3Change, loadingB3,
  onEdit, onDelete, onAnalyze, isLast,
}: {
  asset: Asset; currentPrice?: number; loadingPrice: boolean;
  cryptoChange?: number | null; loadingCrypto: boolean;
  b3Change?: number | null;     loadingB3: boolean;
  onEdit: (a:Asset)=>void; onDelete: (id:string)=>void;
  onAnalyze: (a:Asset)=>void; isLast: boolean;
}) {
  const purchaseTotal = asset.quantity * asset.purchasePrice;
  const currentTotal  = currentPrice != null ? asset.quantity * currentPrice : null;
  const displayTotal  = currentTotal ?? purchaseTotal;
  const pnlPercent    = currentPrice != null && asset.purchasePrice > 0
    ? ((currentPrice - asset.purchasePrice) / asset.purchasePrice) * 100 : null;
  // Prioridade: variação real da API > PnL calculado vs compra
  const displayVariation =
    asset.category === 'crypto'  && cryptoChange != null ? cryptoChange :
    asset.market   === 'nacional' && b3Change     != null ? b3Change     :
    pnlPercent;
  const isLoadingVariation =
    (loadingCrypto && asset.category === 'crypto') ||
    (loadingB3     && asset.market   === 'nacional');
  const priceDisplay = loadingPrice ? null
    : currentPrice != null ? formatCurrency(currentPrice, asset.currency)
    : formatCurrency(asset.purchasePrice, asset.currency);

  return (
    <View style={[s.tableRow, isLast && { borderBottomWidth:0 }]}>
      <View style={{ flex:2, minWidth:140 }}>
        <Text style={s.rowTicker}>{asset.symbol}</Text>
        <Text style={s.rowName} numberOfLines={1}>{asset.name}</Text>
      </View>
      <Text style={[s.rowCell, { flex:1, minWidth:70, textAlign:'right' }]}>
        {formatQuantity(asset.quantity)}
        {asset.category === 'fiat' && <Text style={s.rowCellMuted}> cot.</Text>}
      </Text>
      <View style={{ flex:1.5, minWidth:100, alignItems:'flex-end' }}>
        {loadingPrice
          ? <ActivityIndicator size="small" color={C.ORANGE} />
          : <Text style={s.rowCell}>{priceDisplay}</Text>}
      </View>
      <View style={{ flex:1, minWidth:90, alignItems:'center' }}>
        {isLoadingVariation ? (
          <ActivityIndicator size="small" color={C.ORANGE} />
        ) : displayVariation != null ? (
          <View style={[s.varBadge, displayVariation >= 0 ? s.varPos : s.varNeg]}>
            <Text style={[s.varText, { color: displayVariation >= 0 ? C.GREEN : C.RED }]}>
              {displayVariation >= 0 ? '↑' : '↓'} {formatDecimal(Math.abs(displayVariation))}%
            </Text>
          </View>
        ) : <Text style={s.rowCellMuted}>—</Text>}
      </View>
      <Text style={[s.rowCell, { flex:1.5, minWidth:110, textAlign:'right' }]}>
        {formatCurrency(displayTotal, asset.currency)}
      </Text>
      <View style={s.rowActions}>
        <TouchableOpacity style={s.rowActionBtn} onPress={() => onAnalyze(asset)}>
          <Text style={s.rowActionIA}>✦ IA</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.rowActionBtn} onPress={() => onEdit(asset)}>
          <Text style={s.rowActionIcon}>✏️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.rowActionBtn} onPress={() => {
          if (Platform.OS === 'web') {
            if ((window as any).confirm('Deletar este ativo?')) onDelete(asset.id);
          } else {
            Alert.alert('Deletar', 'Tem certeza?', [
              { text:'Cancelar', style:'cancel' },
              { text:'Deletar', onPress:()=>onDelete(asset.id), style:'destructive' },
            ]);
          }
        }}>
          <Text style={s.rowActionIcon}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ─── AssetFormModal ───────────────────────────────────────────────────────────
// Formulário de adicionar/editar ativo com estado 100% local (campos, máscaras,
// sugestões e calendário): digitar aqui não re-renderiza o Dashboard.
// Comunicação com o pai apenas via isOpen / onClose / onSave(payload).
interface AssetFormPayload {
  name: string; symbol: string;
  category: Category; currency: Currency; market: Market;
  quantity: number; purchasePrice: number; date: string;
}

const EMPTY_FORM = {
  name:'', symbol:'', quantity:'', purchasePrice:'',
  category:'crypto' as Category, currency:'USD' as Currency,
  market:'estrangeiro' as Market, date:'',
};

function AssetFormModal({
  isOpen, editingAsset, initialPreset, initialPresetCategoryId, dollarRate, onClose, onSave,
}: {
  isOpen: boolean;
  editingAsset: Asset | null;
  initialPreset: PresetFields | null;
  initialPresetCategoryId: string | null;
  dollarRate: number;
  onClose: () => void;
  onSave: (data: AssetFormPayload) => void;
}) {
  // ── Form state (local) ──
  const [formData,      setFormData]      = useState(EMPTY_FORM);
  const [suggestions,   setSuggestions]   = useState<KnownAsset[]>([]);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [isTypingPrice, setIsTypingPrice] = useState(false);
  const [focusedField,  setFocusedField]  = useState<string | null>(null);
  const [presetFields,     setPresetFields]     = useState<PresetFields | null>(null);
  const [presetCategoryId, setPresetCategoryId] = useState<string | null>(null);

  // ── Calendar state (local) ──
  const [calendarVisible,  setCalendarVisible]  = useState(false);
  const [monthYearVisible, setMonthYearVisible] = useState(false);
  const [calendarMonth,    setCalendarMonth]    = useState(getLocalDateString());
  const [pickerYear,       setPickerYear]       = useState(new Date().getFullYear());
  const [pickerMonth,      setPickerMonth]      = useState(new Date().getMonth());

  // Reinicializa o formulário a cada abertura (novo com preset ou edição)
  useEffect(() => {
    if (!isOpen) return;
    if (editingAsset) {
      setFormData({
        name: editingAsset.name, symbol: editingAsset.symbol,
        quantity:      editingAsset.quantity.toString(),
        purchasePrice: editingAsset.purchasePrice.toString(),
        category: editingAsset.category, currency: editingAsset.currency,
        market: editingAsset.market, date: editingAsset.date,
      });
    } else {
      setFormData({ ...EMPTY_FORM,
        category: initialPreset?.category ?? EMPTY_FORM.category,
        currency: initialPreset?.currency ?? EMPTY_FORM.currency,
        market:   initialPreset?.market   ?? EMPTY_FORM.market,
      });
    }
    setPresetFields(initialPreset);
    setPresetCategoryId(initialPresetCategoryId);
    setSuggestions([]); setFetchingPrice(false); setIsTypingPrice(false);
    setFocusedField(null); setCalendarVisible(false); setMonthYearVisible(false);
  }, [isOpen, editingAsset, initialPreset, initialPresetCategoryId]);

  // ── Handlers (locais) ──
  const handleCurrencyChange = (cur: Currency) => {
    if (formData.currency === cur) return;
    const pv = parseFloat(formData.purchasePrice.replace(/,/g,'.'));
    if (!pv || isNaN(pv)) { setFormData(p=>({...p,currency:cur})); return; }
    const np = formData.currency==='USD' && cur==='BRL' ? pv*dollarRate : pv/dollarRate;
    setFormData(p=>({...p, currency:cur, purchasePrice:np.toFixed(2)}));
  };

  const handleTickerChange = (text: string) => {
    const upper = text.toUpperCase().trim();
    // Auto-corrige mercado/moeda quando o ticker bate exatamente com um ativo conhecido
    if (upper.length >= 3) {
      const known = KNOWN_ASSETS.find(a => a.symbol === upper);
      if (known) {
        setFormData(p => ({
          ...p, symbol: text,
          category: known.category,
          currency: known.currency,
          market:   known.market,
        }));
        // Atualiza badge de preset para refletir a categoria corrigida
        const matchedCat = VT_CATEGORIES.find(c =>
          c.preset.category === known.category && c.preset.market === known.market
        );
        if (matchedCat) { setPresetCategoryId(matchedCat.id); setPresetFields(matchedCat.preset); }
        setSuggestions(searchAssets(text));
        return;
      }
    }
    setFormData(p => ({ ...p, symbol: text }));
    setSuggestions(upper.length >= 1 ? searchAssets(text) : []);
  };

  const handleSelectSuggestion = async (asset: KnownAsset) => {
    setSuggestions([]);
    setFormData(p=>({...p, symbol:asset.symbol, name:asset.name,
      category:asset.category, currency:asset.currency, market:asset.market, purchasePrice:''}));
    setFetchingPrice(true); setIsTypingPrice(false);
    try { const price = await fetchAssetPrice(asset); setFormData(p=>({...p,purchasePrice:String(price)})); }
    catch {}
    finally { setFetchingPrice(false); }
  };

  const handleSubmit = () => {
    const missing: string[] = [];
    if (!formData.symbol)        missing.push('Código (Ticker)');
    if (!formData.name)          missing.push('Nome do Ativo');
    if (!formData.quantity)      missing.push('Quantidade');
    if (!formData.purchasePrice) missing.push('Preço de Compra');
    if (!formData.date)          missing.push('Data de Obtenção');
    if (missing.length) {
      const msg = `Campos obrigatórios:\n• ${missing.join('\n• ')}`;
      Platform.OS === 'web' ? (window as any).alert(msg) : Alert.alert('Campos obrigatórios', msg);
      return;
    }
    onSave({
      name:     formData.name,
      symbol:   formData.symbol.toUpperCase(),
      category: formData.category,
      currency: formData.currency,
      market:   formData.market,
      quantity:      parseFloat(formData.quantity.replace(/,/g,'.')),
      purchasePrice: parseFloat(formData.purchasePrice.replace(/,/g,'.')),
      date:     formData.date,
    });
  };

  // ── Derived ──
  const isEditing     = editingAsset !== null;
  const todayStr      = getLocalDateString();
  const isTodayActive = formData.date === todayStr;
  const example       = getAssetExample(formData.category, formData.currency);
  const currSymbol    = formData.currency==='USD' ? '$' : 'R$';
  const presetInfo    = presetCategoryId
    ? (VT_CATEGORIES.find(c => c.id === presetCategoryId) ?? null)
    : null;

  return (
    <Modal animationType="slide" transparent visible={isOpen} onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.formModal}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={s.formTitle}>{isEditing ? 'Editar Ativo' : 'Novo Ativo'}</Text>

            {/* Preset badge + seletor de categoria */}
            {presetInfo && !isEditing && (
              <>
                <View style={[s.presetBadge, { borderColor: presetInfo.accentBorder, backgroundColor: presetInfo.accentDim }]}>
                  <Text style={s.presetBadgeIcon}>{presetInfo.icon}</Text>
                  <View style={{ flex:1 }}>
                    <Text style={[s.presetBadgeTitle, { color: presetInfo.accent }]}>{presetInfo.title}</Text>
                    <Text style={s.presetBadgeLabel}>{presetInfo.exchange} · categoria pré-selecionada</Text>
                  </View>
                </View>
                {/* Trocar categoria */}
                <Text style={s.presetSwitchLabel}>Trocar categoria</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.presetSwitchRow}>
                  {VT_CATEGORIES.map(cat => {
                    const isActive = presetCategoryId === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[s.presetSwitchTab, isActive && s.presetSwitchTabActive]}
                        onPress={() => {
                          setPresetCategoryId(cat.id);
                          setPresetFields(cat.preset);
                          setFormData(p => ({ ...p,
                            category: cat.preset.category,
                            currency: cat.preset.currency,
                            market:   cat.preset.market,
                          }));
                        }}
                      >
                        <Text style={s.presetSwitchIcon}>{cat.icon}</Text>
                        <Text style={[s.presetSwitchText, isActive && s.presetSwitchTextActive]}>
                          {cat.title}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            <Text style={s.formLabel}>Código (Ticker)</Text>
            <TextInput
              style={[s.formInput, isEditing ? s.formInputDisabled : focusedField==='symbol' && s.formInputFocused]}
              placeholder={`Ex: ${example.ticker}`} placeholderTextColor={C.TEXT_MUTED}
              value={formData.symbol}
              onChangeText={t=>!isEditing&&handleTickerChange(t)}
              onFocus={()=>setFocusedField('symbol')} onBlur={()=>setFocusedField(null)}
              editable={!isEditing} autoCapitalize="characters" autoCorrect={false}
            />
            {!isEditing && suggestions.length>0 && (
              <View style={s.suggestBox}>
                {suggestions.map((a,i)=>(
                  <TouchableOpacity key={a.symbol}
                    style={[s.suggestItem,i===suggestions.length-1&&{borderBottomWidth:0}]}
                    onPress={()=>handleSelectSuggestion(a)}>
                    <View>
                      <Text style={s.suggestSymbol}>{a.symbol}</Text>
                      <Text style={s.suggestName}>{a.name}</Text>
                    </View>
                    <View style={{alignItems:'flex-end'}}>
                      <Text style={s.suggestTag}>
                        {a.category==='crypto'?'₿ Cripto':a.market==='nacional'?'🇧🇷 B3':'🌎 Nasdaq'}
                      </Text>
                      <Text style={s.suggestCur}>{a.currency}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={s.formLabel}>Nome do Ativo</Text>
            <TextInput
              style={[s.formInput, isEditing ? s.formInputDisabled : focusedField==='name' && s.formInputFocused]}
              placeholder="Ex: Bitcoin" placeholderTextColor={C.TEXT_MUTED}
              value={formData.name}
              onChangeText={t=>!isEditing&&setFormData(p=>({...p,name:t}))}
              onFocus={()=>setFocusedField('name')} onBlur={()=>setFocusedField(null)}
              editable={!isEditing}
            />

            <Text style={s.formLabel}>Quantidade</Text>
            <TextInput style={[s.formInput, focusedField==='qty' && s.formInputFocused]}
              placeholder="Ex: 0,254"
              placeholderTextColor={C.TEXT_MUTED} keyboardType="decimal-pad"
              value={formData.quantity.replace('.',',')}
              onFocus={()=>setFocusedField('qty')} onBlur={()=>setFocusedField(null)}
              onChangeText={t=>setFormData(p=>({...p,quantity:t.replace(/,/g,'.')}))}
            />

            <View style={s.formLabelRow}>
              <Text style={[s.formLabel,{marginTop:0,marginBottom:0}]}>Preço de Compra ({currSymbol})</Text>
              {fetchingPrice && <Text style={s.fetchingHint}>Buscando cotação...</Text>}
            </View>
            <TextInput
              style={[s.formInput, fetchingPrice ? s.formInputFetching : focusedField==='price' && s.formInputFocused]}
              placeholder={fetchingPrice?'Aguardando API...':`Ex: ${formData.currency==='USD'?'100,00':'500,00'}`}
              placeholderTextColor={fetchingPrice?C.ORANGE:C.TEXT_MUTED}
              keyboardType="decimal-pad"
              value={isTypingPrice ? formData.purchasePrice.replace('.',',') : formatMoneyDisplay(formData.purchasePrice)}
              onFocus={()=>{ setIsTypingPrice(true); setFocusedField('price'); }}
              onBlur={()=>{ setIsTypingPrice(false); setFocusedField(null); }}
              onChangeText={t=>setFormData(p=>({...p,purchasePrice:t.replace(/\./g,'').replace(',','.')}))}
            />

            <Text style={s.formLabel}>Data de Obtenção</Text>
            <View style={s.dateRow}>
              <TouchableOpacity style={s.dateInput} activeOpacity={0.7}
                onPress={()=>{ setCalendarMonth(formData.date||getLocalDateString()); setCalendarVisible(true); }}>
                <TextInput style={s.dateInputText} placeholder="DD/MM/AAAA"
                  placeholderTextColor={C.TEXT_MUTED}
                  value={formData.date ? formatDate(formData.date) : ''}
                  onChangeText={t=>{
                    if (t==='') { setFormData(p=>({...p,date:''})); return; }
                    if (t.length===10&&t[2]==='/'&&t[5]==='/') {
                      const [d,m,y]=t.split('/');
                      setFormData(p=>({...p,date:`${y}-${m}-${d}`}));
                    }
                  }} editable />
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.todayBtn, isTodayActive&&s.todayBtnActive]}
                onPress={()=>{
                  if (isTodayActive) setFormData(p=>({...p,date:''}));
                  else { setFormData(p=>({...p,date:todayStr})); setCalendarVisible(false); }
                }}>
                <Text style={[s.todayBtnText, isTodayActive&&s.todayBtnTextActive]}>
                  {isTodayActive ? '✓ Hoje' : 'Hoje'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Calendar */}
            {calendarVisible && (
              <Modal animationType="fade" transparent visible onRequestClose={()=>setCalendarVisible(false)}>
                <View style={s.calendarOverlay}>
                  <View style={s.calendarBox}>
                    <View style={s.calendarBoxHeader}>
                      <Text style={s.calendarBoxTitle}>Selecionar Data</Text>
                      <TouchableOpacity onPress={()=>setCalendarVisible(false)}>
                        <Text style={s.calendarCloseX}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    <Calendar current={calendarMonth} maxDate={getLocalDateString()}
                      onMonthChange={m=>setCalendarMonth(m.dateString)}
                      renderHeader={date=>{
                        const d=new Date(date.toString());const mi=d.getMonth();const yr=d.getFullYear();
                        return (
                          <TouchableOpacity onPress={()=>{ setPickerYear(yr);setPickerMonth(mi);setMonthYearVisible(true); }}
                            style={{paddingVertical:8,paddingHorizontal:16}}>
                            <Text style={{color:C.TEXT,fontSize:16,fontWeight:'700'}}>{MONTHS_PT[mi]} {yr} ▾</Text>
                          </TouchableOpacity>
                        );
                      }}
                      onDayPress={day=>{ setFormData(p=>({...p,date:day.dateString})); setCalendarVisible(false); }}
                      markedDates={{[formData.date]:{selected:true,selectedColor:C.ORANGE}}}
                      theme={{ backgroundColor:C.CARD, calendarBackground:C.CARD, textSectionTitleColor:C.TEXT_SUB,
                        textSectionTitleDisabledColor:C.TEXT_MUTED, selectedDayBackgroundColor:C.ORANGE,
                        selectedDayTextColor:'#fff', todayTextColor:C.ORANGE, dayTextColor:C.TEXT,
                        textDisabledColor:C.TEXT_MUTED, arrowColor:C.ORANGE, monthTextColor:C.TEXT, indicatorColor:C.ORANGE }}
                    />
                    <TouchableOpacity style={s.calendarCloseBtn} onPress={()=>setCalendarVisible(false)}>
                      <Text style={s.calendarCloseBtnText}>Fechar</Text>
                    </TouchableOpacity>
                    {monthYearVisible && (
                      <Modal animationType="fade" transparent visible onRequestClose={()=>setMonthYearVisible(false)}>
                        <View style={s.calendarOverlay}>
                          <View style={s.calendarBox}>
                            <View style={s.calendarBoxHeader}>
                              <Text style={s.calendarBoxTitle}>Mês / Ano</Text>
                              <TouchableOpacity onPress={()=>setMonthYearVisible(false)}>
                                <Text style={s.calendarCloseX}>✕</Text>
                              </TouchableOpacity>
                            </View>
                            <View style={s.yearPickerRow}>
                              <TouchableOpacity onPress={()=>setPickerYear(y=>y-1)} style={s.yearArrowBtn}>
                                <Text style={s.yearArrowText}>‹</Text>
                              </TouchableOpacity>
                              <Text style={s.yearText}>{pickerYear}</Text>
                              <TouchableOpacity onPress={()=>{ if(pickerYear<new Date().getFullYear())setPickerYear(y=>y+1); }} style={s.yearArrowBtn}>
                                <Text style={[s.yearArrowText, pickerYear>=new Date().getFullYear()&&{color:C.TEXT_MUTED}]}>›</Text>
                              </TouchableOpacity>
                            </View>
                            <View style={s.monthGrid}>
                              {MONTHS_PT.map((m,i)=>{
                                const now=new Date();
                                const fut=pickerYear>now.getFullYear()||(pickerYear===now.getFullYear()&&i>now.getMonth());
                                const sel=i===pickerMonth;
                                return (
                                  <TouchableOpacity key={i} disabled={fut}
                                    style={[s.monthGridBtn,sel&&s.monthGridBtnActive,fut&&{opacity:0.25}]}
                                    onPress={()=>{ setCalendarMonth(`${pickerYear}-${String(i+1).padStart(2,'0')}-01`); setPickerMonth(i); setMonthYearVisible(false); }}>
                                    <Text style={[s.monthGridText,sel&&s.monthGridTextActive]}>{m}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                            <TouchableOpacity style={s.calendarCloseBtn} onPress={()=>setMonthYearVisible(false)}>
                              <Text style={s.calendarCloseBtnText}>Fechar</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </Modal>
                    )}
                  </View>
                </View>
              </Modal>
            )}

            {/* Category / Currency / Market — hidden when preset is active */}
            {!isEditing && !presetFields && (
              <>
                <Text style={s.formLabel}>Categoria</Text>
                <View style={s.toggleRow}>
                  {(['crypto','fiat'] as Category[]).map(cat=>(
                    <TouchableOpacity key={cat}
                      style={[s.toggleBtn, formData.category===cat&&s.toggleBtnActive]}
                      onPress={()=>setFormData(p=>({...p,category:cat}))}>
                      <Text style={[s.toggleBtnText, formData.category===cat&&s.toggleBtnTextActive]}>
                        {cat==='crypto'?'Cripto':'Fiat'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={s.formLabel}>Moeda de Origem</Text>
                <View style={{ marginBottom: 2 }}>
                  <CurrencyToggle value={formData.currency} onChange={handleCurrencyChange} />
                </View>
                {formData.category==='fiat' && (
                  <>
                    <Text style={s.formLabel}>Mercado</Text>
                    <View style={s.toggleRow}>
                      {(['nacional','estrangeiro'] as Market[]).map(mkt=>(
                        <TouchableOpacity key={mkt}
                          style={[s.toggleBtn, formData.market===mkt&&s.toggleBtnActive]}
                          onPress={()=>setFormData(p=>({...p,market:mkt}))}>
                          <Text style={[s.toggleBtnText, formData.market===mkt&&s.toggleBtnTextActive]}>
                            {mkt==='nacional'?'🇧🇷 Ibovespa':'🌎 Nasdaq'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}

            <View style={s.formBtnRow}>
              <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
                <Text style={s.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={handleSubmit}>
                <Text style={s.saveBtnText}>{isEditing ? 'Atualizar' : 'Salvar'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Dashboard ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const { width } = useWindowDimensions();
  const showSidebar = width >= 640;
  const showNews    = width >= 1040;

  // ── View state ──
  const [activeView,   setActiveView]   = useState<ActiveView>('dashboard');
  const [presetFields,     setPresetFields]     = useState<PresetFields | null>(null);
  const [presetCategoryId, setPresetCategoryId] = useState<string | null>(null);

  // ── Asset state ──
  const [assets,         setAssets]         = useState<Asset[]>([]);
  const [currentPrices,  setCurrentPrices]  = useState<PriceMap>({});
  const [loadingPrices,  setLoadingPrices]  = useState(false);
  const [dollarRate,       setDollarRate]       = useState(DOLLAR_RATE_FALLBACK);
  const [dollarOnline,     setDollarOnline]     = useState(true);
  const [displayCurrency,  setDisplayCurrency]  = useState<Currency>('BRL');
  const [cryptoPrices,     setCryptoPrices]     = useState<CryptoPriceMap>({});
  const [loadingCrypto,    setLoadingCrypto]    = useState(false);
  const [b3Prices,         setB3Prices]         = useState<BrazilianStockMap>({});
  const [loadingB3,        setLoadingB3]        = useState(false);

  // ── Filter/sort state ──
  const [filterVisible, setFilterVisible] = useState(false);
  const [sortBy,        setSortBy]        = useState<SortBy>('data');
  const [sortAsc,       setSortAsc]       = useState(false);
  const [filters,       setFilters]       = useState({ search:'', market:'' as Market|'' });

  // ── Form state (o conteúdo do formulário vive dentro do AssetFormModal) ──
  const [modalVisible,  setModalVisible]  = useState(false);
  const [editingAsset,  setEditingAsset]  = useState<Asset | null>(null);

  // ── Settings state ──
  const [settingsVisible, setSettingsVisible] = useState(false);

  // ── AI state ──
  const [analysisVisible, setAnalysisVisible] = useState(false);
  const [analysisAsset,   setAnalysisAsset]   = useState<Asset | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisResult,  setAnalysisResult]  = useState<AIAnalysis | null>(null);
  const [analysisPhrase,  setAnalysisPhrase]  = useState('');

  useEffect(() => { loadAssets(); }, []);
  useEffect(() => {
    fetchDollarRate().then(({ rate, online }: DollarRateResult) => {
      setDollarRate(rate);
      setDollarOnline(online);
    });
  }, []);

  // ── Data ──
  // Pipeline unificado: uma requisição por provedor (BrAPI/Yahoo/CoinGecko)
  // alimenta preços, variação cripto 24h e variação diária B3 numa só passada.
  const fetchPricesForAssets = useCallback(async (list: Asset[]) => {
    if (!list.length) return;
    setLoadingPrices(true); setLoadingCrypto(true); setLoadingB3(true);
    try {
      const { prices, crypto, b3 } = await fetchPortfolioPrices(list);
      setCurrentPrices(prices);
      setCryptoPrices(crypto);
      setB3Prices(b3);
    } catch {}
    finally { setLoadingPrices(false); setLoadingCrypto(false); setLoadingB3(false); }
  }, []);
  const loadAssets = useCallback(async () => {
    try {
      const d = await AsyncStorage.getItem(STORAGE_KEY);
      if (d) { const p: Asset[] = JSON.parse(d); setAssets(p); fetchPricesForAssets(p); }
    } catch (e) { console.error(e); }
  }, [fetchPricesForAssets]);
  const saveAssets = useCallback(async (next: Asset[]) => {
    setAssets(next); fetchPricesForAssets(next);
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) { console.error(e); }
  }, [fetchPricesForAssets]);

  // ── Form logic (o estado interno do formulário vive no AssetFormModal) ──
  const closeForm = useCallback(() => {
    setModalVisible(false);
    setEditingAsset(null); setPresetFields(null); setPresetCategoryId(null);
  }, []);

  const handleSelectCategory = useCallback((preset: PresetFields, categoryId?: string) => {
    setEditingAsset(null); setPresetFields(preset); setPresetCategoryId(categoryId ?? null);
    // Não troca de view aqui — o modal abre sobre a tela atual.
    // Cancelar retorna automaticamente à mesma tela.
    setModalVisible(true);
  }, []);

  const handleEdit = useCallback((asset: Asset) => {
    setEditingAsset(asset);
    setPresetFields(null); setPresetCategoryId(null);
    setModalVisible(true);
  }, []);
  const handleDelete = useCallback((id: string) =>
    saveAssets(assets.filter(a => a.id !== id)), [assets, saveAssets]);

  const handleSaveAsset = useCallback((data: AssetFormPayload) => {
    if (editingAsset) {
      saveAssets(assets.map(a => a.id === editingAsset.id
        ? { ...editingAsset,
            quantity:      data.quantity,
            purchasePrice: data.purchasePrice,
            date:          data.date }
        : a));
    } else {
      const existing = assets.find(a => a.symbol === data.symbol);
      if (existing) {
        const totalQty = existing.quantity + data.quantity;
        const avgPrice = (existing.quantity * existing.purchasePrice + data.quantity * data.purchasePrice) / totalQty;
        saveAssets(assets.map(a => a.id === existing.id
          ? { ...a, quantity: totalQty, purchasePrice: avgPrice }
          : a));
      } else {
        saveAssets([...assets, { id: Date.now().toString(), ...data }]);
      }
    }
    closeForm(); setActiveView('dashboard');
  }, [assets, editingAsset, saveAssets, closeForm]);

  // ── AI ──
  const handleAnalyze = useCallback(async (asset: Asset) => {
    setAnalysisAsset(asset); setAnalysisResult(null); setAnalysisLoading(true);
    setAnalysisVisible(true); setAnalysisPhrase(AI_PHRASES[0]);
    let idx=0; const iv=setInterval(()=>{ idx=(idx+1)%AI_PHRASES.length; setAnalysisPhrase(AI_PHRASES[idx]); },900);
    await new Promise<void>(r=>setTimeout(r,3000)); clearInterval(iv);
    try { setAnalysisResult(await analyzeAsset(asset,currentPrices[asset.symbol])); }
    catch { setAnalysisResult({ recommendation:'MANTER', analysis:'Não foi possível gerar a análise no momento.' }); }
    setAnalysisLoading(false);
  }, [currentPrices]);

  // ── Filtered/sorted ──
  const filteredAssets = useMemo(() => {
    let list = assets;
    if (filters.search) list = list.filter(a =>
      a.name.toLowerCase().includes(filters.search.toLowerCase()) ||
      a.symbol.toLowerCase().includes(filters.search.toLowerCase()));
    if (filters.market) list = list.filter(a => a.market === filters.market);
    return [...list].sort((a,b) => {
      if (sortBy==='data') {
        const d = new Date(a.date).getTime()-new Date(b.date).getTime();
        return sortAsc ? d : -d;
      } else if (sortBy==='nome') {
        const c = a.name.localeCompare(b.name); return sortAsc?c:-c;
      } else {
        const va=getValueInBRL(a.quantity*a.purchasePrice,a.currency,dollarRate);
        const vb=getValueInBRL(b.quantity*b.purchasePrice,b.currency,dollarRate);
        return sortAsc?va-vb:vb-va;
      }
    });
  }, [assets, filters, sortBy, sortAsc, dollarRate]);

  // ── Metrics ── (recalcula apenas quando carteira, preços ou câmbio mudam)
  const { totalInvested, totalCurrent, rendimento, rentabilidade, periodo } = useMemo(() => {
    const totalInvested = assets.reduce((s,a)=>s+getValueInBRL(a.quantity*a.purchasePrice,a.currency,dollarRate),0);
    const totalCurrent  = assets.reduce((s,a)=>s+getValueInBRL(a.quantity*(currentPrices[a.symbol]??a.purchasePrice),a.currency,dollarRate),0);
    const rendimento    = totalCurrent - totalInvested;
    const rentabilidade = totalInvested>0 ? (rendimento/totalInvested)*100 : 0;
    let periodo = '—';
    if (assets.length) {
      const sorted = [...assets].sort((a,b)=>a.date.localeCompare(b.date));
      const [y1,m1,d1] = sorted[0].date.split('-');
      const [y2,m2,d2] = getLocalDateString().split('-');
      periodo = `De ${d1} ${MONTHS_PT[parseInt(m1)-1]} ${y1} a ${d2} ${MONTHS_PT[parseInt(m2)-1]} ${y2}`;
    }
    return { totalInvested, totalCurrent, rendimento, rentabilidade, periodo };
  }, [assets, currentPrices, dollarRate]);

  const [news,        setNews]        = useState<NewsItem[]>(() => getNewsForMyAssets(assets));
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError,   setNewsError]   = useState(false);

  // Helper único de notícias — usado no mount e no botão ↻ de refresh
  const loadNews = useCallback(() => {
    setNewsLoading(true);
    setNewsError(false);
    fetchMarketNews(15)
      .then(articles => setNews(articles.map(articleToNewsItem)))
      .catch(() => { setNewsError(true); setNews(getNewsForMyAssets(assets)); })
      .finally(() => setNewsLoading(false));
  }, [assets]);

  useEffect(() => { loadNews(); }, []);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={s.screen}>

      {/* Sidebar */}
      {showSidebar && (
        <Sidebar
          onHome={() => setActiveView('dashboard')}
          onCarteira={() => setActiveView('carteira')}
          onNoticias={() => setActiveView('noticias')}
          onInvestir={() => setActiveView(v => v==='investir'?'dashboard':'investir')}
          onSettings={() => setSettingsVisible(true)}
          onLogout={() => {
            const msg = 'Deseja realmente sair da sua conta?';
            if (Platform.OS === 'web') {
              if ((window as any).confirm(msg)) { /* logout action */ }
            } else {
              Alert.alert('Sair', msg, [
                { text:'Cancelar', style:'cancel' },
                { text:'Sair', style:'destructive', onPress: () => { /* logout action */ } },
              ]);
            }
          }}
          activeView={activeView}
        />
      )}

      {/* Content Area */}
      <View style={s.contentArea}>

        {/* News column */}
        {showNews && activeView==='dashboard' && (
          <View style={s.newsColumn}>
            <View style={s.newsColumnHeader}>
              <Text style={s.newsColumnTitle}>Últimas notícias</Text>
              <TouchableOpacity onPress={() => { if (!newsLoading) loadNews(); }}>
                <Text style={[s.newsRefresh, newsLoading && { opacity: 0.4 }]}>↻</Text>
              </TouchableOpacity>
            </View>
            {newsLoading && !news.length ? (
              <View style={{ flex:1, justifyContent:'center', alignItems:'center', gap:8, paddingVertical:32 }}>
                <ActivityIndicator size="small" color={C.ORANGE} />
                <Text style={{ color:C.TEXT_MUTED, fontSize:11 }}>Buscando notícias…</Text>
              </View>
            ) : newsError && !news.length ? (
              <View style={{ paddingHorizontal:16, paddingVertical:24 }}>
                <Text style={{ color:C.TEXT_MUTED, fontSize:12, textAlign:'center' as any }}>
                  Não foi possível carregar as notícias.{'\n'}Toque ↻ para tentar novamente.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {newsError && (
                  <View style={{ paddingHorizontal:12, paddingBottom:6 }}>
                    <Text style={{ color:C.TEXT_MUTED, fontSize:10 }}>⚠ Exibindo notícias em cache</Text>
                  </View>
                )}
                <View style={s.newsList}>
                  {news.map(n => <NewsCard key={n.id} item={n} />)}
                </View>
              </ScrollView>
            )}
          </View>
        )}

        {/* Main area — switches between all views */}
        {activeView === 'investir' ? (
          <InvestirView
            onBack={() => setActiveView('dashboard')}
            onSelectCategory={handleSelectCategory}
          />
        ) : activeView === 'carteira' ? (
          <MinhaCarteiraView
            assets={assets}
            currentPrices={currentPrices}
            totalInvested={totalInvested}
            totalCurrent={totalCurrent}
            dollarRate={dollarRate}
          />
        ) : activeView === 'noticias' ? (
          <NoticiasView
            assets={assets}
            currentPrices={currentPrices}
            onBack={() => setActiveView('dashboard')}
          />
        ) : (
          <ScrollView style={s.mainScroll} contentContainerStyle={s.mainContent}>

            {/* Na bolsa agora */}
            <View style={s.card}>
              <View style={s.cardHeader}>
                <View>
                  <View style={s.cardTitleRow}>
                    <Text style={s.cardTitleIcon}>◈</Text>
                    <Text style={s.cardTitle}>Na bolsa agora</Text>
                    <Text style={s.cardArrow}>  →</Text>
                  </View>
                  {(() => {
                    const ms = getMarketStatus();
                    return (
                      <View style={s.marketStatusRow}>
                        <View style={[s.marketDot, { backgroundColor: ms.dotColor }]} />
                        <Text style={s.marketStatusText}>{ms.label}</Text>
                      </View>
                    );
                  })()}
                </View>
                <View style={s.cardHeaderActions}>
                  <TouchableOpacity style={s.filterToggleBtn} onPress={()=>setFilterVisible(v=>!v)}>
                    <Text style={s.filterToggleBtnText}>⊟ Filtrar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.addBtn} onPress={()=>setActiveView('investir')}>
                    <Text style={s.addBtnText}>+ Adicionar</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {filterVisible && (
                <View style={s.filterPanel}>
                  <TextInput style={s.filterInput} placeholder="Buscar por nome ou ticker..."
                    placeholderTextColor={C.TEXT_MUTED} value={filters.search}
                    onChangeText={t=>setFilters(f=>({...f,search:t}))} />
                  <View style={s.filterRow}>
                    {(['','nacional','estrangeiro'] as (Market|'')[]).map(m=>{
                      const lbl=m===''?'Todos':m==='nacional'?'🇧🇷 Ibovespa':'🌎 Nasdaq';
                      return (
                        <TouchableOpacity key={m} style={[s.filterTab,filters.market===m&&s.filterTabActive]}
                          onPress={()=>setFilters(f=>({...f,market:m}))}>
                          <Text style={[s.filterTabText,filters.market===m&&s.filterTabTextActive]}>{lbl}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {(['data','nome','valor'] as SortBy[]).map(sv=>{
                      const lbl={data:'Data',nome:'Nome',valor:'Valor'}[sv];
                      return (
                        <TouchableOpacity key={sv} style={[s.filterTab,sortBy===sv&&s.filterTabActive]}
                          onPress={()=>{ if(sortBy===sv)setSortAsc(v=>!v); else{setSortBy(sv);setSortAsc(false);} }}>
                          <Text style={[s.filterTabText,sortBy===sv&&s.filterTabTextActive]}>
                            {lbl}{sortBy===sv?(sortAsc?' ↑':' ↓'):''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              <Text style={s.tableSubtitle}>Seus ativos</Text>

              {filteredAssets.length===0 ? (
                <View style={s.emptyTableBox}>
                  <Text style={s.emptyTableText}>
                    {assets.length===0
                      ? 'Nenhum ativo cadastrado. Clique em "+ Adicionar" para começar.'
                      : 'Nenhum ativo encontrado para o filtro aplicado.'}
                  </Text>
                  {assets.length===0 && (
                    <TouchableOpacity style={s.emptyAddBtn} onPress={()=>setActiveView('investir')}>
                      <Text style={s.emptyAddBtnText}>+ Adicionar primeiro ativo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <ScrollView
                  style={s.tableBodyScroll}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                >
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.tableScrollContent}>
                    <View style={s.tableMinWidth}>
                      {/* Header dentro do scroll — alinha exatamente com as linhas */}
                      <View style={s.tableHeader}>
                        <Text style={[s.th,{flex:2,minWidth:140}]}>Nome do ativo</Text>
                        <Text style={[s.th,{flex:1,minWidth:70,textAlign:'right'}]}>Quantidade</Text>
                        <Text style={[s.th,{flex:1.5,minWidth:100,textAlign:'right'}]}>Preço agora</Text>
                        <Text style={[s.th,{flex:1,minWidth:90,textAlign:'center'}]}>Variação hoje</Text>
                        <Text style={[s.th,{flex:1.5,minWidth:110,textAlign:'right'}]}>Total investido</Text>
                        <View style={{width:110}} />
                      </View>
                      {filteredAssets.map((asset,i)=>(
                        <AssetTableRow key={asset.id} asset={asset}
                          currentPrice={currentPrices[asset.symbol]}
                          loadingPrice={loadingPrices}
                          cryptoChange={cryptoPrices[asset.symbol]?.usd_24h_change ?? null}
                          loadingCrypto={loadingCrypto}
                          b3Change={b3Prices[asset.symbol]?.changePercent ?? null}
                          loadingB3={loadingB3}
                          onEdit={handleEdit} onDelete={handleDelete} onAnalyze={handleAnalyze}
                          isLast={i===filteredAssets.length-1} />
                      ))}
                    </View>
                  </ScrollView>
                </ScrollView>
              )}
            </View>

            {/* Bottom row */}
            <View style={s.bottomRow}>
              <View style={[s.card,s.investCard]}>
                <View style={s.cardHeader}>
                  <View style={s.cardTitleRow}>
                    <Text style={s.cardTitleIcon}>▸▸</Text>
                    <Text style={s.cardTitle}>Seus investimentos</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <CurrencyToggle value={displayCurrency} onChange={setDisplayCurrency} />
                    <Text style={[s.dollarRateLabel, !dollarOnline && { color: C.ORANGE }]}>
                      {!dollarOnline && '⚠️ '}{formatBRL(dollarRate)} / USD
                    </Text>
                  </View>
                </View>
                {[
                  { label:'Total investido', value: formatDisplay(totalInvested, displayCurrency, dollarRate), color:C.TEXT },
                  { label:'Rendimento',      value: `${rendimento>=0?'↑':'↓'} ${formatDisplay(Math.abs(rendimento), displayCurrency, dollarRate)}`, color:rendimento>=0?C.GREEN:C.RED },
                  { label:'Rentabilidade',   value: `${rentabilidade>=0?'↑':'↓'} ${formatDecimal(Math.abs(rentabilidade))}%`, color:rentabilidade>=0?C.GREEN:C.RED },
                  { label:'Período alt. 12m',value: periodo, color:C.TEXT_MUTED },
                ].map(row=>(
                  <View key={row.label} style={s.investRow}>
                    <Text style={s.investLabel}>{row.label}</Text>
                    <Text style={[s.investValue,{color:row.color}]}>{row.value}</Text>
                  </View>
                ))}
              </View>

              <View style={[s.card,s.investirCard]}>
                <View style={s.cardHeader}>
                  <Text style={[s.cardTitle,{color:C.ORANGE}]}>+ Investir</Text>
                </View>
                <Text style={s.investirSubtitle}>Diversifique sua carteira</Text>
                {INVEST_CATEGORIES.map(cat=>(
                  <TouchableOpacity key={cat.id} style={s.investirItem}
                    onPress={()=>handleSelectCategory(cat.preset, cat.id)}>
                    <View style={{flexDirection:'row',alignItems:'center',gap:8,flex:1}}>
                      <Text style={{fontSize:14}}>{cat.icon}</Text>
                      <Text style={s.investirItemText}>{cat.title}</Text>
                    </View>
                    <Text style={s.investirItemArrow}>›</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={s.investirItem}
                  onPress={()=>handleSelectCategory({category:'fiat',currency:'BRL',market:'nacional'})}>
                  <View style={{flexDirection:'row',alignItems:'center',gap:8,flex:1}}>
                    <Text style={{fontSize:14}}>📋</Text>
                    <Text style={s.investirItemText}>Personalizado</Text>
                  </View>
                  <Text style={s.investirItemArrow}>›</Text>
                </TouchableOpacity>
              </View>
            </View>

          </ScrollView>
        )}
      </View>

      {/* ══ Settings Modal ═══════════════════════════════════════════════════ */}
      <Modal animationType="slide" transparent visible={settingsVisible}
        onRequestClose={() => setSettingsVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={s.settingsModal}>
            <View style={s.settingsHeader}>
              <Text style={s.settingsTitle}>Configurações</Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)}>
                <Text style={s.settingsCloseX}>✕</Text>
              </TouchableOpacity>
            </View>
            {([
              { icon:'👤', label:'Perfil de Investidor',  value:'Moderado' },
              { icon:'🔔', label:'Notificações',          value:'Ativado'  },
              { icon:'🔒', label:'Privacidade',           value:''         },
              { icon:'🎨', label:'Tema',                  value:'Escuro'   },
              { icon:'ℹ️',  label:'Sobre o Mandruva',     value:'v1.0.0'  },
            ] as const).map((row, i) => (
              <TouchableOpacity key={i} style={s.settingsRow} activeOpacity={0.7}>
                <Text style={s.settingsRowIcon}>{row.icon}</Text>
                <Text style={s.settingsRowLabel}>{row.label}</Text>
                {row.value ? <Text style={s.settingsRowValue}>{row.value}</Text> : null}
                <Text style={{ color:C.TEXT_MUTED, fontSize:16, marginLeft:'auto' as any }}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ══ AI Modal ══════════════════════════════════════════════════════════ */}
      <Modal animationType="slide" transparent visible={analysisVisible}
        onRequestClose={()=>setAnalysisVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={s.aiModal}>
            <View style={s.aiModalTitleRow}>
              <Text style={s.aiModalAccent}>✦</Text>
              <Text style={s.aiModalTitle}>Análise IA{analysisAsset?` · ${analysisAsset.name}`:''}</Text>
            </View>
            {analysisLoading ? (
              <View style={s.aiLoadingBox}>
                <ActivityIndicator size="large" color={C.ORANGE} />
                <Text style={s.aiLoadingPhrase}>{analysisPhrase}</Text>
              </View>
            ) : analysisResult ? (
              <>
                <View style={s.aiRecRow}>
                  <Text style={s.aiRecLabel}>Recomendação</Text>
                  <View style={[s.aiRecBadge,
                    analysisResult.recommendation==='COMPRA'&&s.aiRecBuy,
                    analysisResult.recommendation==='VENDA'&&s.aiRecSell,
                    analysisResult.recommendation==='MANTER'&&s.aiRecHold]}>
                    <Text style={[s.aiRecText,
                      analysisResult.recommendation==='COMPRA'&&{color:C.GREEN},
                      analysisResult.recommendation==='VENDA'&&{color:C.RED},
                      analysisResult.recommendation==='MANTER'&&{color:C.YELLOW}]}>
                      {analysisResult.recommendation}
                    </Text>
                  </View>
                </View>
                <Text style={s.aiAnalysisBody}>{analysisResult.analysis}</Text>
              </>
            ) : null}
            <TouchableOpacity style={s.aiCloseBtn} onPress={()=>setAnalysisVisible(false)}>
              <Text style={s.aiCloseBtnText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ══ Add / Edit Modal (estado interno isolado no AssetFormModal) ══════ */}
      <AssetFormModal
        isOpen={modalVisible}
        editingAsset={editingAsset}
        initialPreset={presetFields}
        initialPresetCategoryId={presetCategoryId}
        dollarRate={dollarRate}
        onClose={closeForm}
        onSave={handleSaveAsset}
      />

    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Styles ───────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  screen: { flex:1, flexDirection:'row', backgroundColor:C.BG },

  // ── Sidebar ──
  sidebar: {
    width:72, paddingLeft:8, backgroundColor:C.SIDEBAR, alignItems:'center',
    paddingVertical:16, borderRightWidth:1, borderRightColor:C.BORDER,
    overflow:'visible' as any, zIndex:10,
  },
  sidebarLogo: {
    width:36, height:36, borderRadius:8, backgroundColor:C.ORANGE,
    alignItems:'center', justifyContent:'center', marginBottom:24,
  },
  sidebarLogoText:      { color:'#fff', fontSize:16, fontWeight:'800' },
  sidebarNav:           { flex:1, alignItems:'center', gap:6 },
  sidebarBottom:        { alignItems:'center', gap:6 },
  sidebarItem:          { width:44, height:44, borderRadius:10, alignItems:'center', justifyContent:'center' },
  sidebarItemActive:    { backgroundColor:C.ORANGE_DIM },
  sidebarIcon:          { fontSize:20, color:C.ORANGE },
  sidebarIconInactive:  { fontSize:20, color:C.TEXT_MUTED },
  sidebarIconDim:       { fontSize:20, color:'#8A8A8A' },

  // CTA add button in sidebar
  sidebarAddWrapper:    { position:'relative' as any, alignItems:'center' },
  sidebarAddBtn: {
    width:40, height:40, borderRadius:20,
    backgroundColor:C.ORANGE, alignItems:'center', justifyContent:'center',
    shadowColor:C.ORANGE, shadowOffset:{width:0,height:4},
    shadowOpacity:0.4, shadowRadius:8, elevation:6,
  },
  sidebarAddBtnActive: {
    backgroundColor:'#CC5500',
    shadowOpacity:0.6,
  },
  sidebarAddBtnText: { color:'#fff', fontSize:20, fontWeight:'800', lineHeight:20, textAlign:'center', includeFontPadding:false },
  sidebarTooltip: {
    position:'absolute' as any, left:52, top:8,
    backgroundColor:'#333', borderRadius:8,
    paddingHorizontal:12, paddingVertical:7,
    zIndex:1000, minWidth:160,
    shadowColor:'#000', shadowOffset:{width:0,height:2},
    shadowOpacity:0.35, shadowRadius:6, elevation:8,
    flexDirection:'row', alignItems:'center', gap:6,
  },
  sidebarTooltipArrow: {
    position:'absolute' as any, left:-5, top:10,
    width:0, height:0,
    borderTopWidth:5, borderBottomWidth:5, borderRightWidth:6,
    borderTopColor:'transparent', borderBottomColor:'transparent', borderRightColor:'#333',
  },
  sidebarTooltipText: { color:'#fff', fontSize:12, fontWeight:'600' },

  // ── Content area ──
  contentArea: { flex:1, flexDirection:'row' },

  // ── News column ──
  newsColumn: { width:270, borderRightWidth:1, borderRightColor:C.BORDER, backgroundColor:'#0E0E0E' },
  newsColumnHeader: {
    flexDirection:'row', justifyContent:'space-between', alignItems:'center',
    paddingHorizontal:16, paddingTop:20, paddingBottom:12,
    borderBottomWidth:1, borderBottomColor:C.BORDER,
  },
  newsColumnTitle: { color:C.TEXT, fontSize:15, fontWeight:'700' },
  newsRefresh:     { color:C.TEXT_MUTED, fontSize:18 },
  newsList:        { padding:12, gap:10 },
  newsCard: { backgroundColor:C.CARD, borderRadius:12, overflow:'hidden', borderWidth:1, borderColor:C.BORDER },
  newsImgArea:     { height:88, alignItems:'center', justifyContent:'center' },
  newsEmoji:       { fontSize:32 },
  newsCardBody:    { padding:10 },
  newsCardTitle:   { color:C.TEXT, fontSize:12, fontWeight:'600', lineHeight:18, marginBottom:6 },
  newsCardFooter:  { flexDirection:'row', justifyContent:'space-between' },
  newsSource:      { color:C.TEXT_MUTED, fontSize:10 },
  newsTime:        { color:C.TEXT_MUTED, fontSize:10 },

  // ── Main scroll ──
  mainScroll:  { flex:1 },
  mainContent: { padding:24, gap:16, paddingBottom:48, maxWidth:1200, width:'100%' as any, alignSelf:'center' as any },

  // ── Generic card ──
  card: { backgroundColor:C.CARD, borderRadius:16, padding:20, borderWidth:1, borderColor:C.BORDER },
  cardHeader:      { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 },
  cardTitleRow:    { flexDirection:'row', alignItems:'center', gap:6 },
  cardTitleIcon:   { color:C.ORANGE, fontSize:13, fontWeight:'700' },
  cardTitle:       { color:C.TEXT, fontSize:15, fontWeight:'700' },
  cardArrow:       { color:C.TEXT_MUTED, fontSize:14 },
  marketStatusRow: { flexDirection:'row', alignItems:'center', gap:6, marginTop:4 },
  marketDot:       { width:7, height:7, borderRadius:4, backgroundColor:C.GREEN_DOT },
  marketStatusText:{ color:C.TEXT_SUB, fontSize:12 },
  cardHeaderActions:{ flexDirection:'row', gap:8, alignItems:'center' },
  filterToggleBtn: { paddingHorizontal:12, paddingVertical:7, borderRadius:8, backgroundColor:C.INPUT, borderWidth:1, borderColor:C.BORDER_LIGHT },
  filterToggleBtnText: { color:C.TEXT_SUB, fontSize:12, fontWeight:'600' },
  addBtn:          { paddingHorizontal:14, paddingVertical:7, borderRadius:8, backgroundColor:C.ORANGE },
  addBtnText:      { color:'#fff', fontSize:12, fontWeight:'700' },

  // ── Filter panel ──
  filterPanel: { backgroundColor:C.CARD2, borderRadius:10, padding:12, marginBottom:16, gap:10 },
  filterInput: { backgroundColor:C.INPUT, borderRadius:8, paddingHorizontal:12, paddingVertical:9, color:C.TEXT, borderWidth:1, borderColor:C.BORDER_LIGHT, fontSize:13 },
  filterRow:   { flexDirection:'row', flexWrap:'wrap', gap:8 },
  filterTab:   { paddingHorizontal:12, paddingVertical:7, borderRadius:8, backgroundColor:C.INPUT, borderWidth:1, borderColor:C.BORDER_LIGHT },
  filterTabActive:     { backgroundColor:C.ORANGE_DIM, borderColor:C.ORANGE_BORDER },
  filterTabText:       { color:C.TEXT_SUB, fontSize:11, fontWeight:'600' },
  filterTabTextActive: { color:C.ORANGE },

  // ── Table ──
  tableSubtitle: { color:C.TEXT_MUTED, fontSize:12, marginBottom:12 },
  tableHeader:   { flexDirection:'row', paddingVertical:8, borderBottomWidth:1, borderBottomColor:C.BORDER, marginBottom:2 },
  th:            { color:C.TEXT_MUTED, fontSize:11, fontWeight:'600', letterSpacing:0.4 },
  tableRow:      { flexDirection:'row', alignItems:'center', paddingVertical:13, borderBottomWidth:1, borderBottomColor:'#1E1E1E' },
  rowTicker:     { color:C.TEXT, fontSize:14, fontWeight:'700' },
  rowName:       { color:C.TEXT_MUTED, fontSize:11, marginTop:2 },
  rowCell:       { color:C.TEXT, fontSize:13, fontWeight:'700' },
  rowCellMuted:  { color:C.TEXT_MUTED, fontSize:11 },
  varBadge:      { borderRadius:5, paddingVertical:3, paddingHorizontal:7, borderWidth:1, alignSelf:'center' },
  varPos:        { backgroundColor:C.GREEN_DIM, borderColor:C.GREEN_BORDER },
  varNeg:        { backgroundColor:C.RED_DIM, borderColor:C.RED_BORDER },
  varText:       { fontSize:11, fontWeight:'700' },
  rowActions:    { width:110, flexDirection:'row', justifyContent:'flex-end', gap:4 },
  rowActionBtn:  { padding:5 },
  rowActionIA:   { color:C.ORANGE, fontSize:11, fontWeight:'700' },
  rowActionIcon: { fontSize:13 },
  emptyTableBox: { paddingVertical:32, alignItems:'center', gap:16 },
  emptyTableText:{ color:C.TEXT_MUTED, fontSize:13, textAlign:'center', maxWidth:320 },
  emptyAddBtn:   { paddingHorizontal:20, paddingVertical:11, borderRadius:10, backgroundColor:C.ORANGE },
  emptyAddBtnText:{ color:'#fff', fontSize:13, fontWeight:'700' },

  // ── Bottom row ──
  bottomRow:       { flexDirection:'row', gap:16 },
  investCard:      { flex:3 },
  investirCard:    { flex:2 },
  investRow:       { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:10, borderBottomWidth:1, borderBottomColor:C.BORDER },
  investLabel:     { color:C.TEXT_SUB, fontSize:13 },
  investValue:     { color:C.TEXT, fontSize:14, fontWeight:'700' },
  investirSubtitle:{ color:C.TEXT_MUTED, fontSize:12, marginBottom:12, marginTop:-4 },
  investirItem:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:11, borderBottomWidth:1, borderBottomColor:C.BORDER },
  investirItemText:{ color:C.TEXT_SUB, fontSize:13, flex:1, paddingRight:8 },
  investirItemArrow:{ color:C.TEXT_MUTED, fontSize:18 },
  dollarRateLabel:  { color:C.TEXT_MUTED, fontSize:10, fontWeight:'600' as any },

  // ── Modals ──
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.78)', justifyContent:'flex-end' },
  aiModal: { backgroundColor:C.CARD, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, maxHeight:'78%', borderTopWidth:1, borderColor:C.BORDER_LIGHT },
  aiModalTitleRow: { flexDirection:'row', alignItems:'center', gap:8, marginBottom:20 },
  aiModalAccent:   { color:C.ORANGE, fontSize:18, fontWeight:'700' },
  aiModalTitle:    { color:C.TEXT, fontSize:17, fontWeight:'700' },
  aiLoadingBox:    { alignItems:'center', paddingVertical:40, gap:16 },
  aiLoadingPhrase: { color:C.TEXT_SUB, fontSize:13, fontStyle:'italic' },
  aiRecRow:        { flexDirection:'row', alignItems:'center', gap:10, marginBottom:16 },
  aiRecLabel:      { color:C.TEXT_SUB, fontSize:13 },
  aiRecBadge:      { borderRadius:6, paddingVertical:5, paddingHorizontal:14, borderWidth:1 },
  aiRecBuy:        { backgroundColor:C.GREEN_DIM, borderColor:C.GREEN_BORDER },
  aiRecSell:       { backgroundColor:C.RED_DIM, borderColor:C.RED_BORDER },
  aiRecHold:       { backgroundColor:C.YELLOW_DIM, borderColor:C.YELLOW_BORDER },
  aiRecText:       { fontSize:13, fontWeight:'700' },
  aiAnalysisBody:  { color:C.TEXT_SUB, fontSize:13, lineHeight:21, marginBottom:24 },
  aiCloseBtn:      { paddingVertical:15, borderRadius:12, backgroundColor:C.ORANGE, alignItems:'center' },
  aiCloseBtnText:  { color:'#fff', fontSize:15, fontWeight:'700' },

  // ── Form Modal ──
  formModal: { backgroundColor:C.CARD, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, minHeight:'90%', borderTopWidth:1, borderColor:C.BORDER_LIGHT },
  formTitle: { color:C.TEXT, fontSize:20, fontWeight:'800', marginBottom:20 },
  formLabel: { color:C.TEXT_SUB, fontSize:12, fontWeight:'600', marginBottom:6, marginTop:16 },
  formInput: { backgroundColor:C.INPUT, borderRadius:10, paddingHorizontal:14, paddingVertical:12, color:C.TEXT, borderWidth:1, borderColor:C.BORDER_LIGHT, fontSize:15 },
  formInputDisabled: { backgroundColor:'#1A1A1A', color:C.TEXT_MUTED, borderColor:C.BORDER },
  formInputFetching: { borderColor:C.ORANGE_BORDER, backgroundColor:'#1F1A14' },
  formInputFocused:  { borderColor:C.ORANGE, borderWidth:1.5 },
  formLabelRow:      { flexDirection:'row', alignItems:'baseline', gap:10, marginBottom:8, marginTop:16 },
  fetchingHint:      { color:C.ORANGE, fontSize:11, fontStyle:'italic' },

  // Preset badge
  presetBadge: {
    flexDirection:'row', alignItems:'center', gap:12,
    borderRadius:12, borderWidth:1, padding:14, marginBottom:8, marginTop:4,
  },
  presetBadgeIcon:  { fontSize:28 },
  presetBadgeTitle: { fontSize:14, fontWeight:'700' },
  presetBadgeLabel: { color:C.TEXT_MUTED, fontSize:11, marginTop:2 },

  dateRow:       { flexDirection:'row', gap:10, alignItems:'center' },
  dateInput:     { flex:1, backgroundColor:C.INPUT, borderRadius:10, borderWidth:1, borderColor:C.BORDER_LIGHT },
  dateInputText: { paddingHorizontal:14, paddingVertical:12, color:C.TEXT, fontSize:15 },
  todayBtn:      { paddingVertical:12, paddingHorizontal:16, borderRadius:10, backgroundColor:C.INPUT, borderWidth:1, borderColor:C.BORDER_LIGHT, alignItems:'center', justifyContent:'center' },
  todayBtnActive:     { backgroundColor:C.ORANGE, borderColor:C.ORANGE },
  todayBtnText:       { color:C.TEXT_SUB, fontSize:13, fontWeight:'700' },
  todayBtnTextActive: { color:'#fff' },

  calendarOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.75)', justifyContent:'center', alignItems:'center' },
  calendarBox:     { backgroundColor:C.CARD, borderRadius:20, padding:20, width:'90%', maxWidth:500, borderWidth:1, borderColor:C.BORDER_LIGHT },
  calendarBoxHeader:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16 },
  calendarBoxTitle: { color:C.TEXT, fontSize:17, fontWeight:'700' },
  calendarCloseX:   { color:C.TEXT_SUB, fontSize:22, fontWeight:'700' },
  calendarCloseBtn: { marginTop:16, paddingVertical:13, borderRadius:10, backgroundColor:C.ORANGE, alignItems:'center' },
  calendarCloseBtnText: { color:'#fff', fontSize:14, fontWeight:'700' },
  yearPickerRow:    { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:16, paddingHorizontal:8 },
  yearArrowBtn:     { padding:8 },
  yearArrowText:    { color:C.TEXT, fontSize:28, fontWeight:'700' },
  yearText:         { color:C.TEXT, fontSize:20, fontWeight:'700' },
  monthGrid:        { flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:4 },
  monthGridBtn:     { width:'30%', paddingVertical:12, borderRadius:10, backgroundColor:C.INPUT, borderWidth:1, borderColor:C.BORDER_LIGHT, alignItems:'center' },
  monthGridBtnActive:  { backgroundColor:C.ORANGE, borderColor:C.ORANGE },
  monthGridText:       { color:C.TEXT_SUB, fontSize:13, fontWeight:'600' },
  monthGridTextActive: { color:'#fff' },

  suggestBox:   { backgroundColor:C.INPUT, borderRadius:10, borderWidth:1, borderColor:C.ORANGE_BORDER, marginTop:4, overflow:'hidden' },
  suggestItem:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:11, paddingHorizontal:14, borderBottomWidth:1, borderBottomColor:C.BORDER },
  suggestSymbol:{ color:C.TEXT, fontSize:14, fontWeight:'700' },
  suggestName:  { color:C.TEXT_SUB, fontSize:11, marginTop:2 },
  suggestTag:   { color:C.ORANGE, fontSize:11, fontWeight:'600' },
  suggestCur:   { color:C.TEXT_MUTED, fontSize:10, marginTop:2 },

  toggleRow:          { flexDirection:'row', gap:10 },
  toggleBtn:          { flex:1, paddingVertical:11, borderRadius:10, backgroundColor:C.INPUT, borderWidth:1, borderColor:C.BORDER_LIGHT, alignItems:'center' },
  toggleBtnActive:    { backgroundColor:C.ORANGE, borderColor:C.ORANGE },
  toggleBtnText:      { color:C.TEXT_SUB, fontSize:13, fontWeight:'600' },
  toggleBtnTextActive:{ color:'#fff' },

  formBtnRow: { flexDirection:'row', gap:10, marginTop:28, marginBottom:16 },
  cancelBtn:  { flex:1, paddingVertical:15, borderRadius:12, backgroundColor:C.INPUT, borderWidth:1, borderColor:C.BORDER_LIGHT, alignItems:'center' },
  cancelBtnText:{ color:C.TEXT_SUB, fontSize:15, fontWeight:'600' },
  saveBtn:    { flex:2, paddingVertical:15, borderRadius:12, backgroundColor:C.ORANGE, alignItems:'center' },
  saveBtnText:{ color:'#fff', fontSize:15, fontWeight:'800' },

  // ══ Shared scroll shell (InvestirView + MinhaCarteiraView) ═══════════════
  ivScroll:      { flex:1, backgroundColor:C.BG },
  ivContent:     { padding:28, paddingBottom:60 },
  backCircleBtn: {
    width:44, height:44, borderRadius:22, backgroundColor:'#1E1E1E',
    borderWidth:1, borderColor:'#2E2E2E', alignItems:'center', justifyContent:'center',
    marginBottom:20, marginTop:8, alignSelf:'flex-start' as any,
  },
  backCircleBtnIcon: { color:C.ORANGE, fontSize:28, fontWeight:'700', lineHeight:30, marginTop:-2 },

  detailBackBtn: {
    position:'absolute' as any, top:16, left:16, zIndex:10,
    width:44, height:44, borderRadius:22, backgroundColor:'#1E1E1E',
    borderWidth:1, borderColor:'#2E2E2E', alignItems:'center', justifyContent:'center',
  },
  detailBackBtnIcon: { color:C.ORANGE, fontSize:28, fontWeight:'700', lineHeight:30, marginTop:-2 },

  // ── Table ─────────────────────────────────────────────────────────────────
  tableBodyScroll:   { maxHeight:380 },
  tableScrollContent:{ flexGrow:1 },
  tableMinWidth:     { minWidth:640, flex:1 },

  // Preset category switcher
  presetSwitchLabel: { color:C.TEXT_MUTED, fontSize:11, fontWeight:'600', marginTop:14, marginBottom:8 },
  presetSwitchRow:  { gap:8, paddingBottom:4 },
  presetSwitchTab:  { flexDirection:'row', alignItems:'center', gap:6,
    paddingHorizontal:12, paddingVertical:8, borderRadius:10,
    backgroundColor:C.INPUT, borderWidth:1, borderColor:C.BORDER_LIGHT },
  presetSwitchTabActive:  { backgroundColor:C.ORANGE_DIM, borderColor:C.ORANGE_BORDER },
  presetSwitchIcon: { fontSize:14 },
  presetSwitchText: { color:C.TEXT_MUTED, fontSize:12, fontWeight:'600' },
  presetSwitchTextActive: { color:C.ORANGE, fontWeight:'700' },

  // NoticiasView news card (full)
  newsCardFull:     { backgroundColor:C.CARD, borderRadius:14, overflow:'hidden',
    borderWidth:1, borderColor:C.BORDER, flexDirection:'row', alignItems:'stretch' },
  newsImgFull:      { width:80, alignItems:'center', justifyContent:'center' },
  newsEmojiFull:    { fontSize:28 },
  newsCardBodyFull: { flex:1, padding:14 },
  newsCardTitleFull:{ color:C.TEXT, fontSize:13, fontWeight:'600', lineHeight:20, marginBottom:8 },

  // ══ Vitrine (InvestirView) ════════════════════════════════════════════════
  vtContent: { paddingBottom:60 },

  // Banner
  vtBanner: {
    flexDirection:'row', alignItems:'center', justifyContent:'space-between',
    backgroundColor:C.CARD, marginHorizontal:28, borderRadius:18,
    padding:32, borderWidth:1, borderColor:C.BORDER,
    borderLeftWidth:4, borderLeftColor:C.ORANGE,
    marginBottom:36,
  },
  vtBannerLeft:    { flex:1, paddingRight:16 },
  vtBannerTag:     { color:C.ORANGE, fontSize:10, fontWeight:'800', letterSpacing:1.4, marginBottom:10, textTransform:'uppercase' as any },
  vtBannerTitle:   { color:C.TEXT, fontSize:20, fontWeight:'800', lineHeight:28, marginBottom:10 },
  vtBannerSub:     { color:C.TEXT_SUB, fontSize:13, lineHeight:20, marginBottom:22 },
  vtBannerBtn:     { alignSelf:'flex-start', paddingHorizontal:20, paddingVertical:12, borderRadius:10, backgroundColor:C.ORANGE },
  vtBannerBtnText: { color:'#fff', fontSize:13, fontWeight:'800' },
  vtBannerEmoji:   { fontSize:52 },

  // Section headings (padded)
  vtSectionHead:  { paddingHorizontal:28, marginBottom:16 },
  vtSectionTitle: { color:C.TEXT, fontSize:18, fontWeight:'800', marginBottom:4 },
  vtSectionSub:   { color:C.TEXT_MUTED, fontSize:13 },

  // Rail
  vtRail:        { marginBottom:8 },
  vtRailContent: { paddingLeft:28, paddingRight:28, gap:14, flexDirection:'row' as any, flexGrow:1 },

  // Category card — wide rectangle
  vtCatCard: {
    flex:1, minWidth:200, backgroundColor:C.CARD, borderRadius:14,
    padding:18, borderWidth:1, borderColor:'#333', gap:6,
  },
  vtCatIcon:     { fontSize:30, marginBottom:4 },
  vtCatTitle:    { fontSize:15, fontWeight:'800' },
  vtCatExchange: { color:C.TEXT_MUTED, fontSize:11, fontWeight:'600' },
  vtCatDesc:     { color:C.TEXT_SUB, fontSize:12, lineHeight:18, marginTop:4 },
  vtCatFooter:   { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:10 },
  vtCatCount:    { color:C.TEXT_MUTED, fontSize:11 },
  vtCatArrow:    { fontSize:20, fontWeight:'600' },

  // Top-asset card
  vtAssetCard: {
    flex:1, minWidth:168, backgroundColor:C.CARD, borderRadius:14,
    padding:16, borderWidth:1, borderColor:C.BORDER,
  },
  vtAssetCardHead:   { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 },
  vtAssetBadge:      { borderRadius:5, paddingHorizontal:8, paddingVertical:3 },
  vtAssetBadgeText:  { fontSize:10, fontWeight:'700' },
  vtAssetChange:     { fontSize:12, fontWeight:'700' },
  vtAssetTicker:     { color:C.TEXT, fontSize:18, fontWeight:'800' },
  vtAssetSector:     { color:C.TEXT_MUTED, fontSize:10, marginTop:2 },
  vtAssetName:       { color:C.TEXT_SUB, fontSize:11, marginTop:2, marginBottom:10 },
  vtAssetPriceLine:  { flexDirection:'row', justifyContent:'space-between', alignItems:'baseline' },
  vtAssetPriceLabel: { color:C.TEXT_MUTED, fontSize:10 },
  vtAssetPrice:      { color:C.TEXT, fontSize:12, fontWeight:'700' },

  // Footer custom button
  vtFooter:     { paddingHorizontal:28, paddingTop:32, alignItems:'center' },
  vtCustomBtn:  { paddingHorizontal:28, paddingVertical:14, borderRadius:12, borderWidth:1, borderColor:C.BORDER_LIGHT, backgroundColor:C.CARD },
  vtCustomBtnText: { color:C.TEXT_SUB, fontSize:14, fontWeight:'600' },

  // ══ MinhaCarteiraView styles ══════════════════════════════════════════════
  cwHeader:      { marginBottom:24 },
  cwTitle:       { color:C.TEXT, fontSize:24, fontWeight:'800' },
  cwSubtitle:    { color:C.TEXT_MUTED, fontSize:14, marginTop:4 },

  cwMetricsRow:  { flexDirection:'row', flexWrap:'wrap' as any, gap:12, marginBottom:20 },
  cwMetricCard: {
    flex:1, minWidth:150, backgroundColor:C.CARD, borderRadius:14,
    padding:16, borderWidth:1, borderColor:C.BORDER,
  },
  cwMetricLabel: { color:C.TEXT_MUTED, fontSize:11, marginBottom:6 },
  cwMetricValue: { fontSize:16, fontWeight:'700' },

  cwChartCard: {
    backgroundColor:C.CARD, borderRadius:16, padding:20,
    borderWidth:1, borderColor:C.BORDER, marginBottom:16,
  },
  cwChartTopRow:      { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16 },
  cwModeToggle:       { flexDirection:'row', backgroundColor:C.INPUT, borderRadius:8, padding:3, gap:2 },
  cwModeBtn:          { paddingHorizontal:10, paddingVertical:6, borderRadius:6 },
  cwModeBtnActive:    { backgroundColor:C.ORANGE },
  cwModeBtnText:      { color:C.TEXT_MUTED, fontSize:11, fontWeight:'600' },
  cwModeBtnTextActive:{ color:'#fff' },

  cwBigValRow:   { flexDirection:'row', alignItems:'baseline', gap:8, marginBottom:16 },
  cwBigValNum:   { fontSize:32, fontWeight:'800' },
  cwBigValPeriod:{ color:C.TEXT_MUTED, fontSize:14 },

  cwChartEmpty:  { justifyContent:'center', alignItems:'center' },
  cwEmptyText:   { color:C.TEXT_MUTED, fontSize:13, textAlign:'center' },

  cwPeriodRow:          { flexDirection:'row', gap:6 },
  cwPeriodTab:          { paddingHorizontal:14, paddingVertical:6, borderRadius:20,
    backgroundColor:C.INPUT, borderWidth:1, borderColor:C.BORDER_LIGHT },
  cwPeriodTabActive:    { backgroundColor:C.ORANGE_DIM, borderColor:C.ORANGE_BORDER },
  cwPeriodTabText:      { color:C.TEXT_MUTED, fontSize:12, fontWeight:'600' },
  cwPeriodTabTextActive:{ color:C.ORANGE, fontWeight:'700' },

  cwBreakCard:   { backgroundColor:C.CARD, borderRadius:16, padding:20, borderWidth:1, borderColor:C.BORDER },
  cwBreakTitle:  { color:C.TEXT, fontSize:15, fontWeight:'700', marginBottom:16 },
  cwBreakRow:    { flexDirection:'row', alignItems:'center', gap:12, paddingVertical:11, borderBottomWidth:1, borderBottomColor:C.BORDER },
  cwBreakLeft:   { width:84 },
  cwBreakSymbol: { color:C.TEXT, fontSize:13, fontWeight:'700' },
  cwBreakName:   { color:C.TEXT_MUTED, fontSize:11, marginTop:2 },
  cwBreakBarWrap:{ flex:1, height:4, backgroundColor:C.BORDER, borderRadius:2, overflow:'hidden' },
  cwBreakBarFill:{ height:'100%' as any, backgroundColor:C.ORANGE, borderRadius:2 },
  cwBreakRight:  { width:100, alignItems:'flex-end' },
  cwBreakValue:  { color:C.TEXT, fontSize:12, fontWeight:'600' },
  cwBreakPnl:    { fontSize:11, marginTop:2 },

  // ── Hub IA: entry cards ───────────────────────────────────────────────────
  iaHubGrid: { gap:14 },
  iaHubCard: {
    borderRadius:20, padding:22, borderWidth:1, borderColor:C.BORDER,
    minHeight:180, justifyContent:'space-between',
  },
  iaHubCardPortfolio: { backgroundColor:'#161B26', borderColor:'rgba(96,165,250,0.25)' },
  iaHubCardOpp:       { backgroundColor:'#1A1208', borderColor:C.ORANGE_BORDER },
  iaHubCardTop:       { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  iaHubCardIcon:      { fontSize:28 },
  iaHubCardBadge: {
    paddingHorizontal:10, paddingVertical:4, borderRadius:8,
    backgroundColor:C.BLUE_DIM, borderWidth:1, borderColor:C.BLUE_BORDER,
  },
  iaHubCardBadgeText: { color:C.BLUE, fontSize:11, fontWeight:'700' },
  iaHubCardTitle:     { color:C.TEXT, fontSize:20, fontWeight:'800', marginBottom:2 },
  iaHubCardSub:       { color:C.TEXT_MUTED, fontSize:13, marginBottom:10 },
  iaHubCardEmpty:     { color:C.TEXT_MUTED, fontSize:12, fontStyle:'italic', marginBottom:10 },
  iaHubVerdictRow:    { flexDirection:'row', gap:10, flexWrap:'wrap' as any, marginBottom:10 },
  iaHubVerdictChip:   { fontSize:12, fontWeight:'700' },
  iaHubOppTicker:     { fontSize:11, fontWeight:'700', color:C.ORANGE, backgroundColor:C.ORANGE_DIM, paddingHorizontal:7, paddingVertical:3, borderRadius:5, borderWidth:1, borderColor:C.ORANGE_BORDER },
  iaHubCardArrow:     { alignItems:'flex-end' as any },
  iaHubCardArrowText: { color:C.TEXT_MUTED, fontSize:13, fontWeight:'600' },

  // ── Hub IA: asset list ────────────────────────────────────────────────────
  iaListCard: {
    backgroundColor:C.CARD, borderRadius:16, borderWidth:1, borderColor:C.BORDER, overflow:'hidden' as any,
  },
  iaListRow: {
    flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:14,
    gap:10, borderBottomWidth:1, borderBottomColor:C.BORDER,
  },
  iaListLeft:        { flex:1, minWidth:0 },
  iaListTicker:      { color:C.TEXT, fontSize:14, fontWeight:'800' },
  iaListName:        { color:C.TEXT_MUTED, fontSize:10, marginTop:1 },
  iaListMid:         { alignItems:'flex-end' as any, gap:2 },
  iaListPrice:       { color:C.TEXT, fontSize:13, fontWeight:'700' },
  iaListChange:      { fontSize:11, fontWeight:'700' },
  iaListVerdict:     { borderRadius:6, borderWidth:1, paddingHorizontal:10, paddingVertical:4 },
  iaListVerdictText: { fontSize:11, fontWeight:'800', letterSpacing:0.5 },
  iaListArrow:       { color:C.TEXT_MUTED, fontSize:20, marginLeft:4 },

  // ── Asset Detail Modal ────────────────────────────────────────────────────
  detailModal: {
    backgroundColor:C.BG, borderTopLeftRadius:24, borderTopRightRadius:24,
    maxHeight:'92%' as any, borderTopWidth:1, borderColor:C.BORDER_LIGHT,
  },
  detailHeader: {
    flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start',
    padding:20, paddingBottom:14, borderBottomWidth:1, borderBottomColor:C.BORDER,
  },
  detailTicker:      { color:C.TEXT, fontSize:22, fontWeight:'900' },
  detailName:        { color:C.TEXT_SUB, fontSize:13, marginTop:3 },
  detailSector:      { color:C.TEXT_MUTED, fontSize:11, marginTop:2 },
  detailPrice:       { color:C.ORANGE, fontSize:17, fontWeight:'800' },
  detailChangeBadge: { borderRadius:6, borderWidth:1, paddingHorizontal:8, paddingVertical:3 },
  detailChangeText:  { fontSize:12, fontWeight:'700' },
  detailCloseX:      { color:C.TEXT_MUTED, fontSize:22, fontWeight:'700', marginTop:2 },

  detailNewsStrip: {
    flexDirection:'row', alignItems:'center', gap:8,
    paddingHorizontal:16, paddingVertical:10,
    backgroundColor:'#0E1318', borderBottomWidth:1, borderBottomColor:C.BORDER,
  },
  detailNewsIcon: { fontSize:14 },
  detailNewsText: { color:C.TEXT_SUB, fontSize:12, lineHeight:18 },

  detailChartToolbar: {
    flexDirection:'row', justifyContent:'space-between', alignItems:'center',
    paddingHorizontal:16, paddingVertical:10,
  },
  detailChartToolbarTitle: { color:C.TEXT_MUTED, fontSize:11, fontWeight:'600' },

  detailChartArea: {
    backgroundColor:'#0D1117', overflow:'hidden' as any,
    paddingVertical:6, marginBottom:4,
  },

  detailAIPanel: {
    margin:12, marginTop:8, backgroundColor:'#161616', borderRadius:14,
    padding:16, borderWidth:1, borderColor:C.BORDER,
  },
  detailAIPanelHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 },
  detailAIPanelTitle:  { color:C.ORANGE, fontSize:12, fontWeight:'800', letterSpacing:0.5 },
  detailVerdictBadge:  { borderRadius:6, borderWidth:1, paddingHorizontal:10, paddingVertical:4 },
  detailVerdictText:   { fontSize:11, fontWeight:'800', letterSpacing:0.5 },
  detailAIText:        { color:C.TEXT_SUB, fontSize:13, lineHeight:20 },

  // ── Settings Modal ────────────────────────────────────────────────────────
  settingsModal: {
    backgroundColor:C.CARD, borderTopLeftRadius:24, borderTopRightRadius:24,
    paddingBottom:32, borderTopWidth:1, borderColor:C.BORDER_LIGHT,
  },
  settingsHeader: {
    flexDirection:'row', justifyContent:'space-between', alignItems:'center',
    padding:20, paddingBottom:14, borderBottomWidth:1, borderBottomColor:C.BORDER,
  },
  settingsTitle:    { color:C.TEXT, fontSize:17, fontWeight:'800' },
  settingsCloseX:   { color:C.TEXT_MUTED, fontSize:22, fontWeight:'700' },
  settingsRow: {
    flexDirection:'row', alignItems:'center', gap:12,
    paddingHorizontal:20, paddingVertical:16,
    borderBottomWidth:1, borderBottomColor:C.BORDER,
  },
  settingsRowIcon:  { fontSize:18, width:24, textAlign:'center' as any },
  settingsRowLabel: { color:C.TEXT, fontSize:14, fontWeight:'600', flex:1 },
  settingsRowValue: { color:C.TEXT_MUTED, fontSize:12 },
});
