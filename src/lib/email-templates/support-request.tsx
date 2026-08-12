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
    <Preview>{heading || 'New Crawler support request'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Crawler · Support</Text>
        <Heading style={h1}>{heading || 'New support request'}</Heading>
        <Section>
          <Text style={pre}>{body || '(empty message)'}</Text>
        </Section>
        <Text style={footer}>Reply directly to this email to answer the sender.</Text>
      </Container>
    </Body>
  </Html>
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

const main = { backgroundColor: '#ffffff', fontFamily: 'ui-sans-serif, Arial, sans-serif' }
const container = { padding: '28px 26px', maxWidth: '560px' }
const brand = { fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#6b7280', margin: '0 0 14px' }
const h1 = { fontSize: '19px', fontWeight: 500, color: '#111111', margin: '0 0 16px' }
const pre = { fontSize: '13px', lineHeight: '22px', color: '#333333', whiteSpace: 'pre-wrap' as const, margin: 0 }
const footer = { fontSize: '11px', lineHeight: '18px', color: '#8a8a8a', marginTop: '26px' }
