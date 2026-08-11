import SwiftUI

struct BzeadTypography {
    let bodyLarge = Font.system(size: 16, weight: .regular)
    let bodyLargeLineSpacing: CGFloat = 8
    let bodyLargeTracking: CGFloat = 0.5
}

private struct BzeadTypographyKey: EnvironmentKey {
    static let defaultValue = BzeadTypography()
}

extension EnvironmentValues {
    var bzeadTypography: BzeadTypography {
        get { self[BzeadTypographyKey.self] }
        set { self[BzeadTypographyKey.self] = newValue }
    }
}

private struct BzeadDarkColorScheme {
    static let primary = BzeadColors.gold
    static let secondary = BzeadColors.orange
    static let tertiary = BzeadColors.brandCream
}

private struct BzeadLightColorScheme {
    static let primary = BzeadColors.orange
    static let secondary = BzeadColors.gold
    static let tertiary = BzeadColors.background
    static let onSurface = Color.black
    static let onBackground = Color.black
}

struct BzeadTheme<Content: View>: View {
    let darkTheme: Bool
    let content: Content

    init(darkTheme: Bool = true, @ViewBuilder content: () -> Content) {
        self.darkTheme = darkTheme
        self.content = content()
    }

    var body: some View {
        content
            .environment(\.bzeadTypography, BzeadTypography())
            .preferredColorScheme(darkTheme ? .dark : .light)
            .tint(darkTheme ? BzeadDarkColorScheme.primary : BzeadLightColorScheme.primary)
    }
}

extension View {
    func bzeadBodyLargeStyle() -> some View {
        self
            .font(BzeadTypography().bodyLarge)
            .tracking(BzeadTypography().bodyLargeTracking)
            .lineSpacing(BzeadTypography().bodyLargeLineSpacing)
    }
}
