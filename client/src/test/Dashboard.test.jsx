import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axios from 'axios'
import Dashboard from '../Dashboard'


vi.mock('axios')

describe('TrafficCare Citizen Dashboard', () => {
  const mockLogout = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('token', 'test-token')
    axios.get.mockResolvedValue({
      data: { complaints: [] }
    })
  })

  it('renders the citizen dashboard', async () => {
    render(<Dashboard user={{ name: 'Test User' }} onLogout={mockLogout} />)

    expect(screen.getByText('Your city. Your voice.')).toBeInTheDocument()
    expect(screen.getByText('Submit a complaint')).toBeInTheDocument()

    expect(await screen.findByText('No complaints yet')).toBeInTheDocument()
  })

  it('loads and displays existing complaints', async () => {
    axios.get.mockResolvedValue({
      data: {
        complaints: [{
          _id: 'complaint123456',
          category: 'Pothole',
          description: 'Large pothole near the main road',
          location: 'Main Road',
          status: 'Resolved',
          createdAt: '2026-10-20'
        }]
      }
    })

    render(<Dashboard user={{ name: 'Test User' }} onLogout={mockLogout} />)

    expect(await screen.findByText('Large pothole near the main road')).toBeInTheDocument()
    expect(screen.getByText('Resolved')).toBeInTheDocument()
  })

  it('rejects an unsupported image format', async () => {
    render(<Dashboard />)
  
    const file = new File(['document'], 'document.pdf', {
      type: 'application/pdf',
    })
  
    const input = screen.getByLabelText(/road image/i)
  
    fireEvent.change(input, {
      target: {
        files: [file],
      },
    })
  
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please select a JPG or PNG image.'
    )
  })

  it('submits a complaint and displays the AI prediction', async () => {
    const user = userEvent.setup()

    axios.post.mockResolvedValue({
      data: {
        complaint: {
          aiPrediction: {
            status: 'Completed',
            category: 'Pothole',
            confidence: 0.95
          }
        }
      }
    })

    render(<Dashboard user={{ name: 'Test User' }} onLogout={mockLogout} />)

    await user.type(screen.getByPlaceholderText('e.g. Near college main gate'), 'Main Road')
    await user.type(
      screen.getByPlaceholderText(/describe the traffic issue/i),
      'Large pothole on the road'
    )

    await user.click(screen.getByRole('button', { name: /submit complaint/i }))

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalled()
    })

    expect(await screen.findByRole('status')).toHaveTextContent(
      'AI prediction: Pothole (95.0% confidence)'
    )
  })

  it('logs out when the complaint API returns unauthorized', async () => {
    axios.get.mockRejectedValue({
      response: { status: 401 }
    })

    render(<Dashboard user={{ name: 'Test User' }} onLogout={mockLogout} />)

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })
})
