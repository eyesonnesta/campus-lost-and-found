import { expect, test } from '@playwright/test'

test('visitor can understand the product and see the primary actions', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/PataTena/)
  await expect(page.getByRole('heading', { name: /what went missing can find its way back/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /report an item/i })).toBeVisible()
  await expect(page.getByText('Private evidence stays private.')).toBeVisible()
})

test('visitor can open and close the account panel', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close account panel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('report action opens the reporting screen', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Report an item' }).click()

  await expect(page.getByRole('heading', { name: 'Report an item' })).toBeVisible()
  await page.getByRole('button', { name: /Back to home/ }).click()
  await expect(page.getByRole('heading', { name: /what went missing can find its way back/i })).toBeVisible()
})
