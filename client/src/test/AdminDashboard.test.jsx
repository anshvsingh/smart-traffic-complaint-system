import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import axios from 'axios'
import AdminDashboard from '../AdminDashboard'

vi.mock('axios')

describe('TrafficCare Admin Dashboard', () => {
  const mockLogout = vi.fn()

  const complaints = [{
    _id: 'complaint123456',
    category: 'Pothole',
    description: 'Road damage near college',
    location: 'Main Road',
    status: 'Submitted',
    priority: 'Medium',
    createdAt: '2026-10-20',
    user: {
      name: 'Test Citizen',
      email: 'citizen@example.com'
    }
  }]

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('token', 'admin-token')

    axios.get.mockImplementation((url) => {
      if (url.endsWith('/admin/complaints')) {
        return Promise.resolve({ data: { complaints } })
      }

      return Promise.resolve({
        data: {
          total: 1,
          byStatus: { Submitted: 1 }
        }
      })
    })
  })

  it('renders the administrator dashboard', async () => {
    render(
      <AdminDashboard
        user={{ name: 'Admin User' }}
        onLogout={mockLogout}
      />
    )

    expect(screen.getByText('Manage complaints')).toBeInTheDocument()
    expect(await screen.findByText('Road damage near college')).toBeInTheDocument()
  })

  it('filters complaints by status', async () => {
    render(
      <AdminDashboard
        user={{ name: 'Admin User' }}
        onLogout={mockLogout}
      />
    )

    await screen.findByText('Road damage near college')

    fireEvent.change(screen.getByLabelText('Filter by status:'), {
      target: { value: 'Resolved' }
    })

    expect(screen.getByText('No complaints found')).toBeInTheDocument()
  })

  it('logs out when the administrator API returns unauthorized', async () => {
    axios.get.mockRejectedValue({
      response: { status: 401 }
    })

    render(
      <AdminDashboard
        user={{ name: 'Admin User' }}
        onLogout={mockLogout}
      />
    )

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })
})
