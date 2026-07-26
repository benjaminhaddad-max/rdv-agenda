/** Design tokens CRM Version B — hybride HubSpot (blanc / formes rondes) + or Diploma. */

export const crmV2 = {
  bg: '#ffffff',
  bgSoft: '#f5f8fa',
  bgMuted: '#eaf0f6',
  border: '#dfe3eb',
  borderStrong: '#cbd6e2',
  text: '#2d3e50',
  textMuted: '#516f90',
  textFaint: '#7c98b6',
  link: '#0091ae',
  linkHover: '#007a8c',
  gold: '#C9A84C',
  goldSoft: 'rgba(201, 168, 76, 0.12)',
  goldBorder: 'rgba(201, 168, 76, 0.35)',
  danger: '#f2545b',
  dangerSoft: 'rgba(242, 84, 91, 0.08)',
  success: '#00bda5',
  focus: '#C9A84C',
  radiusSm: 6,
  radius: 8,
  radiusLg: 12,
  radiusPill: 999,
  shadow: '0 1px 3px rgba(45, 62, 80, 0.06)',
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
} as const

export type CrmV2Theme = typeof crmV2
