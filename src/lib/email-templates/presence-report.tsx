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
    <Preview>{heading || 'Your Crawler Presence report'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Crawler</Text>
        <Heading style={h1}>{heading || 'Your Presence report'}</Heading>
        <Section>
          <Text style={pre}>{body || 'No measured activity in this window.'}</Text>
        </Section>
        <Text style={footer}>
          Measured inside Crawler only — never private conversations in ChatGPT, Claude, Gemini or other assistants.
        </Text>
      </Container>
    </Body>
  </Html>
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

const main = { backgroundColor: '#ffffff', fontFamily: 'ui-sans-serif, Arial, sans-serif' }
const container = { padding: '28px 26px', maxWidth: '560px' }
const brand = { fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#6b7280', margin: '0 0 14px' }
const h1 = { fontSize: '19px', fontWeight: 500, color: '#111111', margin: '0 0 16px' }
const pre = { fontSize: '13px', lineHeight: '22px', color: '#333333', whiteSpace: 'pre-wrap' as const, margin: 0 }
const footer = { fontSize: '11px', lineHeight: '18px', color: '#8a8a8a', marginTop: '26px' }
