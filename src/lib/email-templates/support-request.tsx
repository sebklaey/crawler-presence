import React from 'react'

import { EmailLayout } from './layout'
import type { TemplateEntry } from './registry'

interface Props {
  heading?: string
  body?: string
}

const Email = ({ heading, body }: Props) => (
  <EmailLayout
    preview={heading || 'New Crawler support request'}
    brand="Crawler · Support"
    heading={heading || 'New support request'}
    body={body || '(empty message)'}
    footer="Reply directly to this email to answer the sender."
  />
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => data['heading'] || 'New Crawler support request',
  displayName: 'Support request',
  previewData: {
    heading: 'Crawler support · Cannot verify my domain',
    body: 'From: someone@example.com\nPresence: studio-nord\n\nThe DNS TXT record is set but verification fails.',
  },
} satisfies TemplateEntry
