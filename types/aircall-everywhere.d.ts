// SDK Aircall Everywhere (v2, sans types publiés) : Aircall Workspace dans une iframe.
// Doc : README du paquet npm « aircall-everywhere ».
declare module 'aircall-everywhere' {
  export type AircallSendError = { code: string; message: string }

  export default class AircallWorkspace {
    constructor(settings: {
      onLogin?: (settings: { user?: { email?: string; first_name?: string; last_name?: string } }) => void
      onLogout?: () => void
      domToLoadWorkspace: string
      integrationToLoad?: 'zendesk' | 'hubspot'
      size?: 'big' | 'small' | 'auto'
      debug?: boolean
    })
    isLoggedIn(cb: (loggedIn: boolean) => void): void
    on(event: string, cb: (data: Record<string, unknown>) => void): void
    removeListener(event: string): boolean
    send(event: string, data: Record<string, unknown> | undefined, cb: (success: boolean, data: unknown) => void): void
    send(event: string, cb: (success: boolean, data: unknown) => void): void
  }
}
