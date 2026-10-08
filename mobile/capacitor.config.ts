import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Hub Diploma — coque native iOS/Android du CRM.
 *
 * L'app Next.js est en SSR (middleware Supabase, server actions) : pas d'export
 * statique, la coque charge directement le site déployé (server.url). Toute
 * mise en prod du CRM (push sur main → Vercel) est donc visible dans l'app
 * sans repasser par l'App Store. Une nouvelle version iOS n'est nécessaire que
 * si on touche au natif (plugins, icône, Info.plist, permissions).
 *
 * Distribution : app NON LISTÉE (« Unlisted app distribution ») — même modèle
 * que Diploma Live. Voir docs/app-store-hub-diploma.md.
 */
const BG = '#12314D' // marine Hub Diploma (fond splash / status bar / safe-areas)

const config: CapacitorConfig = {
  appId: 'fr.diplomasante.hub',
  appName: 'Hub Diploma',
  webDir: 'www', // page de secours (hors ligne) — jamais affichée si le réseau répond
  server: {
    url: 'https://hub.diploma-sante.fr',
    cleartext: false,
    // Domaines autorisés à s'ouvrir DANS l'app (le reste part dans Safari).
    allowNavigation: ['hub.diploma-sante.fr', '*.supabase.co'],
    errorPath: 'offline.html',
  },
  ios: {
    contentInset: 'never', // bord à bord, safe-areas gérées en CSS (viewport-fit=cover)
    backgroundColor: BG,
    allowsLinkPreview: false,
    preferredContentMode: 'recommended', // iPad = vraie largeur tablette
    scheme: 'Hub Diploma',
  },
  android: {
    backgroundColor: BG,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: BG,
      iosSplashFullScreen: true,
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK', // texte clair sur fond marine
      backgroundColor: BG,
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
}

export default config
