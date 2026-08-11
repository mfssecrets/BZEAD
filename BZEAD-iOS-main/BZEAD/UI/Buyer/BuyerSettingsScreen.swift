import SwiftUI

private let amber = Color(hex: 0xF59E0B)
private let amberDark = Color(hex: 0xD97706)

struct BuyerSettingsScreen: View {
    let session: BuyerSession
    let onBack: () -> Void

    @State private var tab = 0
    @State private var loading = true
    @State private var fullName = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var showCurrent = false
    @State private var showNew = false
    @State private var emailNotifications = true
    @State private var orderUpdates = true
    @State private var promotions = false
    @State private var successMessage: String?
    @State private var errorMessage: String?

    private let repo = ProfileRepository()

    var body: some View {
        VStack(spacing: 0) {
            BuyerSubTopBar(title: BuyerStrings.settingsTitle, onBack: onBack)

            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "gearshape.fill")
                    .foregroundStyle(amberDark)
                VStack(alignment: .leading) {
                    Text(BuyerStrings.settingsTitle)
                        .font(.system(size: 20, weight: .bold))
                    Text(BuyerStrings.settingsSubtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(Color(hex: 0x6B7280))
                }
                Spacer()
            }
            .padding(16)

            if let successMessage {
                Text(successMessage)
                    .font(.system(size: 13))
                    .foregroundStyle(Color(hex: 0x16A34A))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
            }
            if let errorMessage {
                Text(errorMessage)
                    .font(.system(size: 13))
                    .foregroundStyle(Color(hex: 0xDC2626))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 4)
            }

            HStack(spacing: 8) {
                ForEach(Array([BuyerStrings.profileTab, BuyerStrings.securityTab, BuyerStrings.notificationsTab].enumerated()), id: \.offset) { index, label in
                    Text(label)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(tab == index ? Color.white : Color(hex: 0x374151))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(tab == index ? amber : Color(hex: 0xF3F4F6))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .onTapGesture { tab = index }
                }
            }
            .padding(.horizontal, 16)

            if loading {
                BuyerFormSkeleton(fields: 5)
                    .padding(16)
                Spacer()
            } else {
                ScrollView {
                    VStack(spacing: 12) {
                        switch tab {
                        case 0:
                            BuyerTextField(label: BuyerStrings.fullName, text: $fullName)
                            BuyerTextField(label: BuyerStrings.email, text: $email)
                                .disabled(true)
                                .opacity(0.7)
                            BuyerTextField(label: BuyerStrings.phone, text: $phone, keyboardType: .phonePad)
                            settingsButton(BuyerStrings.settingsSaveChanges) {
                                Task { await saveProfile() }
                            }
                        case 1:
                            passwordField(BuyerStrings.settingsCurrentPassword, text: $currentPassword, visible: showCurrent) {
                                showCurrent.toggle()
                            }
                            passwordField(BuyerStrings.newPassword, text: $newPassword, visible: showNew) {
                                showNew.toggle()
                            }
                            passwordField(BuyerStrings.settingsConfirmPassword, text: $confirmPassword, visible: showNew) {
                                showNew.toggle()
                            }
                            settingsButton(BuyerStrings.updatePassword) {
                                updatePasswordAction()
                            }
                        default:
                            Toggle(BuyerStrings.emailNotifications, isOn: $emailNotifications)
                            Toggle(BuyerStrings.orderUpdates, isOn: $orderUpdates)
                            Toggle(BuyerStrings.promotions, isOn: $promotions)
                            settingsButton(BuyerStrings.settingsSavePreferences) {
                                Task { await savePreferences() }
                            }
                        }
                    }
                    .padding(16)
                }
            }
        }
        .background(Color.white)
        .task(id: session.userId) { await loadProfile() }
    }

    private func passwordField(_ label: String, text: Binding<String>, visible: Bool, toggle: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(BuyerFieldStyle.labelMuted)
            HStack {
                Group {
                    if visible {
                        TextField("", text: text)
                    } else {
                        SecureField("", text: text)
                    }
                }
                .font(.system(size: 16))
                .foregroundStyle(Color.black)
                Button(action: toggle) {
                    Image(systemName: visible ? "eye.slash" : "eye")
                        .foregroundStyle(Color(hex: 0x6B7280))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .background(Color.white)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(BuyerFieldStyle.unfocusedBorder, lineWidth: 1))
        }
    }

    private func settingsButton(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(amber)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    private func loadProfile() async {
        loading = true
        if let profile = await repo.fetchProfile(session: session) {
            fullName = profile.fullName ?? ""
            phone = profile.phone ?? ""
            email = profile.email ?? session.email
            if let prefs = profile.notificationPreferences {
                emailNotifications = prefs["emailNotifications"]?.boolValue ?? true
                orderUpdates = prefs["orderUpdates"]?.boolValue ?? true
                promotions = prefs["promotions"]?.boolValue ?? false
            }
        } else {
            email = session.email
        }
        loading = false
    }

    private func saveProfile() async {
        let result = await repo.updateProfile(session: session, fullName: fullName.trimmingCharacters(in: .whitespacesAndNewlines), phone: phone.trimmingCharacters(in: .whitespacesAndNewlines))
        if case .success = result {
            successMessage = BuyerStrings.saved
            errorMessage = nil
        } else {
            errorMessage = BuyerStrings.actionFailed
        }
    }

    private func updatePasswordAction() {
        if currentPassword.isEmpty {
            errorMessage = BuyerStrings.settingsCurrentRequired
            return
        }
        if newPassword.count < 8 {
            errorMessage = BuyerStrings.passwordTooShort
            return
        }
        if newPassword != confirmPassword {
            errorMessage = BuyerStrings.settingsPasswordMismatch
            return
        }
        Task {
            let result = await repo.changePassword(session: session, currentPassword: currentPassword, newPassword: newPassword)
            if case .success = result {
                successMessage = BuyerStrings.passwordUpdated
                currentPassword = ""
                newPassword = ""
                confirmPassword = ""
                errorMessage = nil
            } else {
                errorMessage = BuyerStrings.actionFailed
            }
        }
    }

    private func savePreferences() async {
        let prefs: [String: JSONValue] = [
            "emailNotifications": .bool(emailNotifications),
            "orderUpdates": .bool(orderUpdates),
            "promotions": .bool(promotions),
        ]
        let result = await repo.updateNotificationPreferences(session: session, preferences: prefs)
        if case .success = result {
            successMessage = BuyerStrings.saved
            errorMessage = nil
        } else {
            errorMessage = BuyerStrings.actionFailed
        }
    }
}

private extension JSONValue {
    var boolValue: Bool? {
        if case .bool(let value) = self { return value }
        return nil
    }
}
