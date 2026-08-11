import Foundation
import Observation

struct SignupUiState {
    var fullName: String = ""
    var email: String = ""
    var password: String = ""
    var countryId: String = ""
    var countries: [CountryOption] = []
    var passwordVisible: Bool = false
    var passwordErrors: [String] = []
    var isLoading: Bool = false
    var isLoadingCountries: Bool = true
    var errorMessage: String?
}

@Observable
@MainActor
final class SignupViewModel {
    private let authRepository: AuthRepository

    var uiState = SignupUiState()

    init(authRepository: AuthRepository = AuthRepository()) {
        self.authRepository = authRepository
        loadCountries()
    }

    private func loadCountries() {
        Task {
            let countries = await authRepository.fetchCountries()
            uiState.countries = countries
            uiState.isLoadingCountries = false
        }
    }

    func onFullNameChange(_ value: String) {
        uiState.fullName = value
        uiState.errorMessage = nil
    }

    func onEmailChange(_ value: String) {
        uiState.email = value
        uiState.errorMessage = nil
    }

    func onPasswordChange(_ value: String) {
        uiState.password = value
        uiState.passwordErrors = AuthValidator.validatePassword(value)
        uiState.errorMessage = nil
    }

    func onCountryChange(_ countryId: String) {
        uiState.countryId = countryId
        uiState.errorMessage = nil
    }

    func onTogglePasswordVisibility() {
        uiState.passwordVisible.toggle()
    }

    func signUp(onOtpRequired: @escaping (String, String, String) -> Void) {
        guard !uiState.isLoading else { return }

        Task {
            uiState.isLoading = true
            uiState.errorMessage = nil

            let selectedCountry = uiState.countries.first { $0.id == uiState.countryId }
            let result = await authRepository.signUpBuyer(
                email: uiState.email,
                password: uiState.password,
                fullName: uiState.fullName,
                countryId: uiState.countryId,
                currency: selectedCountry?.currency
            )

            switch result {
            case .success:
                uiState.isLoading = false
                onOtpRequired(
                    uiState.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                    uiState.fullName.trimmingCharacters(in: .whitespacesAndNewlines),
                    uiState.countryId
                )
            case .error(let message):
                uiState.isLoading = false
                uiState.errorMessage = message
            }
        }
    }
}
