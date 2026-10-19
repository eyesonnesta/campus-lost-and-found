import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ReportFlow } from './ReportFlow'

const categoryId = '22222222-2222-4222-8222-222222222222'
const locationId = '33333333-3333-4333-8333-333333333333'
const draftId = '44444444-4444-4444-8444-444444444444'

function readyClient(publishedRows: unknown[] = []) {
  const profile = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { campus_id: 'campus-1', status: 'active' }, error: null }),
  }
  const categories = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [{ id: categoryId, name: 'Keys' }], error: null }),
  }
  const locations = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [{ id: locationId, name: 'Library entrance' }], error: null }),
  }
  const items = () => {
    let status = ''
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation(function (this: unknown, column: string, value: string) {
        if (column === 'status') status = value
        return this
      }),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockImplementation(() => Promise.resolve({
        data: status === 'published' ? publishedRows : [], error: null,
      })),
    }
  }
  const rpc = vi.fn().mockImplementation((name: string) => Promise.resolve({
    data: name === 'create_item_draft' || name === 'publish_item' ? draftId : null,
    error: null,
  }))
  const from = vi.fn().mockImplementation((name: string) => {
    if (name === 'profiles') return profile
    if (name === 'categories') return categories
    if (name === 'locations') return locations
    return items()
  })
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from, rpc,
  } as unknown as SupabaseClient
  return { client, rpc, from }
}

it('saves through the trusted draft function before publishing', async () => {
  const user = userEvent.setup()
  const { client, rpc } = readyClient()
  render(<ReportFlow client={client} onBack={vi.fn()} onSignIn={vi.fn()} />)

  await screen.findByRole('option', { name: 'Library entrance' })
  await user.click(screen.getByRole('radio', { name: 'found item' }))
  await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), categoryId)
  await user.selectOptions(screen.getByRole('combobox', { name: 'Approximate location' }), locationId)
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Black wallet found')
  await user.type(screen.getByRole('textbox', { name: 'Public description' }), 'I found a black wallet beside the library entrance.')
  await user.type(screen.getByRole('textbox', { name: /Private verification questions/ }), 'What colour is the lining?')
  await user.click(screen.getByRole('button', { name: 'Publish report' }))

  expect(await screen.findByRole('heading', { name: 'Report published' })).toBeInTheDocument()
  expect(rpc).toHaveBeenNthCalledWith(1, 'create_item_draft', expect.objectContaining({
    p_kind: 'found', p_category_id: categoryId, p_location_id: locationId,
    p_title: 'Black wallet found', p_questions: ['What colour is the lining?'],
  }))
  expect(rpc).toHaveBeenNthCalledWith(2, 'publish_item', { p_item_id: draftId })
})

it('blocks public contact details before sending a report', async () => {
  const user = userEvent.setup()
  const { client, rpc } = readyClient()
  render(<ReportFlow client={client} onBack={vi.fn()} onSignIn={vi.fn()} />)

  await screen.findByRole('option', { name: 'Library entrance' })
  await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), categoryId)
  await user.selectOptions(screen.getByRole('combobox', { name: 'Approximate location' }), locationId)
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Blue keyring lost')
  await user.type(screen.getByRole('textbox', { name: 'Public description' }), 'I lost a blue keyring. Email me at owner@example.edu.')
  await user.click(screen.getByRole('button', { name: 'Publish report' }))

  expect(screen.getByRole('alert')).toHaveTextContent('Remove contact details and links')
  expect(rpc).not.toHaveBeenCalled()
})

it('requires confirmation before archiving an owned published report', async () => {
  const user = userEvent.setup()
  const { client, rpc } = readyClient([{
    id: draftId, kind: 'found', category_id: categoryId, location_id: locationId,
    title: 'Black wallet found', description: 'Found beside the library entrance.',
    event_date: '2026-10-19', location_details: null, colour: null, brand: null,
  }])
  render(<ReportFlow client={client} onBack={vi.fn()} onSignIn={vi.fn()} />)

  await screen.findByText('Black wallet found')
  await user.click(screen.getByRole('button', { name: 'Archive report' }))
  expect(rpc).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Confirm archive' }))

  expect(await screen.findByRole('status')).toHaveTextContent('Report archived')
  expect(rpc).toHaveBeenCalledWith('archive_item', { p_item_id: draftId })
  expect(screen.getByText('No published reports yet.')).toBeInTheDocument()
})

it('directs signed-out visitors to account access', async () => {
  const user = userEvent.setup()
  const onSignIn = vi.fn()
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  } as unknown as SupabaseClient
  render(<ReportFlow client={client} onBack={vi.fn()} onSignIn={onSignIn} />)

  await user.click(await screen.findByRole('button', { name: 'Sign in' }))
  expect(onSignIn).toHaveBeenCalledOnce()
})
