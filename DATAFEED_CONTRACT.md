# IC3 Datafeed Contract

## /api/ohlc Response Shape
```
GET /api/ohlc?symbol={symbol}&tf={timeframe}&from={unixSec}&to={unixSec}

Response:
{
  symbol: string,          // "ESM23"
  timeframe: string,       // "5m"
  bars: [
    {
      time: number,        // UTC Unix seconds (integer) — e.g. 1686700800
      open: number,        // float — e.g. 4425.50
      high: number,
      low: number,
      close: number,
      volume: number       // integer
    }
  ],
  roll_markers?: [         // optional, present when range crosses a roll
    { date: string, label: string }
  ]
}
```

## KLineChart Pro Datafeed Interface
The datafeed adapter must implement:

```
searchSymbols(search?: string): Promise<SymbolInfo[]>

getHistoryKLineData(
  symbol: SymbolInfo,      // { ticker: "ESM23", ... }
  period: Period,          // { multiplier: 5, timespan: 'minute', text: '5m' }
  from: number,            // Unix milliseconds
  to: number               // Unix milliseconds
): Promise<KLineData[]>

subscribe(symbol: SymbolInfo, period: Period, callback): void
unsubscribe(symbol: SymbolInfo, period: Period): void
```

## KLineData Shape (klinecharts v9)
```
{
  timestamp: number,  // Unix MILLISECONDS
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  turnover?: number
}
```

## Critical Translation
- /api/ohlc returns `time` in Unix **SECONDS**
- KLineChart expects `timestamp` in Unix **MILLISECONDS**
- The datafeed adapter MUST multiply time by 1000
- KLineChart Pro passes `from`/`to` in **MILLISECONDS** — divide by 1000 for API calls
