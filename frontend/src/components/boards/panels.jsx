import {
  AllocationBoardPanel,
  ChartBoardPanel,
  EarningsPanel,
  FundsPanel,
  HeatmapPanel,
  NetWorthPanel,
  NewsPanel,
  PerformancePanel,
  PositionsBoardPanel,
  ShelfPanel,
  SymbolStatsPanel,
  WatchlistPanel,
} from './PanelBodies'

export const PANELS = {
  watchlist: WatchlistPanel,
  chart: ChartBoardPanel,
  heatmap: HeatmapPanel,
  earnings: EarningsPanel,
  news: NewsPanel,
  symbol: SymbolStatsPanel,
  positions: PositionsBoardPanel,
  allocation: AllocationBoardPanel,
  shelf: ShelfPanel,
  funds: FundsPanel,
  performance: PerformancePanel,
  networth: NetWorthPanel,
}
