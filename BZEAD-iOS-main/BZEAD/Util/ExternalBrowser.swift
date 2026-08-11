import Foundation
import UIKit

enum ExternalBrowser {
    static func open(url: String) {
        guard let parsed = URL(string: url) else { return }
        DispatchQueue.main.async {
            UIApplication.shared.open(parsed, options: [:], completionHandler: nil)
        }
    }
}
