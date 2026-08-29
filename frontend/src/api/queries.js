import { useQuery } from '@tanstack/react-query'

import {
  getBankAccounts,
  getCashFlow,
  getNetWorth,
  getNetWorthHistory,
  getPortfolioSummary,
  getPositions,
  getSaxoStatus,
  getTransactions,
} from './client'

// DRF paginates some list endpoints and not others, so callers used to write
// `res.results ?? res` at every site. Centralised here instead.
const unwrap = (res) => res?.results ?? res

export const queryKeys = {
  positions: ['positions'],
  portfolioSummary: ['portfolio-summary'],
  transactions: (query = '') => ['transactions', query],
  bankAccounts: ['bank-accounts'],
  netWorth: ['net-worth'],
  netWorthHistory: (range = 'ALL') => ['net-worth-history', range],
  cashFlow: ['cash-flow'],
  saxoStatus: ['saxo-status'],
}

export function usePositions() {
  return useQuery({ queryKey: queryKeys.positions, queryFn: getPositions, select: unwrap })
}

export function usePortfolioSummary() {
  return useQuery({ queryKey: queryKeys.portfolioSummary, queryFn: getPortfolioSummary })
}

export function useTransactions(query = '') {
  return useQuery({
    queryKey: queryKeys.transactions(query),
    queryFn: () => getTransactions(query),
    select: unwrap,
  })
}

export function useBankAccounts() {
  return useQuery({ queryKey: queryKeys.bankAccounts, queryFn: getBankAccounts, select: unwrap })
}

export function useNetWorth() {
  return useQuery({ queryKey: queryKeys.netWorth, queryFn: getNetWorth })
}

// NetWorthChart, PortfolioValueChart and BankBalanceChart all render from this
// endpoint. Sharing one query key per range means three components mounting
// together fire one request, not three.
export function useNetWorthHistory(range = 'ALL') {
  return useQuery({
    queryKey: queryKeys.netWorthHistory(range),
    queryFn: () => getNetWorthHistory(range),
    select: unwrap,
  })
}

export function useCashFlow() {
  return useQuery({ queryKey: queryKeys.cashFlow, queryFn: getCashFlow, select: unwrap })
}

export function useSaxoStatus() {
  return useQuery({ queryKey: queryKeys.saxoStatus, queryFn: getSaxoStatus })
}
