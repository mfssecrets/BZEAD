import SwiftUI

enum AppRoute: Equatable {
    case loading
    case landing
    case login
    case signup
    case forgotPassword
    case otpVerification(
        email: String,
        purpose: OtpPurpose,
        fullName: String? = nil,
        countryId: String? = nil
    )
    case newPassword(email: String, otpCode: String)
    case buyerMain(session: BuyerSession)
}

struct BzeadApp: View {
    @State private var route: AppRoute = .loading
    @State private var loginMessage: String?

    private let authRepository = AuthRepository()

    private var canPopAuth: Bool {
        switch route {
        case .login, .signup, .forgotPassword, .otpVerification, .newPassword:
            return true
        default:
            return false
        }
    }

    private var isDarkTheme: Bool {
        if case .buyerMain = route {
            return false
        }
        return true
    }

    var body: some View {
        BzeadTheme(darkTheme: isDarkTheme) {
            routeView
        }
        .task {
            await checkSession()
        }
        .onChange(of: route) { _, newRoute in
            handlePushNotifications(for: newRoute)
        }
    }

    @ViewBuilder
    private var routeView: some View {
        switch route {
        case .loading:
            LoadingScreen()

        case .landing:
            LandingScreen(onGetStarted: { route = .login })

        case .login:
            LoginScreen(
                onBack: { route = .landing },
                onLoginSuccess: { session in
                    loginMessage = nil
                    route = .buyerMain(session: session)
                },
                onForgotPassword: { route = .forgotPassword },
                onSignUp: { route = .signup },
                successMessage: loginMessage
            )

        case .signup:
            SignupScreen(
                onBack: { route = .login },
                onSignIn: { route = .login },
                onOtpRequired: { email, fullName, countryId in
                    route = .otpVerification(
                        email: email,
                        purpose: .signup,
                        fullName: fullName,
                        countryId: countryId
                    )
                }
            )

        case .forgotPassword:
            ForgotPasswordScreen(
                onBack: { route = .login },
                onResetCodeSent: { email in
                    route = .otpVerification(
                        email: email,
                        purpose: .passwordReset
                    )
                },
                onBackToLogin: { route = .login }
            )

        case .otpVerification(let email, let purpose, let fullName, let countryId):
            OtpVerificationScreen(
                email: email,
                purpose: purpose,
                fullName: fullName,
                countryId: countryId,
                onBack: {
                    route = authBackFromOtp(purpose: purpose)
                },
                onSignupSuccess: { session in
                    route = .buyerMain(session: session)
                },
                onPasswordResetVerified: { verifiedEmail, otp in
                    route = .newPassword(email: verifiedEmail, otpCode: otp)
                }
            )

        case .newPassword(let email, let otpCode):
            NewPasswordScreen(
                email: email,
                otpCode: otpCode,
                onBack: {
                    route = .otpVerification(
                        email: email,
                        purpose: .passwordReset
                    )
                },
                onSuccess: {
                    loginMessage = "Password reset successfully! Please sign in with your new password."
                    route = .login
                }
            )

        case .buyerMain(let session):
            BuyerMainScreen(
                session: session,
                pendingOrderId: PushNotificationManager.consumePendingOrderId(),
                openNotificationsTab: PushNotificationManager.consumeOpenNotificationsTab(),
                onLogout: {
                    Task {
                        PushNotificationManager.logout()
                        await authRepository.signOut()
                        route = .landing
                    }
                }
            )
        }
    }

    private func checkSession() async {
        if let session = await authRepository.currentSession(), session.role == "user" {
            route = .buyerMain(session: session)
        } else {
            route = .landing
        }
    }

    private func authBackFromOtp(purpose: OtpPurpose) -> AppRoute {
        switch purpose {
        case .signup:
            return .signup
        case .passwordReset:
            return .forgotPassword
        }
    }

    private func handlePushNotifications(for route: AppRoute) {
        switch route {
        case .buyerMain(let session):
            PushNotificationManager.login(userId: session.userId)
        case .loading:
            break
        default:
            PushNotificationManager.logout()
        }
    }

    /// Mirrors Android `BackHandler` auth pop behavior.
    func popAuthRoute() {
        guard canPopAuth else {
            route = .landing
            return
        }

        switch route {
        case .login:
            route = .landing
        case .signup:
            route = .login
        case .forgotPassword:
            route = .login
        case .otpVerification(let email, let purpose, _, _):
            switch purpose {
            case .signup:
                route = .signup
            case .passwordReset:
                route = .forgotPassword
            }
            _ = email
        case .newPassword(let email, _):
            route = .otpVerification(email: email, purpose: .passwordReset)
        default:
            route = .landing
        }
    }
}

#Preview {
    BzeadApp()
}
