import { render, screen } from '@testing-library/react'
import App from './App'

describe('PataTena landing page', () => {
  it('presents the product purpose and primary actions', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /what went missing can find its way back/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /report an item/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /search found items/i })).toBeInTheDocument()
  })
})
