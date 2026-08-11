import Foundation

enum AuthValidator {
    private static let emailRegex = try! NSRegularExpression(pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
    private static let fullNameRegex = try! NSRegularExpression(pattern: "^[a-zA-Z\\s'-]+$")

    static func validateEmail(_ email: String) -> String? {
        if email.isEmpty { return "Email is required" }
        if email.count < 5 { return "Email must be at least 5 characters" }
        if email.count > 255 { return "Email must not exceed 255 characters" }
        let range = NSRange(email.startIndex..., in: email)
        if emailRegex.firstMatch(in: email, range: range) == nil {
            return "Please enter a valid email address"
        }
        return nil
    }

    static func validateFullName(_ name: String) -> String? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "Full name is required" }
        if trimmed.count < 2 { return "Name must be at least 2 characters" }
        if trimmed.count > 100 { return "Name must not exceed 100 characters" }
        if let first = trimmed.first, !first.isUppercase {
            return "First letter must be capital"
        }
        let range = NSRange(trimmed.startIndex..., in: trimmed)
        if fullNameRegex.firstMatch(in: trimmed, range: range) == nil {
            return "Name can only contain letters, spaces, hyphens, and apostrophes"
        }
        return nil
    }

    static func validatePassword(_ password: String) -> [String] {
        var errors: [String] = []
        if password.count < 8 { errors.append("Password must be at least 8 characters") }
        if password.count > 128 { errors.append("Password must not exceed 128 characters") }
        if !password.contains(where: { $0.isUppercase }) {
            errors.append("Must contain at least one uppercase letter")
        }
        if !password.contains(where: { $0.isLowercase }) {
            errors.append("Must contain at least one lowercase letter")
        }
        if !password.contains(where: { $0.isNumber }) {
            errors.append("Must contain at least one number")
        }
        if !password.contains(where: { !$0.isLetter && !$0.isNumber }) {
            errors.append("Must contain at least one special character")
        }
        return errors
    }
}
