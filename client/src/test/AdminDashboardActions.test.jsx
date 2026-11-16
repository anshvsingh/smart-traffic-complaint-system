import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import axios from 'axios'
import AdminDashboard from '../AdminDashboard'

vi.mock('axios')

const complaint = {
  _id: 'complaint00aa11',
  category: 'Pothole',
  description: 'Pothole outside the hospital',
  location: 'Hosur Road',
  status: 'Submitted',
  priority: 'Medium',
  createdAt: '2026-11-03T09:00:00Z',
  imageUrl: '/uploads/photo.jpg',
  assignedDepartment: null,
  aiPrediction: { status: 'Completed', category: 'Pothole', confidence: 0.8765 },
  user: { name: 'Meera Citizen', email: 'meera@example.com' },
}

const failedAi = {
  ...complaint,
  _id: 'complaint00bb22',
  description: 'Signal not working',
  category: 'Traffic Signal',
  imageUrl: null,
  aiPrediction: { status: 'Failed' },
  user: null,
}

const API = 'http://localhost:5050/api'
const auth = { headers: { Authorization: 'Bearer admin-token' } }

function mockLoad(list = [complaint, failedAi]) {
  axios.get.mockImplementation((url) =>
    url.endsWith('/admin/complaints')
      ? Promise.resolve({ data: { complaints: list } })
      : Promise.resolve({ data: { total: list.length, byStatus: { Submitted: list.length } } })
  )
}

const renderDashboard = (onLogout = vi.fn()) =>
  render(<AdminDashboard user={{ name: 'Admin User' }} onLogout={onLogout} />)

describe('Admin dashboard actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('token', 'admin-token')
    mockLoad()
  })

  it('shows reporter details and the AI analysis', async () => {
    renderDashboard()
    await screen.findByText('Pothole outside the hospital')

    expect(screen.getByText('Meera Citizen')).toBeInTheDocument()
    expect(screen.getByText('meera@example.com')).toBeInTheDocument()
    expect(screen.getByText(/Confidence:\s*87.65%/)).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.getByAltText('Complaint evidence')).toHaveAttribute(
      'src',
      'http://localhost:5050/uploads/photo.jpg'
    )
  })

  it('asks for a department before assigning', async () => {
    renderDashboard()
    await screen.findByText('Pothole outside the hospital')

    fireEvent.click(screen.getAllByText('Assign Department')[0])

    expect(screen.getByText('Please select a department first.')).toBeInTheDocument()
    expect(axios.patch).not.toHaveBeenCalled()
  })

  it('assigns a complaint to the selected department', async () => {
    axios.patch.mockResolvedValue({
      data: {
        complaint: {
          ...complaint,
          assignedDepartment: 'Roads & Maintenance',
          status: 'Assigned to Department',
        },
      },
    })
    renderDashboard()
    await screen.findByText('Pothole outside the hospital')

    fireEvent.change(screen.getByLabelText('Assign department', { selector: '#department-complaint00aa11' }), {
      target: { value: 'Roads & Maintenance' },
    })
    fireEvent.click(screen.getAllByText('Assign Department')[0])

    expect(await screen.findByText('Complaint assigned successfully.')).toBeInTheDocument()
    expect(axios.patch).toHaveBeenCalledWith(
      `${API}/admin/complaints/complaint00aa11/assign`,
      { assignedDepartment: 'Roads & Maintenance' },
      auth
    )
    expect(screen.getAllByText('Assigned to Department').length).toBeGreaterThan(0)
  })

  it('shows the server error when assignment fails', async () => {
    axios.patch.mockRejectedValue({
      response: { data: { message: 'No account found for Transport Department.' } },
    })
    renderDashboard()
    await screen.findByText('Pothole outside the hospital')

    fireEvent.change(screen.getByLabelText('Assign department', { selector: '#department-complaint00aa11' }), {
      target: { value: 'Transport Department' },
    })
    fireEvent.click(screen.getAllByText('Assign Department')[0])

    expect(
      await screen.findByText('No account found for Transport Department.')
    ).toBeInTheDocument()
  })

  it('updates the complaint status and refreshes statistics', async () => {
    axios.patch.mockResolvedValue({
      data: { complaint: { ...complaint, status: 'Under Review' } },
    })
    renderDashboard()
    await screen.findByText('Pothole outside the hospital')

    fireEvent.change(screen.getByLabelText('Complaint status', { selector: '#status-complaint00aa11' }), {
      target: { value: 'Under Review' },
    })

    expect(await screen.findByText('Complaint updated successfully.')).toBeInTheDocument()
    expect(axios.patch).toHaveBeenCalledWith(
      `${API}/admin/complaints/complaint00aa11`,
      { status: 'Under Review' },
      auth
    )
    // two initial loads + one dashboard refresh
    expect(axios.get).toHaveBeenCalledTimes(3)
  })

  it('updates the priority', async () => {
    axios.patch.mockResolvedValue({
      data: { complaint: { ...complaint, priority: 'High' } },
    })
    renderDashboard()
    await screen.findByText('Pothole outside the hospital')

    fireEvent.change(screen.getByLabelText('Priority', { selector: '#priority-complaint00aa11' }), {
      target: { value: 'High' },
    })

    expect(await screen.findByText('Complaint updated successfully.')).toBeInTheDocument()
    expect(axios.patch.mock.calls[0][1]).toEqual({ priority: 'High' })
  })

  it('shows an error when an update fails', async () => {
    axios.patch.mockRejectedValue({ response: { status: 400, data: { message: 'Invalid complaint status' } } })
    renderDashboard()
    await screen.findByText('Pothole outside the hospital')

    fireEvent.change(screen.getByLabelText('Complaint status', { selector: '#status-complaint00aa11' }), {
      target: { value: 'Rejected' },
    })

    expect(await screen.findByText('Invalid complaint status')).toBeInTheDocument()
  })

  it('logs out when an update returns unauthorized', async () => {
    const onLogout = vi.fn()
    axios.patch.mockRejectedValue({ response: { status: 401 } })
    renderDashboard(onLogout)
    await screen.findByText('Pothole outside the hospital')

    fireEvent.change(screen.getByLabelText('Priority', { selector: '#priority-complaint00aa11' }), {
      target: { value: 'Low' },
    })

    await vi.waitFor(() => expect(onLogout).toHaveBeenCalled())
  })

  it('shows an error message when loading fails', async () => {
    axios.get.mockRejectedValue({ response: { status: 500 } })
    renderDashboard()

    expect(await screen.findByText('Unable to load administrator data.')).toBeInTheDocument()
  })

  it('logs out from the header', async () => {
    const onLogout = vi.fn()
    renderDashboard(onLogout)
    await screen.findByText('Pothole outside the hospital')

    fireEvent.click(screen.getByText('Log out'))

    expect(onLogout).toHaveBeenCalled()
  })
})
