import SwiftUI

struct LoginScreen: View {
    let onBack: () -> Void
    let onLoginSuccess: (BuyerSession) -> Void
    let onForgotPassword: () -> Void
    let onSignUp: () -> Void
    var successMessage: String?

    @State private var viewModel = LoginViewModel()
    @State private var showWrongRoleDialog = false

    var body: some View {
        AuthScreenScaffold(
            title: AuthStrings.loginTitle,
            subtitle: AuthStrings.loginSubtitle,
            onBack: onBack,
            backContentDescription: AuthStrings.loginBack
        ) {
            if let successMessage {
                Text(successMessage)
                    .font(.body)
                    .foregroundStyle(BzeadColors.authSuccess)
                    .padding(.bottom, 12)
            }

            AuthTextField(
                label: AuthStrings.loginEmailLabel,
                text: Binding(
                    get: { viewModel.uiState.email },
                    set: { viewModel.onEmailChange($0) }
                ),
                keyboardType: .emailAddress,
                textContentType: .emailAddress
            )

            Spacer().frame(height: 16)

            AuthTextField(
                label: AuthStrings.loginPasswordLabel,
                text: Binding(
                    get: { viewModel.uiState.password },
                    set: { viewModel.onPasswordChange($0) }
                ),
                isSecure: true,
                isSecureVisible: viewModel.uiState.passwordVisible,
                onToggleSecure: { viewModel.onTogglePasswordVisibility() },
                onSubmit: {
                    if !viewModel.uiState.isLoading {
                        viewModel.signIn(onSuccess: onLoginSuccess)
                    }
                }
            )

            HStack {
                Spacer()
                AuthLinkText(text: AuthStrings.loginForgotPassword, onClick: onForgotPassword)
            }

            if let errorMessage = viewModel.uiState.errorMessage {
                AuthErrorText(message: errorMessage)
            }

            Spacer().frame(height: 28)

            AuthPrimaryButton(
                text: AuthStrings.loginSignIn,
                enabled: !viewModel.uiState.isLoading,
                onClick: { viewModel.signIn(onSuccess: onLoginSuccess) },
                loading: viewModel.uiState.isLoading
            )

            AuthLinkText(text: AuthStrings.loginCreateAccount, onClick: onSignUp)

            Spacer().frame(height: 48)
        }
        .onChange(of: viewModel.uiState.wrongRole) { _, role in
            showWrongRoleDialog = role != nil
        }
        .alert(AuthStrings.loginWrongRoleTitle, isPresented: $showWrongRoleDialog) {
            Button(AuthStrings.loginDismiss) {
                viewModel.dismissWrongRole()
            }
        } message: {
            if let role = viewModel.uiState.wrongRole {
                let accountType = role == "admin"
                    ? AuthStrings.loginRoleAdmin
                    : AuthStrings.loginRoleSeller
                Text(AuthStrings.loginWrongRoleMessage(accountType: accountType))
            }
        }
    }
}

#Preview {
    BzeadTheme(darkTheme: true) {
        LoginScreen(
            onBack: {},
            onLoginSuccess: { _ in },
            onForgotPassword: {},
            onSignUp: {}
        )
    }
}
