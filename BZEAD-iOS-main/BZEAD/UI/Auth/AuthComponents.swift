import SwiftUI

struct AuthScreenScaffold<Content: View>: View {
    let title: String
    let subtitle: String
    let onBack: () -> Void
    let backContentDescription: String
    @ViewBuilder let content: Content

    var body: some View {
        ZStack {
            BzeadColors.background
                .ignoresSafeArea()

            LandingBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Button(action: onBack) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(BzeadColors.brandCream)
                            .frame(width: 44, height: 44, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 8)
                    .accessibilityLabel(backContentDescription)

                    Text(title)
                        .font(.system(size: 32, weight: .bold))
                        .foregroundStyle(BzeadColors.brandCream)
                        .padding(.top, 24)

                    Text(subtitle)
                        .font(.system(size: 15))
                        .foregroundStyle(Color.white.opacity(0.85))
                        .padding(.top, 8)
                        .padding(.bottom, 28)

                    content
                }
                .padding(.horizontal, 28)
            }
        }
    }
}

struct AuthPrimaryButton: View {
    let text: String
    let enabled: Bool
    let loading: Bool
    let onClick: () -> Void

    init(
        text: String,
        enabled: Bool,
        onClick: @escaping () -> Void,
        loading: Bool = false
    ) {
        self.text = text
        self.enabled = enabled
        self.loading = loading
        self.onClick = onClick
    }

    private var alpha: Double {
        enabled && !loading ? 1.0 : 0.6
    }

    var body: some View {
        Button(action: onClick) {
            ZStack {
                LinearGradient(
                    colors: [
                        BzeadColors.orange.opacity(alpha),
                        BzeadColors.gold.opacity(alpha),
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )

                if loading {
                    InlineSkeleton(
                        width: 120,
                        height: 16,
                        color: BzeadColors.buttonText.opacity(0.45)
                    )
                } else {
                    Text(text)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(BzeadColors.buttonText.opacity(alpha))
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!enabled || loading)
    }
}

struct AuthErrorText: View {
    let message: String

    var body: some View {
        Text(message)
            .font(.system(size: 14))
            .foregroundStyle(BzeadColors.authError)
            .padding(.top, 12)
    }
}

struct AuthLinkText: View {
    let text: String
    let onClick: () -> Void

    var body: some View {
        Button(action: onClick) {
            Text(text)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(BzeadColors.gold)
                .padding(.top, 16)
        }
        .buttonStyle(.plain)
    }
}

struct AuthTextField: View {
    let label: String
    @Binding var text: String
    var keyboardType: UIKeyboardType = .default
    var textContentType: UITextContentType?
    var isSecure: Bool = false
    var isSecureVisible: Bool = false
    var onToggleSecure: (() -> Void)?
    var textAlignment: TextAlignment = .leading
    var font: Font = .body
    var tracking: CGFloat = 0
    var onSubmit: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 14))
                .foregroundStyle(Color.white.opacity(0.8))

            HStack {
                Group {
                    if isSecure && !isSecureVisible {
                        SecureField("", text: $text)
                    } else {
                        TextField("", text: $text)
                    }
                }
                .font(font)
                .tracking(tracking)
                .multilineTextAlignment(textAlignment)
                .foregroundStyle(BzeadColors.brandCream)
                .keyboardType(keyboardType)
                .textContentType(textContentType)
                .textInputAutocapitalization(keyboardType == .emailAddress ? .never : .sentences)
                .autocorrectionDisabled(keyboardType == .emailAddress || isSecure)
                .onSubmit { onSubmit?() }

                if let onToggleSecure {
                    Button(action: onToggleSecure) {
                        Image(systemName: isSecureVisible ? "eye.slash" : "eye")
                            .foregroundStyle(Color.white.opacity(0.7))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.white.opacity(0.25), lineWidth: 1)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(BzeadColors.gold, lineWidth: text.isEmpty ? 0 : 1)
                    .opacity(text.isEmpty ? 0 : 1)
            )
        }
    }
}

struct AuthReadOnlyPickerField: View {
    let label: String
    let value: String
    let placeholder: String
    let options: [CountryOption]
    let onSelect: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 14))
                .foregroundStyle(Color.white.opacity(0.8))

            Menu {
                ForEach(options, id: \.id) { country in
                    Button(country.name) {
                        onSelect(country.id)
                    }
                }
            } label: {
                HStack {
                    Text(value.isEmpty ? placeholder : value)
                        .foregroundStyle(value.isEmpty ? Color.white.opacity(0.55) : BzeadColors.brandCream)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .foregroundStyle(Color.white.opacity(0.7))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Color.white.opacity(0.25), lineWidth: 1)
                )
            }
        }
    }
}
