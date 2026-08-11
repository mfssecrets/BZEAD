import SwiftUI

enum BzeadColors {
    static let background = Color(hex: 0x0A0E14)
    static let brandCream = Color(hex: 0xF5F0E8)
    static let orange = Color(hex: 0xFF7E47)
    static let gold = Color(hex: 0xFFC169)
    static let buttonText = Color(hex: 0x1A1A1A)

    static let glowOrange = Color(hex: 0xFF6B35, alpha: 0.40)
    static let glowTeal = Color(hex: 0x2DD4BF, alpha: 0.27)
    static let glowGold = Color(hex: 0xE8B84A, alpha: 0.33)

    static let authError = Color(hex: 0xFF8A80)
    static let authSuccess = Color(hex: 0x81C784)

    static let skeletonBase = Color(hex: 0xE5E7EB)
}

extension Color {
    init(hex: UInt32, alpha: Double = 1.0) {
        let red = Double((hex >> 16) & 0xFF) / 255.0
        let green = Double((hex >> 8) & 0xFF) / 255.0
        let blue = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: alpha)
    }
}
