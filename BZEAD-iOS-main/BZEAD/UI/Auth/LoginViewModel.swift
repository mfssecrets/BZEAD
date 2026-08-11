import Foundation
import Observation

struct LoginUiState {
    var email: String = ""
    var password: String = ""
    var passwordVisible: Bool = false
    var isLoading: Bool = false
    var errorMessage: String?
    var wrongRole: String?
}

@Observable
@MainActor
final class LoginViewModel {
    private let authRepository: AuthRepository

    var uiState = LoginUiState()

    init(authRepository: AuthRepository = AuthRepository()) {
        self.authRepository = authRepository
    }

    func onEmailChange(_ value: String) {
        uiState.email = value
        uiState.errorMessage = nil
        uiState.wrongRole = nil
    }

    func onPasswordChange(_ value: String) {
        uiState.password = value
        uiState.errorMessage = nil
        uiState.wrongRole = nil
    }

    func onTogglePasswordVisibility() {
        uiState.passwordVisible.toggle()
    }

    func dismissWrongRole() {
        uiState.wrongRole = nil
    }

    func signIn(onSuccess: @escaping (BuyerSession) -> Void) {
        guard !uiState.isLoading else { return }

        Task {
            uiState.isLoading = true
            uiState.errorMessage = nil
            uiState.wrongRole = nil

            let result = await authRepository.signInBuyer(
                email: uiState.email,
                password: uiState.password
            )

            switch result {
            case .success(let session):
                uiState.isLoading = false
                onSuccess(session)
            case .wrongRole(let role):
                await authRepository.signOut()
                uiState.isLoading = false
                uiState.wrongRole = role
                uiState.password = ""
            case .error(let message):
                uiState.isLoading = false
                uiState.errorMessage = message
            }
        }
    }
}
