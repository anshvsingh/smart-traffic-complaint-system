import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import axios from 'axios'
import DepartmentDashboard from '../DepartmentDashboard'

vi.mock('axios')

const user = { name: 'Roads Department', department: 'Roads & Maintenance' }

const assigned = {
  _id: 'c-assigned',
  category: 'Pothole',
  description: 'Pothole near the school gate',
  location: 'MG Road',
  status: 'Assigned to Department',
  departmentStatus: 'Assigned',
  createdAt: '2026-11-01T10:00:00Z',
  imageUrl: '/uploads/abc.jpg',
  user: { name: 'Asha Citizen' },
  progressUpdates: [],
}

const accepted = {
  _id: 'c-accepted',
  category: 'Road Sign',
  description: 'Broken road sign at junction',
  location: 'Ring Road',
  status: 'Accepted by Department',
  departmentStatus: 'Accepted',
  createdAt: '2026-11-02T10:00:00Z',
  user: { name: 'Ravi Citizen' },
  progressUpdates: [
    { _id: 'p1', role: 'admin', message: 'Assigned to Roads & Maintenance.', createdAt: '2026-11-02T11:00:00Z' },
    { _id: 'p2', role: 'department', message: 'Department accepted the complaint assignment.', createdAt: '2026-11-02T12:00:00Z' },
  ],
}

const completed = {
  _id: 'c-done',
  category: 'Road Blockage',
  description: 'Debris blocking lane',
  location: 'Airport Road',
  status: 'Work Completed',
  departmentStatus: 'Work Completed',
  user: null,
  progressUpdates: [],
}

const renderDashboard = (onLogout = vi.fn()) =>
  render(<DepartmentDashboard user={user} onLogout={onLogout} />)

