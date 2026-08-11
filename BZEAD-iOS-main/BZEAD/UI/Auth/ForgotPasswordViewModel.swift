import Foundation
import Observation

struct ForgotPasswordUiState {
    var email: String = ""
    var isLoading: Bool = false
    var errorMessage: String?
}

@Observable
@MainActor
final class ForgotPasswordViewModel {
    private let authRepository: AuthRepository

    var uiState = ForgotPasswordUiState()

    init(authRepository: AuthRepository = AuthRepository()) {
        self.authRepository = authRepository
    }

    func onEmailChange(_ value: String) {
        uiState.email = value
        uiState.errorMessage = nil
    }

    func sendResetCode(onSuccess: @escaping (String) -> Void) {
        guard !uiState.isLoading else { return }

        Task {
            uiState.isLoading = true
            uiState.errorMessage = nil

            let result = await authRepository.resetPassword(email: uiState.email)

            switch result {
            case .success:
                uiState.isLoading = false
                onSuccess(uiState.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
            case .error(let message):
                uiState.isLoading = false
                uiState.errorMessage = message
            }
        }
    }
}
