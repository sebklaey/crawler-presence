import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'

/** Shared shell and styling for every Crawler transactional email. */
export interface EmailLayoutProps {
  preview: string
  brand: string
  heading: string
  body: string
  footer: string
}

export const EmailLayout = ({ preview, brand, heading, body, footer }: EmailLayoutProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Text style={styles.brand}>{brand}</Text>
        <Heading style={styles.h1}>{heading}</Heading>
        <Section>
          <Text style={styles.pre}>{body}</Text>
        </Section>
        <Text style={styles.footer}>{footer}</Text>
      </Container>
    </Body>
  </Html>
)

export const styles = {
  main: { backgroundColor: '#ffffff', fontFamily: 'ui-sans-serif, Arial, sans-serif' },
  container: { padding: '28px 26px', maxWidth: '560px' },
  brand: {
    fontSize: '12px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: '#6b7280',
    margin: '0 0 14px',
  },
  h1: { fontSize: '19px', fontWeight: 500, color: '#111111', margin: '0 0 16px' },
  pre: { fontSize: '13px', lineHeight: '22px', color: '#333333', whiteSpace: 'pre-wrap' as const, margin: 0 },
  footer: { fontSize: '11px', lineHeight: '18px', color: '#8a8a8a', marginTop: '26px' },
}
