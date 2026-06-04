'use client'

import { useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface ReconciliationRun {
  id: string
  periodStart: string
  periodEnd: string
  matchedCount: number
  unmatchedCount: number
  differenceCents: number
  status: 'pending' | 'running' | 'complete' | 'failed'
  createdAt: string
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function isThisMonth(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

const badgeClass: Record<ReconciliationRun['status'], string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  running: 'bg-blue-100 text-blue-800',
  complete: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

export function ReconciliationDashboard() {
  const [runs, setRuns] = useState<ReconciliationRun[]>([])

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/reconcile')
      const data = await res.json()
      setRuns(data.runs ?? [])
    } catch {
      // silent — stale data is better than a crash
    }
  }, [])

  useEffect(() => {
    // Fetch immediately on mount so the table is not blank for 3 seconds
    fetchRuns()
    const intervalId = setInterval(fetchRuns, 3000)
    // Clear interval on unmount to prevent memory leak and stale state updates
    return () => clearInterval(intervalId)
  }, [fetchRuns])

  const runsThisMonth = runs.filter(r => isThisMonth(r.createdAt))
  const totalDiscrepancyCents = runs.reduce((sum, r) => sum + r.differenceCents, 0)

  return (
    <div className="p-6 space-y-6">
      {/* Summary card */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">Runs this month</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{runsThisMonth.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">Total discrepancy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCents(totalDiscrepancyCents)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div title="Upload a bank data file to trigger a new reconciliation run">
              <button
                disabled
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium opacity-50 cursor-not-allowed"
              >
                Trigger New Reconciliation
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Runs table */}
      <Card>
        <CardHeader>
          <CardTitle>Reconciliation Runs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Matched</TableHead>
                <TableHead>Unmatched</TableHead>
                <TableHead>Discrepancy</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map(run => (
                <TableRow key={run.id}>
                  <TableCell>
                    {new Date(run.periodStart).toLocaleDateString()} – {new Date(run.periodEnd).toLocaleDateString()}
                  </TableCell>
                  <TableCell>{run.matchedCount}</TableCell>
                  <TableCell>{run.unmatchedCount}</TableCell>
                  <TableCell>{formatCents(run.differenceCents)}</TableCell>
                  <TableCell>
                    <Badge className={badgeClass[run.status]}>{run.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {runs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-gray-400 py-8">
                    No reconciliation runs yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
