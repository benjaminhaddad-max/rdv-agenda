import UIKit
import Capacitor

/// iOS 27+ impose le cycle de vie par scènes (UIScene) aux apps compilées avec
/// le SDK 27 : sans lui, l'app plante au lancement. La fenêtre est créée à
/// partir de Main.storyboard (UISceneStoryboardFile dans Info.plist) ; on relaie
/// seulement les ouvertures d'URL / Universal Links vers Capacitor.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        if let context = connectionOptions.urlContexts.first {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: [:])
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let context = URLContexts.first else { return }
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: [:])
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
}
