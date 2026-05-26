import React, { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  LineSeries,
  IChartApi,
} from 'lightweight-charts';

export interface OHLCCandle {
  date: string; // 'YYYY-MM-DD'
  o: number; h: number; l: number; c: number; v: number;
}

interface SMAConfig { period: number; color: string; }

function calcSMAValues(candles: OHLCCandle[], period: number): { time: string; value: number }[] {
  const out: { time: string; value: number }[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const sum = candles.slice(i - period + 1, i + 1).reduce((a, c) => a + (c.o + c.c) / 2, 0);
    out.push({ time: candles[i].date, value: sum / period });
  }
  return out;
}

type Props = {
  data: OHLCCandle[];
  width: number;
  height: number;
  smas?: SMAConfig[];
};

export default function TradingViewChart({ data, width, height, smas = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || !data.length) return;

    const chart = createChart(containerRef.current, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#0D1117' },
        textColor:  '#A0A0A0',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)', style: LineStyle.Solid },
        horzLines: { color: 'rgba(255,255,255,0.05)', style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color:                'rgba(255,255,255,0.18)',
          style:                LineStyle.Dashed,
          width:                1,
          labelBackgroundColor: '#1C1C1C',
        },
        horzLine: {
          color:                'rgba(255,255,255,0.18)',
          style:                LineStyle.Dashed,
          width:                1,
          labelBackgroundColor: '#1C1C1C',
        },
      },
      rightPriceScale: {
        borderColor: '#282828',
      },
      timeScale: {
        borderColor:    '#282828',
        timeVisible:    true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:         '#26a69a',
      downColor:       '#ef5350',
      borderUpColor:   '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor:     '#26a69a',
      wickDownColor:   '#ef5350',
    });

    candleSeries.setData(data.map(c => ({
      time:  c.date as any,
      open:  c.o,
      high:  c.h,
      low:   c.l,
      close: c.c,
    })));

    for (const cfg of smas) {
      const line = chart.addSeries(LineSeries, {
        color:                   cfg.color,
        lineWidth:               1,
        priceLineVisible:        false,
        lastValueVisible:        false,
        crosshairMarkerVisible:  false,
      });
      line.setData(calcSMAValues(data, cfg.period).map(d => ({ time: d.time as any, value: d.value })));
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [data]);

  useEffect(() => {
    chartRef.current?.resize(width, height);
  }, [width, height]);

  return (
    <div
      ref={containerRef}
      style={{ width, height, overflow: 'hidden', backgroundColor: '#0D1117' }}
    />
  );
}
