import React from 'react'

import { EmailLayout } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  heading?: string
  body?: string
}

const Email = ({ heading, body }: Props) => (
  <EmailLayout
    preview={heading || 'Crawler support ticket update'}
    brand="Crawler · Support update"
    heading={heading || 'Ticket update'}
    body={body || '(no details)'}
    footer="Automatic notification from Crawler. Reply to reach the sender directly."
  />
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => data['heading'] || 'Crawler support ticket update',
  displayName: 'Support ticket update',
  previewData: {
    heading: 'Crawler support · Update · Cannot verify my domain',
    body: 'Ticket 8f2c…\nStatus: open -> answered\nFrom: someone@example.com',
  },
} satisfies TemplateEntry
