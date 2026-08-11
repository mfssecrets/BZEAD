import SwiftUI

struct OtpVerificationScreen: View {
    let email: String
    let purpose: OtpPurpose
    let fullName: String?
    let countryId: String?
    let onBack: () -> Void
    let onSignupSuccess: (BuyerSession) -> Void
    let onPasswordResetVerified: (String, String) -> Void

    @State private var viewModel: OtpViewModel

    init(
        email: String,
        purpose: OtpPurpose,
        fullName: String?,
        countryId: String?,
        onBack: @escaping () -> Void,
        onSignupSuccess: @escaping (BuyerSession) -> Void,
        onPasswordResetVerified: @escaping (String, String) -> Void
    ) {
        self.email = email
        self.purpose = purpose
        self.fullName = fullName
        self.countryId = countryId
        self.onBack = onBack
        self.onSignupSuccess = onSignupSuccess
        self.onPasswordResetVerified = onPasswordResetVerified
        _viewModel = State(
            initialValue: OtpViewModel(
                email: email,
                purpose: purpose,
                fullName: fullName,
                countryId: countryId
            )
        )
    }

    var body: some View {
        AuthScreenScaffold(
            title: AuthStrings.otpTitle,
            subtitle: AuthStrings.otpSubtitle(email: email),
            onBack: onBack,
            backContentDescription: AuthStrings.loginBack
        ) {
            AuthTextField(
                label: AuthStrings.otpCodeLabel,
                text: Binding(
                    get: { viewModel.uiState.otp },
                    set: { viewModel.onOtpChange($0) }
                ),
                keyboardType: .numberPad,
                textAlignment: .center,
                font: .system(size: 24, weight: .semibold),
                tracking: 8,
                onSubmit: {
                    if !viewModel.uiState.isLoading && viewModel.uiState.otp.count == 6 {
                        viewModel.verify(
                            onSignupSuccess: onSignupSuccess,
                            onPasswordResetVerified: onPasswordResetVerified
                        )
                    }
                }
            )

            if let successMessage = viewModel.uiState.successMessage {
                Text(successMessage)
                    .font(.system(size: 14))
                    .foregroundStyle(BzeadColors.authSuccess)
                    .padding(.top, 12)
            }

            if let errorMessage = viewModel.uiState.errorMessage {
                AuthErrorText(message: errorMessage)
            }

            Spacer().frame(height: 28)

            AuthPrimaryButton(
                text: AuthStrings.otpVerify,
                enabled: !viewModel.uiState.isLoading && viewModel.uiState.otp.count == 6,
                onClick: {
                    viewModel.verify(
                        onSignupSuccess: onSignupSuccess,
                        onPasswordResetVerified: onPasswordResetVerified
                    )
                },
                loading: viewModel.uiState.isLoading
            )

            Group {
                if viewModel.uiState.canResend {
                    Button {
                        viewModel.resendOtp()
                    } label: {
                        Text(AuthStrings.otpResend)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(BzeadColors.gold)
                    }
                    .buttonStyle(.plain)
                    .disabled(viewModel.uiState.isResending)
                } else {
                    Text(AuthStrings.otpResendTimer(seconds: viewModel.uiState.resendSeconds))
                        .font(.system(size: 14))
                        .foregroundStyle(Color.white.opacity(0.6))
                }
            }
            .padding(.top, 20)

            Text(AuthStrings.otpExpiryHint)
                .font(.system(size: 12))
                .foregroundStyle(Color.white.opacity(0.55))
                .padding(.top, 12)
                .padding(.bottom, 48)
        }
    }
}

#Preview {
    BzeadTheme(darkTheme: true) {
        OtpVerificationScreen(
            email: "buyer@example.com",
            purpose: .signup,
            fullName: "Jane Buyer",
            countryId: "country-id",
            onBack: {},
            onSignupSuccess: { _ in },
            onPasswordResetVerified: { _, _ in }
        )
    }
}
