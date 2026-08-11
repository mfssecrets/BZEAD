import SwiftUI

struct NewPasswordScreen: View {
    let email: String
    let otpCode: String
    let onBack: () -> Void
    let onSuccess: () -> Void

    @State private var viewModel: NewPasswordViewModel

    init(
        email: String,
        otpCode: String,
        onBack: @escaping () -> Void,
        onSuccess: @escaping () -> Void
    ) {
        self.email = email
        self.otpCode = otpCode
        self.onBack = onBack
        self.onSuccess = onSuccess
        _viewModel = State(initialValue: NewPasswordViewModel(email: email, otpCode: otpCode))
    }

    private var canSubmit: Bool {
        !viewModel.uiState.isLoading &&
            !viewModel.uiState.newPassword.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !viewModel.uiState.confirmPassword.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            viewModel.uiState.passwordErrors.isEmpty
    }

    var body: some View {
        Group {
            if viewModel.uiState.success {
                successView
            } else {
                formView
            }
        }
        .onChange(of: viewModel.uiState.success) { _, success in
            guard success else { return }
            Task {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                onSuccess()
            }
        }
    }

    private var successView: some View {
        AuthScreenScaffold(
            title: AuthStrings.newPasswordSuccessTitle,
            subtitle: AuthStrings.newPasswordSuccessSubtitle,
            onBack: onBack,
            backContentDescription: AuthStrings.loginBack
        ) {
            InlineSkeleton(
                width: 32,
                height: 32,
                color: BzeadColors.gold.opacity(0.55)
            )
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, 24)
        }
    }

    private var formView: some View {
        AuthScreenScaffold(
            title: AuthStrings.newPasswordTitle,
            subtitle: AuthStrings.newPasswordSubtitle,
            onBack: onBack,
            backContentDescription: AuthStrings.loginBack
        ) {
            AuthTextField(
                label: AuthStrings.newPasswordLabel,
                text: Binding(
                    get: { viewModel.uiState.newPassword },
                    set: { viewModel.onNewPasswordChange($0) }
                ),
                isSecure: true,
                isSecureVisible: viewModel.uiState.newPasswordVisible,
                onToggleSecure: { viewModel.onToggleNewPasswordVisibility() }
            )

            ForEach(viewModel.uiState.passwordErrors, id: \.self) { error in
                Text("• \(error)")
                    .font(.system(size: 12))
                    .foregroundStyle(BzeadColors.authError)
                    .padding(.top, 4)
            }

            Spacer().frame(height: 16)

            AuthTextField(
                label: AuthStrings.newPasswordConfirmLabel,
                text: Binding(
                    get: { viewModel.uiState.confirmPassword },
                    set: { viewModel.onConfirmPasswordChange($0) }
                ),
                isSecure: true,
                isSecureVisible: viewModel.uiState.confirmPasswordVisible,
                onToggleSecure: { viewModel.onToggleConfirmPasswordVisibility() }
            )

            if !viewModel.uiState.confirmPassword.isEmpty &&
                viewModel.uiState.newPassword == viewModel.uiState.confirmPassword &&
                viewModel.uiState.passwordErrors.isEmpty {
                Text(AuthStrings.newPasswordMatch)
                    .font(.system(size: 12))
                    .foregroundStyle(BzeadColors.authSuccess)
                    .padding(.top, 8)
            }

            if let errorMessage = viewModel.uiState.errorMessage {
                AuthErrorText(message: errorMessage)
            }

            Spacer().frame(height: 28)

            AuthPrimaryButton(
                text: AuthStrings.newPasswordSubmit,
                enabled: canSubmit,
                onClick: { viewModel.resetPassword() },
                loading: viewModel.uiState.isLoading
            )

            Spacer().frame(height: 48)
        }
    }
}

#Preview {
    BzeadTheme(darkTheme: true) {
        NewPasswordScreen(
            email: "buyer@example.com",
            otpCode: "123456",
            onBack: {},
            onSuccess: {}
        )
    }
}
