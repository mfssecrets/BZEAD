import Foundation
import Observation

struct OtpUiState {
    var otp: String = ""
    var isLoading: Bool = false
    var isResending: Bool = false
    var errorMessage: String?
    var successMessage: String?
    var resendSeconds: Int = 30
    var canResend: Bool = false
    var verified: Bool = false
}

@Observable
@MainActor
final class OtpViewModel {
    private let authRepository: AuthRepository
    private let email: String
    private let purpose: OtpPurpose
    private let fullName: String?
    private let countryId: String?
    private var timerTask: Task<Void, Never>?

    var uiState = OtpUiState()

    init(
        email: String,
        purpose: OtpPurpose,
        fullName: String? = nil,
        countryId: String? = nil,
        authRepository: AuthRepository = AuthRepository()
    ) {
        self.email = email
        self.purpose = purpose
        self.fullName = fullName
        self.countryId = countryId
        self.authRepository = authRepository
        startResendTimer()
    }

    deinit {
        timerTask?.cancel()
    }

    func onOtpChange(_ value: String) {
        let digits = String(value.filter(\.isNumber).prefix(6))
        uiState.otp = digits
        uiState.errorMessage = nil
    }

    func verify(
        onSignupSuccess: @escaping (BuyerSession) -> Void,
        onPasswordResetVerified: @escaping (String, String) -> Void
    ) {
        guard !uiState.isLoading, uiState.otp.count == 6 else { return }

        Task {
            uiState.isLoading = true
            uiState.errorMessage = nil

            switch purpose {
            case .signup:
                let result = await authRepository.confirmSignUp(
                    email: email,
                    otpCode: uiState.otp,
                    fullName: fullName,
                    countryId: countryId
                )

                switch result {
                case .success(let session):
                    uiState.isLoading = false
                    uiState.verified = true
                    onSignupSuccess(session)
                case .error(let message):
                    uiState.isLoading = false
                    uiState.errorMessage = message
                case .wrongRole:
                    await authRepository.signOut()
                    uiState.isLoading = false
                    uiState.errorMessage = "Invalid account type."
                }

            case .passwordReset:
                uiState.isLoading = false
                uiState.verified = true
                onPasswordResetVerified(email, uiState.otp)
            }
        }
    }

    func resendOtp() {
        guard uiState.canResend, !uiState.isResending else { return }

        Task {
            uiState.isResending = true
            uiState.errorMessage = nil
            uiState.successMessage = nil
            uiState.otp = ""

            let result: SimpleResult
            switch purpose {
            case .signup:
                result = await authRepository.resendSignupOtp(email: email)
            case .passwordReset:
                result = await authRepository.resendPasswordReset(email: email)
            }

            switch result {
            case .success:
                uiState.isResending = false
                uiState.successMessage = "OTP resent successfully. Please check inbox and spam."
                uiState.canResend = false
                uiState.resendSeconds = 30
                startResendTimer()
            case .error(let message):
                uiState.isResending = false
                uiState.errorMessage = message
            }
        }
    }

    private func startResendTimer() {
        timerTask?.cancel()
        timerTask = Task {
            for seconds in stride(from: 30, through: 1, by: -1) {
                guard !Task.isCancelled else { return }
                uiState.resendSeconds = seconds
                uiState.canResend = false
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
            guard !Task.isCancelled else { return }
            uiState.resendSeconds = 0
            uiState.canResend = true
        }
    }
}
