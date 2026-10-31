import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axios from 'axios'
import App from '../App'

vi.mock('axios')

describe('TrafficCare App', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('renders the login page', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /traffic\s*care/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('switches to registration mode', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Register' }))

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter your full name')).toBeInTheDocument()
  })

  it('submits registration details successfully', async () => {
    const user = userEvent.setup()

    axios.post.mockResolvedValue({
      data: { message: 'Registration successful' }
    })

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Register' }))
    await user.type(screen.getByPlaceholderText('Enter your full name'), 'Test User')
    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com')
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123')

    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:5050/api/auth/register',
        {
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123'
        }
      )
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Registration successful! Please log in.'
    )
  })

  it('logs in and displays the citizen dashboard', async () => {
    const user = userEvent.setup()

    axios.post.mockResolvedValue({
      data: {
        token: 'test-token',
        user: { name: 'Test User', role: 'citizen' }
      }
    })

    axios.get.mockResolvedValue({
      data: { complaints: [] }
    })

    render(<App />)

    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com')
    await user.type(screen.getByPlaceholderText('Enter your password'), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Your city. Your voice.')).toBeInTheDocument()
    expect(localStorage.getItem('token')).toBe('test-token')
  })

  it('displays an error when login fails', async () => {
    const user = userEvent.setup()

    axios.post.mockRejectedValue({
      response: { data: { message: 'Invalid credentials' } }
    })

    render(<App />)

    await user.type(screen.getByPlaceholderText('you@example.com'), 'wrong@example.com')
    await user.type(screen.getByPlaceholderText('Enter your password'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials')
  })
})
