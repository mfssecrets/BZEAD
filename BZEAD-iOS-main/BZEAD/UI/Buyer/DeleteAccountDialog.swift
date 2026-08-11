import SwiftUI

struct DeleteAccountReasonOption: Identifiable {
    let id: String
    let label: String
}

private let deleteAccountReasons: [DeleteAccountReasonOption] = [
    DeleteAccountReasonOption(id: "no_longer_need", label: BuyerStrings.deleteReasonNoLongerNeed),
    DeleteAccountReasonOption(id: "privacy", label: BuyerStrings.deleteReasonPrivacy),
    DeleteAccountReasonOption(id: "too_many_emails", label: BuyerStrings.deleteReasonTooManyEmails),
    DeleteAccountReasonOption(id: "bad_experience", label: BuyerStrings.deleteReasonBadExperience),
    DeleteAccountReasonOption(id: "other", label: BuyerStrings.deleteReasonOther),
]

struct DeleteAccountDialog: View {
    let deleting: Bool
    let errorMessage: String?
    let onDismiss: () -> Void
    let onConfirm: (String, String) -> Void

    @State private var selectedReason: DeleteAccountReasonOption?
    @State private var password = ""
    @State private var showPassword = false
    @State private var localError: String?

    var body: some View {
        VStack(spacing: 0) {
            Text(BuyerStrings.deleteAccountTitle)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Color(hex: 0xDC2626))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 12)

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(BuyerStrings.deleteAccountWarning)
                        .font(.system(size: 14))
                        .foregroundStyle(Color(hex: 0x374151))

                    Menu {
                        ForEach(deleteAccountReasons) { option in
                            Button(option.label) {
                                selectedReason = option
                                localError = nil
                            }
                        }
                    } label: {
                        HStack {
                            Text(selectedReason?.label ?? BuyerStrings.deleteAccountReasonHint)
                                .foregroundStyle(Color.black)
                            Spacer()
                            Image(systemName: "chevron.down")
                                .foregroundStyle(Color(hex: 0x6B7280))
                        }
                        .font(.system(size: 16))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 12)
                        .background(Color.white)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(BuyerFieldStyle.unfocusedBorder, lineWidth: 1)
                        )
                    }
                    .disabled(deleting)

                    VStack(alignment: .leading, spacing: 6) {
                        Text(BuyerStrings.deleteAccountPasswordLabel)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(BuyerFieldStyle.labelMuted)
                        HStack {
                            Group {
                                if showPassword {
                                    TextField("", text: $password)
                                } else {
                                    SecureField("", text: $password)
                                }
                            }
                            .font(.system(size: 16))
                            .foregroundStyle(Color.black)
                            Button {
                                showPassword.toggle()
                            } label: {
                                Image(systemName: showPassword ? "eye.slash" : "eye")
                                    .foregroundStyle(Color(hex: 0x6B7280))
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 12)
                        .background(Color.white)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(BuyerFieldStyle.unfocusedBorder, lineWidth: 1)
                        )
                    }
                    .disabled(deleting)

                    if let message = errorMessage ?? localError {
                        Text(message)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Color(hex: 0xDC2626))
                    }
                }
            }

            HStack(spacing: 12) {
                Button(BuyerStrings.cancel) { onDismiss() }
                    .disabled(deleting)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color(hex: 0xF3F4F6))
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                Button {
                    if selectedReason == nil {
                        localError = BuyerStrings.deleteAccountReasonRequired
                    } else if password.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        localError = BuyerStrings.deleteAccountPasswordRequired
                    } else {
                        onConfirm(selectedReason!.id, password)
                    }
                } label: {
                    HStack {
                        if deleting {
                            ProgressView()
                                .tint(.white)
                        }
                        Text(BuyerStrings.deleteAccountConfirm)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .foregroundStyle(Color.white)
                    .background(Color(hex: 0xDC2626))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .disabled(deleting)
            }
            .padding(.top, 16)
        }
        .padding(20)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 24)
    }
}
