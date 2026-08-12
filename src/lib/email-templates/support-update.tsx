import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'

import type { TemplateEntry } from './registry'

interface Props {
  heading?: string
  body?: string
}

const Email = ({ heading, body }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{heading || 'Crawler support ticket update'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Crawler · Support update</Text>
        <Heading style={h1}>{heading || 'Ticket update'}</Heading>
        <Section>
          <Text style={pre}>{body || '(no details)'}</Text>
        </Section>
        <Text style={footer}>Automatic notification from Crawler. Reply to reach the sender directly.</Text>
      </Container>
    </Body>
  </Html>
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

const main = { backgroundColor: '#ffffff', fontFamily: 'ui-sans-serif, Arial, sans-serif' }
const container = { padding: '28px 26px', maxWidth: '560px' }
const brand = { fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#6b7280', margin: '0 0 14px' }
const h1 = { fontSize: '19px', fontWeight: 500, color: '#111111', margin: '0 0 16px' }
const pre = { fontSize: '13px', lineHeight: '22px', color: '#333333', whiteSpace: 'pre-wrap' as const, margin: 0 }
const footer = { fontSize: '11px', lineHeight: '18px', color: '#8a8a8a', marginTop: '26px' }
