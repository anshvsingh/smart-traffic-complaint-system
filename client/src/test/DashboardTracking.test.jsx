// Regression tests for BUG-007: the citizen must see who is handling the
// complaint and its progress history.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import axios from 'axios'
import Dashboard from '../Dashboard'

vi.mock('axios')

const tracked = {
  _id: 'complaint00track',
  category: 'Pothole',
  description: 'Pothole outside the school gate',
  location: 'MG Road',
  status: 'Resolved',
  createdAt: '2026-11-01T09:00:00Z',
  assignedDepartment: 'Roads & Maintenance',
  progressUpdates: [
    { _id: 'u1', role: 'admin', message: 'Complaint assigned to Roads & Maintenance.', createdAt: '2026-11-01T10:00:00Z' },
    { _id: 'u2', role: 'department', message: 'Crew dispatched; lane barricaded.', createdAt: '2026-11-02T10:00:00Z' },
    { _id: 'u3', role: 'department', message: 'Pothole filled and resurfaced.', createdAt: '2026-11-03T10:00:00Z' },
    { _id: 'u4', role: 'admin', message: 'Administrator updated complaint status to Resolved.', createdAt: '2026-11-04T10:00:00Z' },
  ],
}

const untracked = {
  _id: 'complaint00fresh',
  category: 'Street Lighting',
  description: 'Street lamp not working',
  location: 'Ring Road',
  status: 'Submitted',
  createdAt: '2026-11-05T09:00:00Z',
  assignedDepartment: null,
  progressUpdates: [],
}

const cardFor = (text) => screen.getByText(text).closest('article')

describe('Citizen complaint tracking (BUG-007)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('token', 'test-token')
    axios.get.mockResolvedValue({ data: { complaints: [tracked, untracked] } })
  })

  it('shows the department handling the complaint', async () => {
    render(<Dashboard user={{ name: 'Test User' }} onLogout={vi.fn()} />)
    await screen.findByText(tracked.description)

    const card = cardFor(tracked.description)
    expect(within(card).getByText('Handled by')).toBeInTheDocument()
    expect(within(card).getByText('Roads & Maintenance')).toBeInTheDocument()
  })

  it('shows the progress history, newest first, with who made each update', async () => {
    render(<Dashboard user={{ name: 'Test User' }} onLogout={vi.fn()} />)
    await screen.findByText(tracked.description)

    const card = cardFor(tracked.description)
    expect(within(card).getByText('Progress history')).toBeInTheDocument()

    const items = within(card).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0]).toHaveTextContent('Administrator')
    expect(items[0]).toHaveTextContent('Administrator updated complaint status to Resolved.')
    expect(items[1]).toHaveTextContent('Department')
    expect(items[1]).toHaveTextContent('Pothole filled and resurfaced.')
    expect(items[3]).toHaveTextContent('Complaint assigned to Roads & Maintenance.')
    expect(items[0].querySelector('time')).toHaveAttribute('datetime', '2026-11-04T10:00:00Z')
  })

  it('says the complaint is not yet assigned and shows no empty history', async () => {
    render(<Dashboard user={{ name: 'Test User' }} onLogout={vi.fn()} />)
    await screen.findByText(untracked.description)

    const card = cardFor(untracked.description)
    expect(within(card).getByText('Not yet assigned')).toBeInTheDocument()
    expect(within(card).queryByText('Progress history')).not.toBeInTheDocument()
  })
})
