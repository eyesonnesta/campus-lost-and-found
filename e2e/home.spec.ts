import { expect, test } from '@playwright/test'

test('visitor can understand the product and see the primary actions', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/PataTena/)
  await expect(page.getByRole('heading', { name: /what went missing can find its way back/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /report an item/i })).toBeVisible()
  await expect(page.getByText('Private evidence stays private.')).toBeVisible()
})
