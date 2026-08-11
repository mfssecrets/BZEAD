import SwiftUI

struct SignupScreen: View {
    let onBack: () -> Void
    let onSignIn: () -> Void
    let onOtpRequired: (String, String, String) -> Void

    @State private var viewModel = SignupViewModel()

    private var selectedCountry: CountryOption? {
        viewModel.uiState.countries.first { $0.id == viewModel.uiState.countryId }
    }

    private var canSubmit: Bool {
        !viewModel.uiState.isLoading &&
            !viewModel.uiState.isLoadingCountries &&
            !viewModel.uiState.fullName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !viewModel.uiState.email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !viewModel.uiState.password.isEmpty &&
            !viewModel.uiState.countryId.isEmpty &&
            viewModel.uiState.passwordErrors.isEmpty
    }

    var body: some View {
        AuthScreenScaffold(
            title: AuthStrings.signupTitle,
            subtitle: AuthStrings.signupSubtitle,
            onBack: onBack,
            backContentDescription: AuthStrings.loginBack
        ) {
            if viewModel.uiState.isLoadingCountries && viewModel.uiState.countries.isEmpty {
                AuthFormSkeleton(fields: 1)
            } else {
                AuthReadOnlyPickerField(
                    label: AuthStrings.signupCountryLabel,
                    value: selectedCountry?.name ?? "",
                    placeholder: AuthStrings.signupCountryPlaceholder,
                    options: viewModel.uiState.countries,
                    onSelect: { viewModel.onCountryChange($0) }
                )
            }

            if let country = selectedCountry {
                Text(AuthStrings.signupCurrency(country.currency))
                    .font(.system(size: 12))
                    .foregroundStyle(Color.white.opacity(0.65))
                    .padding(.top, 6)
            }

            Spacer().frame(height: 16)

            AuthTextField(
                label: AuthStrings.signupFullNameLabel,
                text: Binding(
                    get: { viewModel.uiState.fullName },
                    set: { viewModel.onFullNameChange($0) }
                ),
                textContentType: .name
            )

            Spacer().frame(height: 16)

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
                label: AuthStrings.signupPasswordLabel,
                text: Binding(
                    get: { viewModel.uiState.password },
                    set: { viewModel.onPasswordChange($0) }
                ),
                isSecure: true,
                isSecureVisible: viewModel.uiState.passwordVisible,
                onToggleSecure: { viewModel.onTogglePasswordVisibility() }
            )

            if viewModel.uiState.passwordErrors.isEmpty && !viewModel.uiState.password.isEmpty {
                Text(AuthStrings.signupPasswordHint)
                    .font(.system(size: 12))
                    .foregroundStyle(BzeadColors.authSuccess)
                    .padding(.top, 8)
            }

            ForEach(viewModel.uiState.passwordErrors, id: \.self) { error in
                Text("• \(error)")
                    .font(.system(size: 12))
                    .foregroundStyle(BzeadColors.authError)
                    .padding(.top, 4)
            }

            if let errorMessage = viewModel.uiState.errorMessage {
                AuthErrorText(message: errorMessage)
            }

            Spacer().frame(height: 28)

            AuthPrimaryButton(
                text: AuthStrings.signupCreateAccount,
                enabled: canSubmit,
                onClick: { viewModel.signUp(onOtpRequired: onOtpRequired) },
                loading: viewModel.uiState.isLoading || viewModel.uiState.isLoadingCountries
            )

            AuthLinkText(text: AuthStrings.signupHaveAccount, onClick: onSignIn)

            Spacer().frame(height: 48)
        }
    }
}

#Preview {
    BzeadTheme(darkTheme: true) {
        SignupScreen(onBack: {}, onSignIn: {}, onOtpRequired: { _, _, _ in })
    }
}
