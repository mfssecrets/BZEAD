import SwiftUI

struct ForgotPasswordScreen: View {
    let onBack: () -> Void
    let onResetCodeSent: (String) -> Void
    let onBackToLogin: () -> Void

    @State private var viewModel = ForgotPasswordViewModel()

    var body: some View {
        AuthScreenScaffold(
            title: AuthStrings.forgotTitle,
            subtitle: AuthStrings.forgotSubtitle,
            onBack: onBack,
            backContentDescription: AuthStrings.loginBack
        ) {
            AuthTextField(
                label: AuthStrings.loginEmailLabel,
                text: Binding(
                    get: { viewModel.uiState.email },
                    set: { viewModel.onEmailChange($0) }
                ),
                keyboardType: .emailAddress,
                textContentType: .emailAddress,
                onSubmit: {
                    if !viewModel.uiState.isLoading {
                        viewModel.sendResetCode(onSuccess: onResetCodeSent)
                    }
                }
            )

            if let errorMessage = viewModel.uiState.errorMessage {
                AuthErrorText(message: errorMessage)
            }

            Spacer().frame(height: 28)

            AuthPrimaryButton(
                text: AuthStrings.forgotSendCode,
                enabled: !viewModel.uiState.isLoading,
                onClick: { viewModel.sendResetCode(onSuccess: onResetCodeSent) },
                loading: viewModel.uiState.isLoading
            )

            AuthLinkText(text: AuthStrings.forgotBackToLogin, onClick: onBackToLogin)

            Text(AuthStrings.forgotHint)
                .font(.body)
                .foregroundStyle(Color.white.opacity(0.55))
                .padding(.top, 12)
                .padding(.bottom, 48)
        }
    }
}

#Preview {
    BzeadTheme(darkTheme: true) {
        ForgotPasswordScreen(onBack: {}, onResetCodeSent: { _ in }, onBackToLogin: {})
    }
}
