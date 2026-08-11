import Foundation
import Observation

struct NewPasswordUiState {
    var newPassword: String = ""
    var confirmPassword: String = ""
    var newPasswordVisible: Bool = false
    var confirmPasswordVisible: Bool = false
    var passwordErrors: [String] = []
    var isLoading: Bool = false
    var errorMessage: String?
    var success: Bool = false
}

@Observable
@MainActor
final class NewPasswordViewModel {
    private let authRepository: AuthRepository
    private let email: String
    private let otpCode: String

    var uiState = NewPasswordUiState()

    init(
        email: String,
        otpCode: String,
        authRepository: AuthRepository = AuthRepository()
    ) {
        self.email = email
        self.otpCode = otpCode
        self.authRepository = authRepository
    }

    func onNewPasswordChange(_ value: String) {
        uiState.newPassword = value
        uiState.passwordErrors = AuthValidator.validatePassword(value)
        uiState.errorMessage = nil
    }

    func onConfirmPasswordChange(_ value: String) {
        uiState.confirmPassword = value
        uiState.errorMessage = nil
    }

    func onToggleNewPasswordVisibility() {
        uiState.newPasswordVisible.toggle()
    }

    func onToggleConfirmPasswordVisibility() {
        uiState.confirmPasswordVisible.toggle()
    }

    func resetPassword() {
        guard !uiState.isLoading else { return }

        if uiState.newPassword != uiState.confirmPassword {
            uiState.errorMessage = "Passwords do not match"
            return
        }
        if !uiState.passwordErrors.isEmpty {
            uiState.errorMessage = uiState.passwordErrors.first
            return
        }

        Task {
            uiState.isLoading = true
            uiState.errorMessage = nil

            let result = await authRepository.confirmPasswordReset(
                email: email,
                otpCode: otpCode,
                newPassword: uiState.newPassword
            )

            switch result {
            case .success:
                uiState.isLoading = false
                uiState.success = true
            case .error(let message):
                uiState.isLoading = false
                uiState.errorMessage = message
            }
        }
    }
}
