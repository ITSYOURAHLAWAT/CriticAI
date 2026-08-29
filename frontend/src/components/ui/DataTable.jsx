import React, { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export function DataTable({ columns, data, expandable = false, onExpand, emptyMessage = 'No data' }) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [expanded, setExpanded] = useState(null)

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = [...(data || [])].sort((a, b) => {
    if (!sortKey) return 0
    const av = a[sortKey], bv = b[sortKey]
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
              {columns.map(col => (
            <th
              key={col.key}
              className={`px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap select-none ${col.sortable ? 'cursor-pointer hover:text-white' : ''} text-slate-500`}
              onClick={() => col.sortable && toggleSort(col.key)}
            >
              <span className="flex items-center gap-1">
                {col.label}
                {col.sortable && sortKey === col.key && (
                  sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
                )}
              </span>
            </th>
          ))}
            </tr>
          </thead>
          <tbody style={{ background: 'var(--bg-surface)' }}>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : sorted.map((row, i) => (
              <React.Fragment key={row.id || i}>
                <tr
                  className="group hover:bg-white/[0.03] transition-colors cursor-pointer"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  onClick={() => expandable && setExpanded(expanded === i ? null : i)}
                >
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3">
                      {col.render ? col.render(row[col.key], row) : (
                        <span className="text-slate-300">{row[col.key]}</span>
                      )}
                    </td>
                  ))}
                </tr>
                {expandable && expanded === i && (
                  <tr style={{ background: 'var(--bg-elevated)' }}>
                    <td colSpan={columns.length} className="px-4 py-3">
                      {onExpand?.(row)}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
