import { describe, expect, it } from 'vitest'
import { toCsv, TRANSACTION_COLUMNS } from './csv'

const tx = (overrides) => ({
  date: '2026-08-01', type: 'BUY', instrument: 'NVIDIA', ticker: 'NVDA',
  qty: 10, price: 150, total: 1500, account: 'Saxo', ...overrides,
})

describe('toCsv', () => {
  it('writes a header row followed by one line per row', () => {
    const csv = toCsv(TRANSACTION_COLUMNS, [tx()])
    const [header, line] = csv.split('\n')

    expect(header).toBe('Date,Type,Instrument,Ticker,Qty,Price,Total,Account')
    expect(line).toBe('2026-08-01,BUY,NVIDIA,NVDA,10,150,1500,Saxo')
  })

  it('quotes cells containing a comma so columns do not shift', () => {
    const csv = toCsv(TRANSACTION_COLUMNS, [tx({ instrument: 'Alphabet Inc, Class A' })])
    const line = csv.split('\n')[1]

    expect(line).toContain('"Alphabet Inc, Class A"')
    expect(line.split(',')).toHaveLength(9)
  })

  it('doubles embedded quotes', () => {
    const csv = toCsv(TRANSACTION_COLUMNS, [tx({ instrument: 'The "Big" One' })])

    expect(csv.split('\n')[1]).toContain('"The ""Big"" One"')
  })

  it('quotes cells containing a newline', () => {
    const csv = toCsv(TRANSACTION_COLUMNS, [tx({ instrument: 'Line1\nLine2' })])

    expect(csv).toContain('"Line1\nLine2"')
  })

  it('renders null and undefined as empty cells', () => {
    const csv = toCsv(TRANSACTION_COLUMNS, [tx({ ticker: null, account: undefined })])

    expect(csv.split('\n')[1]).toBe('2026-08-01,BUY,NVIDIA,,10,150,1500,')
  })
})
