import SwiftUI

struct LandingScreen: View {
    let onGetStarted: () -> Void

    var body: some View {
        ZStack {
            BzeadColors.background
                .ignoresSafeArea()

            LandingBackground()

            VStack(spacing: 0) {
                Spacer()

                Text(AuthStrings.landingBrand)
                    .font(.system(size: 52, weight: .bold))
                    .tracking(4)
                    .foregroundStyle(BzeadColors.brandCream)
                    .multilineTextAlignment(.center)

                Text(AuthStrings.landingTagline)
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(Color.white.opacity(0.92))
                    .multilineTextAlignment(.center)
                    .padding(.top, 12)

                Spacer()

                GetStartedButton(onClick: onGetStarted)
                    .padding(.bottom, 48)
            }
            .padding(.horizontal, 32)
        }
    }
}

struct LandingBackground: View {
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [BzeadColors.glowOrange, .clear],
                            center: .center,
                            startRadius: 0,
                            endRadius: 170
                        )
                    )
                    .frame(width: 340, height: 340)
                    .offset(x: -120, y: -80)

                Circle()
                    .fill(
                        RadialGradient(
                            colors: [BzeadColors.glowTeal, .clear],
                            center: .center,
                            startRadius: 0,
                            endRadius: 140
                        )
                    )
                    .frame(width: 280, height: 280)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
                    .offset(x: 80, y: -40)

                Circle()
                    .fill(
                        RadialGradient(
                            colors: [BzeadColors.glowGold, .clear],
                            center: .center,
                            startRadius: 0,
                            endRadius: 160
                        )
                    )
                    .frame(width: 320, height: 320)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .offset(x: 60, y: 100)
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
        }
        .allowsHitTesting(false)
    }
}

private struct GetStartedButton: View {
    let onClick: () -> Void

    var body: some View {
        Button(action: onClick) {
            Text(AuthStrings.landingGetStarted)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(BzeadColors.buttonText)
                .frame(maxWidth: .infinity)
                .frame(height: 56)
                .background(
                    LinearGradient(
                        colors: [BzeadColors.orange, BzeadColors.gold],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    BzeadTheme(darkTheme: true) {
        LandingScreen(onGetStarted: {})
    }
}
