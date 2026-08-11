import Foundation

enum AuthStrings {
    static let landingBrand = "BZEAD"
    static let landingTagline = "Shop smart. Live bold."
    static let landingGetStarted = "Get Started"

    static let loginBack = "Back"
    static let loginTitle = "Sign in"
    static let loginSubtitle = "Use your buyer account to continue shopping."
    static let loginEmailLabel = "Email address"
    static let loginPasswordLabel = "Password"
    static let loginSignIn = "Sign in"
    static let loginForgotPassword = "Forgot password?"
    static let loginCreateAccount = "Create a buyer account"
    static let loginWrongRoleTitle = "Account type mismatch"
    static func loginWrongRoleMessage(accountType: String) -> String {
        "This email is linked to a \(accountType) account. Buyer login only accepts buyer accounts."
    }
    static let loginRoleSeller = "Seller"
    static let loginRoleAdmin = "Admin"
    static let loginDismiss = "Dismiss"

    static let signupTitle = "Create account"
    static let signupSubtitle = "Register as a buyer to start shopping on BZEAD."
    static let signupCountryLabel = "Country"
    static let signupCountryPlaceholder = "Select your country"
    static func signupCurrency(_ currency: String) -> String { "Currency: \(currency)" }
    static let signupFullNameLabel = "Full name"
    static let signupPasswordLabel = "Password"
    static let signupPasswordHint = "Password looks strong."
    static let signupCreateAccount = "Create account"
    static let signupHaveAccount = "Already have an account? Sign in"

    static let forgotTitle = "Reset password"
    static let forgotSubtitle = "Enter your email to receive a reset code."
    static let forgotSendCode = "Send reset code"
    static let forgotBackToLogin = "Back to sign in"
    static let forgotHint = "Check inbox, spam, and promotions if the email is delayed."

    static let otpTitle = "Verify your email"
    static func otpSubtitle(email: String) -> String {
        "We sent a 6-digit code to \(email). Check inbox and spam."
    }
    static let otpCodeLabel = "OTP code"
    static let otpVerify = "Verify OTP"
    static let otpResend = "Resend OTP"
    static func otpResendTimer(seconds: Int) -> String { "Resend in \(seconds)s" }
    static let otpExpiryHint = "The code expires in about 10 minutes."

    static let newPasswordTitle = "Set new password"
    static let newPasswordSubtitle = "Choose a strong password for your buyer account."
    static let newPasswordLabel = "New password"
    static let newPasswordConfirmLabel = "Confirm password"
    static let newPasswordMatch = "Passwords match."
    static let newPasswordSubmit = "Set new password"
    static let newPasswordSuccessTitle = "Password updated"
    static let newPasswordSuccessSubtitle = "Redirecting you to sign in…"
}
