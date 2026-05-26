import React, { useState, useRef } from 'react';
import { View, Text, Platform, PanResponder, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';

export interface OHLCCandle {
  date: string; // 'YYYY-MM-DD'
  o: number; h: number; l: number; c: number; v: number;
}

interface SMAConfig { period: number; color: string; }

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function calcSMA(candles: OHLCCandle[], period: number): (number | null)[] {
  return candles.map((_, i) => {
    if (i < period - 1) return null;
    const sl = candles.slice(i - period + 1, i + 1);
    return sl.reduce((acc, c) => acc + (c.o + c.c) / 2, 0) / period;
  });
}

function fmtPrice(p: number): string {
  if (p >= 1_000_000) return `${(p / 1_000_000).toFixed(2)}M`;
  if (p >= 1_000)     return `${(p / 1_000).toFixed(1)}k`;
  if (p >= 100)       return p.toFixed(0);
  if (p >= 10)        return p.toFixed(2);
  return p.toFixed(4);
}

function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[(m - 1) % 12]}`;
}

type Props = {
  data: OHLCCandle[];
  width: number;
  height: number;
  smas?: SMAConfig[];
};

export default function TradingViewChart({ data, width, height, smas = [] }: Props) {
  const [crossIdx, setCrossIdx] = useState<number | null>(null);
  const moveRef  = useRef<(x: number) => void>(() => {});
  const clearRef = useRef<() => void>(() => {});
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant:   e => moveRef.current(e.nativeEvent.locationX),
    onPanResponderMove:    e => moveRef.current(e.nativeEvent.locationX),
    onPanResponderRelease: () => clearRef.current(),
  })).current;

  const n      = data.length;
  const VOL_H  = 52;
  const XAXIS  = 24;
  const YAXIS  = 62;
  const dataW  = width - YAXIS;
  const cW     = n > 0 ? dataW / n : 1;
  const bW     = Math.max(cW * 0.54, 1.5);
  const totalH = height + VOL_H + XAXIS;

  moveRef.current  = (x) => { if (n > 0) setCrossIdx(Math.min(Math.max(0, Math.floor(x / cW)), n - 1)); };
  clearRef.current = () => setCrossIdx(null);

  if (!n) return null;

  const maxP = Math.max(...data.map(c => c.h)) * 1.008;
  const minP = Math.min(...data.map(c => c.l)) * 0.992;
  const rng  = maxP - minP || 1;
  const maxV = Math.max(...data.map(c => c.v), 0.01);
  const toY  = (v: number) => ((maxP - v) / rng) * height;

  const priceGrid = [0, 0.25, 0.5, 0.75, 1].map((f, idx) => ({
    idx, y: f * height, price: maxP - f * rng,
  }));

  const xStep = Math.max(1, Math.ceil(n / 6));
  const xLbls = data.map((d, i) => ({ i, d })).filter(({ i }) => i % xStep === 0);

  function buildSmaPath(period: number): string {
    let d = '';
    calcSMA(data, period).forEach((v, i) => {
      if (v == null) return;
      const x = (i + 0.5) * cW, y = toY(v);
      d += d ? ` L ${x.toFixed(1)},${y.toFixed(1)}` : `M ${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return d;
  }

  const crossX      = crossIdx != null ? (crossIdx + 0.5) * cW : null;
  const crossCandle = crossIdx != null ? data[crossIdx] : null;
  const webHandlers = Platform.OS === 'web' ? {
    onMouseMove:  (e: any) => moveRef.current(e.nativeEvent?.offsetX ?? e.nativeEvent?.locationX ?? 0),
    onMouseLeave: () => clearRef.current(),
  } : {};

  return (
    <View style={{ position: 'relative', width, backgroundColor: '#0D1117' }}>
      <Svg width={width} height={totalH}
        {...(Platform.OS !== 'web' ? panResponder.panHandlers : {})}
        {...webHandlers}
      >
        <Rect x={0} y={0} width={dataW} height={height + VOL_H} fill="#0D1117" />
        <Rect x={dataW} y={0} width={YAXIS} height={height + VOL_H} fill="#0A0F16" />

        {priceGrid.map(({ idx, y, price }) => (
          <React.Fragment key={idx}>
            <Path d={`M 0,${y.toFixed(1)} H ${dataW}`} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
            <SvgText x={dataW + 5} y={y + 4} fill="#525252" fontSize={9} fontWeight="500">
              {fmtPrice(price)}
            </SvgText>
          </React.Fragment>
        ))}

        <Path d={`M 0,${height} H ${dataW}`} stroke="#1A2332" strokeWidth={1} />

        {data.map((c, i) => {
          const vH = Math.max((c.v / maxV) * VOL_H, 1);
          const x  = i * cW + (cW - bW) / 2;
          const y  = height + VOL_H - vH;
          return <Rect key={`v${i}`} x={x.toFixed(1)} y={y.toFixed(1)} width={bW.toFixed(1)} height={vH.toFixed(1)}
            fill={c.c >= c.o ? 'rgba(74,222,128,0.22)' : 'rgba(248,113,113,0.20)'} />;
        })}

        {data.map((c, i) => (
          <Path key={`w${i}`}
            d={`M ${((i + 0.5) * cW).toFixed(1)},${toY(c.h).toFixed(1)} V ${toY(c.l).toFixed(1)}`}
            stroke={c.c >= c.o ? '#26a69a' : '#ef5350'} strokeWidth={1.2} />
        ))}

        {data.map((c, i) => {
          const isG  = c.c >= c.o;
          const bTop = toY(Math.max(c.o, c.c));
          const bH   = Math.max(toY(Math.min(c.o, c.c)) - bTop, 1.5);
          const x    = i * cW + (cW - bW) / 2;
          return <Rect key={`b${i}`} x={x.toFixed(1)} y={bTop.toFixed(1)}
            width={bW.toFixed(1)} height={bH.toFixed(1)}
            fill={isG ? '#26a69a' : '#ef5350'}
            stroke={isG ? '#26a69a' : '#ef5350'} strokeWidth={1} />;
        })}

        {smas.map(cfg => {
          const d = buildSmaPath(cfg.period);
          return d ? <Path key={cfg.color} d={d} fill="none" stroke={cfg.color}
            strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /> : null;
        })}

        {crossX != null && <>
          <Path d={`M ${crossX.toFixed(1)},0 V ${height + VOL_H}`}
            stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="3 3" />
          {crossCandle && <Path d={`M 0,${toY(crossCandle.c).toFixed(1)} H ${dataW}`}
            stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="3 3" />}
        </>}

        {xLbls.map(({ i, d }) => (
          <SvgText key={`xl${i}`} x={Math.min((i + 0.5) * cW, dataW - 20)}
            y={height + VOL_H + 16} fill="#525252" fontSize={9} textAnchor="middle">
            {fmtDate(d.date)}
          </SvgText>
        ))}
      </Svg>

      {crossCandle != null && crossX != null && (
        <View style={[st.tooltip, { top: 8, left: crossX > dataW / 2 ? 8 : dataW - 156 }]}>
          <Text style={st.tipDate}>{fmtDate(crossCandle.date)}</Text>
          <View style={st.tipRow}>
            <Text style={st.tipKey}>O</Text><Text style={st.tipVal}>{fmtPrice(crossCandle.o)}</Text>
            <Text style={st.tipKey}>H</Text><Text style={[st.tipVal, { color: '#4ade80' }]}>{fmtPrice(crossCandle.h)}</Text>
          </View>
          <View style={st.tipRow}>
            <Text style={st.tipKey}>L</Text><Text style={[st.tipVal, { color: '#f87171' }]}>{fmtPrice(crossCandle.l)}</Text>
            <Text style={st.tipKey}>C</Text>
            <Text style={[st.tipVal, { color: crossCandle.c >= crossCandle.o ? '#4ade80' : '#f87171' }]}>
              {fmtPrice(crossCandle.c)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  tooltip: { position: 'absolute', backgroundColor: 'rgba(14,18,28,0.94)',
             borderRadius: 8, borderWidth: 1, borderColor: '#2A3545', padding: 8, minWidth: 150, zIndex: 10 },
  tipDate: { color: '#A0A0A0', fontSize: 10, fontWeight: '600', marginBottom: 4 },
  tipRow:  { flexDirection: 'row', gap: 4, alignItems: 'center', marginBottom: 2 },
  tipKey:  { color: '#525252', fontSize: 10, fontWeight: '700', width: 14 },
  tipVal:  { color: '#F2F2F2', fontSize: 11, fontWeight: '700', flex: 1 },
});
