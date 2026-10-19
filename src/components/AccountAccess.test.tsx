import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountAccess } from './AccountAccess'

const mock = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mock.getSession,
      onAuthStateChange: mock.onAuthStateChange,
      signUp: mock.signUp,
      signInWithPassword: mock.signInWithPassword,
      signOut: mock.signOut,
    },
    from: mock.from,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mock.getSession.mockResolvedValue({ data: { session: null }, error: null })
  mock.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})

it('asks for email confirmation after account creation', async () => {
  const user = userEvent.setup()
  mock.signUp.mockResolvedValue({ data: { session: null }, error: null })
  render(<AccountAccess />)

  await user.click(screen.getByRole('button', { name: /Sign in|Finish setup/ }))
  await user.click(screen.getByRole('button', { name: 'Create an account' }))
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'Student@Campus.ac.ke')
  await user.type(screen.getByLabelText('Password'), 'a-long-password')
  await user.click(screen.getByRole('button', { name: 'Create account' }))

  expect(await screen.findByRole('status')).toHaveTextContent('Check your email to confirm your account')
  expect(mock.signUp).toHaveBeenCalledWith({ email: 'student@campus.ac.ke', password: 'a-long-password' })
  expect(mock.from).not.toHaveBeenCalled()
})

it('loads the signed-in member profile', async () => {
  const user = userEvent.setup()
  mock.signInWithPassword.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  const profileRead = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: 'user-1', display_name: 'Alex Member', campus_id: 'campus-1' }, error: null,
    }),
  }
  mock.from.mockReturnValue(profileRead)
  render(<AccountAccess />)

  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'alex@campus.ac.ke')
  await user.type(screen.getByLabelText('Password'), 'a-long-password')
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign in' }))

  expect(await screen.findByRole('heading', { name: 'Your account' })).toBeInTheDocument()
  expect(screen.getByText('Alex Member')).toBeInTheDocument()
  expect(mock.signInWithPassword).toHaveBeenCalledWith({ email: 'alex@campus.ac.ke', password: 'a-long-password' })
  expect(profileRead.eq).toHaveBeenCalledWith('id', 'user-1')
})

it('sends only self-profile fields and explains a rejected campus', async () => {
  const user = userEvent.setup()
  mock.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null })
  const profileRead = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  const profileWrite = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: new Error('RLS rejected') }),
  }
  const campusRead = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [{ id: 'campus-1', name: 'Main campus' }], error: null }),
  }
  let profileCalls = 0
  mock.from.mockImplementation((table: string) => {
    if (table === 'campuses') return campusRead
    profileCalls += 1
    return profileCalls === 1 ? profileRead : profileWrite
  })
  render(<AccountAccess />)

  await user.click(screen.getByRole('button', { name: /Sign in|Finish setup/ }))
  await screen.findByRole('heading', { name: 'Join your campus' })
  await screen.findByRole('option', { name: 'Main campus' })
  await user.type(screen.getByRole('textbox', { name: 'Display name' }), 'Alex Member')
  await user.selectOptions(screen.getByRole('combobox', { name: 'Campus' }), 'campus-1')
  await user.click(screen.getByRole('button', { name: 'Create campus profile' }))

  await waitFor(() => expect(profileWrite.insert).toHaveBeenCalledWith({
    id: 'user-1', display_name: 'Alex Member', campus_id: 'campus-1',
  }))
  expect(screen.getByRole('alert')).toHaveTextContent('Confirm your email and use a campus approved for its email domain')
})
