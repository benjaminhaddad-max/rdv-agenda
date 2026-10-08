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

// CAP_SERVER_URL (dev uniquement) : pointe la coque vers un serveur local, ex.
// `CAP_SERVER_URL=http://localhost:3001 bunx cap sync ios` pour tester dans le
// simulateur ou faire les captures App Store. Toujours re-synchroniser SANS
// la variable avant une archive de prod.
const SERVER_URL = process.env.CAP_SERVER_URL?.trim() || 'https://hub.diploma-sante.fr'

const config: CapacitorConfig = {
  appId: 'fr.diplomasante.hub',
  appName: 'Hub Diploma',
  webDir: 'www', // page de secours (hors ligne) — jamais affichée si le réseau répond
  server: {
    url: SERVER_URL,
    cleartext: SERVER_URL.startsWith('http://'),
    // Domaines autorisés à s'ouvrir DANS l'app (le reste part dans Safari).
    allowNavigation: ['hub.diploma-sante.fr', '*.supabase.co', 'localhost'],
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