describe('TrafficCare Department Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('token', 'department-token')
    axios.get.mockResolvedValue({ data: { complaints: [assigned, accepted, completed] } })
    axios.patch.mockResolvedValue({ data: { status: 'success' } })
  })

  it('lists assigned complaints with statistics', async () => {
    renderDashboard()

    expect(screen.getByText('Loading assigned complaints...')).toBeInTheDocument()
    expect(await screen.findByText('Pothole near the school gate')).toBeInTheDocument()
    expect(screen.getByText('Broken road sign at junction')).toBeInTheDocument()
    expect(screen.getByText('Roads & Maintenance')).toBeInTheDocument()

    const totals = screen.getByText('Total Assigned').parentElement
    expect(within(totals).getByText('3')).toBeInTheDocument()
    const awaiting = screen.getByText('Awaiting Acceptance').parentElement
    expect(within(awaiting).getByText('1')).toBeInTheDocument()

    expect(screen.getByAltText('Complaint evidence')).toHaveAttribute(
      'src',
      'http://localhost:5050/uploads/abc.jpg'
    )
    expect(screen.getByText(/Waiting for\s+administrator verification/)).toBeInTheDocument()
    expect(axios.get).toHaveBeenCalledWith(
      'http://localhost:5050/api/department/complaints',
      { headers: { Authorization: 'Bearer department-token' } }
    )
  })

  it('shows an empty state when nothing is assigned', async () => {
    axios.get.mockResolvedValue({ data: { complaints: [] } })
    renderDashboard()

    expect(await screen.findByText('No assigned complaints yet')).toBeInTheDocument()
  })

  it('shows an error and retries loading', async () => {
    axios.get.mockRejectedValueOnce({ response: { data: { message: 'Server unavailable' } } })
    renderDashboard()

    expect(await screen.findByText('Server unavailable')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Try again'))

    expect(await screen.findByText('Pothole near the school gate')).toBeInTheDocument()
    expect(axios.get).toHaveBeenCalledTimes(2)
  })

  it('accepts an assignment', async () => {
    renderDashboard()
    await screen.findByText('Pothole near the school gate')

    fireEvent.click(screen.getByText('Accept Assignment'))

    expect(await screen.findByText('Complaint accepted successfully.')).toBeInTheDocument()
    expect(axios.patch).toHaveBeenCalledWith(
      'http://localhost:5050/api/department/complaints/c-assigned/accept',
      {},
      { headers: { Authorization: 'Bearer department-token' } }
    )
    expect(axios.get).toHaveBeenCalledTimes(2)
  })

  it('shows the server message when accepting fails', async () => {
    axios.patch.mockRejectedValueOnce({
      response: { data: { message: 'This complaint cannot be accepted in its current state' } },
    })
    renderDashboard()
    await screen.findByText('Pothole near the school gate')

    fireEvent.click(screen.getByText('Accept Assignment'))

    expect(
      await screen.findByText('This complaint cannot be accepted in its current state')
    ).toBeInTheDocument()
  })

  it('requires a progress message before submitting', async () => {
    renderDashboard()
    await screen.findByText('Broken road sign at junction')

    fireEvent.click(screen.getByText('Update Progress'))

    expect(screen.getByText('Please enter a progress message.')).toBeInTheDocument()
    expect(axios.patch).not.toHaveBeenCalled()
  })

  it('posts a progress update', async () => {
    renderDashboard()
    await screen.findByText('Broken road sign at junction')

    const box = screen.getByLabelText('Progress update')
    fireEvent.change(box, { target: { value: '  Replacing the sign today  ' } })
    fireEvent.click(screen.getByText('Update Progress'))

    expect(await screen.findByText('Progress update submitted successfully.')).toBeInTheDocument()
    expect(axios.patch).toHaveBeenCalledWith(
      'http://localhost:5050/api/department/complaints/c-accepted/progress',
      { message: 'Replacing the sign today', status: 'Work in Progress' },
      { headers: { Authorization: 'Bearer department-token' } }
    )
    await waitFor(() => expect(screen.getByLabelText('Progress update')).toHaveValue(''))
  })

  it('marks work as completed', async () => {
    renderDashboard()
    await screen.findByText('Broken road sign at junction')

    fireEvent.change(screen.getByLabelText('Progress update'), {
      target: { value: 'New sign installed' },
    })
    fireEvent.click(screen.getByText('Mark Work Completed'))

    expect(
      await screen.findByText('Work marked as completed. Awaiting admin verification.')
    ).toBeInTheDocument()
    expect(axios.patch.mock.calls[0][1]).toEqual({
      message: 'New sign installed',
      status: 'Work Completed',
    })
  })

  it('shows a fallback message when a progress update fails', async () => {
    axios.patch.mockRejectedValueOnce(new Error('Network Error'))
    renderDashboard()
    await screen.findByText('Broken road sign at junction')

    fireEvent.change(screen.getByLabelText('Progress update'), {
      target: { value: 'Update' },
    })
    fireEvent.click(screen.getByText('Update Progress'))

    expect(await screen.findByText('Unable to submit progress update.')).toBeInTheDocument()
  })

  it('opens and closes complaint details with progress history', async () => {
    renderDashboard()
    await screen.findByText('Broken road sign at junction')

    fireEvent.click(screen.getAllByText('View Details')[1])

    expect(screen.getByText('COMPLAINT DETAILS')).toBeInTheDocument()
    expect(screen.getByText('Assigned to Roads & Maintenance.')).toBeInTheDocument()
    expect(screen.getByText('Department accepted the complaint assignment.')).toBeInTheDocument()

    fireEvent.click(screen.getByText('×'))
    expect(screen.queryByText('COMPLAINT DETAILS')).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByText('View Details')[0])
    expect(screen.getByText('No progress updates recorded yet.')).toBeInTheDocument()
  })

  it('logs out', async () => {
    const onLogout = vi.fn()
    renderDashboard(onLogout)
    await screen.findByText('Pothole near the school gate')

    fireEvent.click(screen.getByText('Logout'))

    expect(onLogout).toHaveBeenCalled()
  })
})
