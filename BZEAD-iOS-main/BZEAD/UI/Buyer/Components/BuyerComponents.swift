import SwiftUI

func formatCurrency(amount: Double, currency: String?) -> String {
    let code = currency?.uppercased().trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
        ? currency!.uppercased()
        : "INR"
    let symbol: String
    switch code {
    case "INR": symbol = "₹"
    case "USD": symbol = "$"
    case "GBP": symbol = "£"
    case "EUR": symbol = "€"
    case "JPY": symbol = "¥"
    case "AUD": symbol = "A$"
    case "CAD": symbol = "C$"
    default: symbol = "\(code) "
    }
    let decimals = (code == "JPY" || code == "KRW") ? 0 : 2
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.minimumFractionDigits = decimals
    formatter.maximumFractionDigits = decimals
    let formatted = formatter.string(from: NSNumber(value: amount)) ?? String(format: decimals == 0 ? "%.0f" : "%.2f", amount)
    return "\(symbol)\(formatted)"
}

struct BuyerSubTopBar: View {
    let title: String
    let onBack: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Color(hex: 0x111827))
            }
            Text(title)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Color(hex: 0x111827))
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.white)
    }
}

struct BuyerFieldStyle {
    static let focusedBorder = Color(hex: 0x6D28D9)
    static let unfocusedBorder = Color(hex: 0xE5E7EB)
    static let labelMuted = Color(hex: 0x6B7280)
}

struct BuyerTextField: View {
    let label: String
    @Binding var text: String
    var isSecure: Bool = false
    var keyboardType: UIKeyboardType = .default

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(BuyerFieldStyle.labelMuted)
            Group {
                if isSecure {
                    SecureField("", text: $text)
                } else {
                    TextField("", text: $text)
                        .keyboardType(keyboardType)
                }
            }
            .font(.system(size: 16))
            .foregroundStyle(Color.black)
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .background(Color.white)
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(BuyerFieldStyle.unfocusedBorder, lineWidth: 1)
            )
        }
    }
}

struct PriceText: View {
    let price: Double
    let currency: String?

    var body: some View {
        Text(formatCurrency(amount: price, currency: currency))
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(Color(hex: 0x2563EB))
    }
}

struct BuyerYellowButton: View {
    let text: String
    var enabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(text)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(enabled ? BuyerColors.textPrimary : Color(hex: 0x9CA3AF))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(enabled ? BuyerColors.cartCheckoutYellow : Color(hex: 0xE5E7EB))
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(enabled ? BuyerColors.cartCheckoutYellowBorder : Color(hex: 0xD1D5DB), lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .disabled(!enabled)
    }
}
