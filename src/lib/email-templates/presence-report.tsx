import React from 'react'

import { EmailLayout } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  heading?: string
  body?: string
}

const Email = ({ heading, body }: Props) => (
  <EmailLayout
    preview={heading || 'Your Crawler Presence report'}
    brand="Crawler"
    heading={heading || 'Your Presence report'}
    body={body || 'No measured activity in this window.'}
    footer="Measured inside Crawler only — never private conversations in ChatGPT, Claude, Gemini or other assistants."
  />
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => data['heading'] || 'Your Crawler Presence report',
  displayName: 'Presence report',
  previewData: {
    heading: 'Crawler report · Studio Nord · last 7 days',
    body: 'Crawler conversations mentioning this Presence: 12\nPublic reads: 34\nOutbound clicks: 3',
  },
} satisfies TemplateEntry
