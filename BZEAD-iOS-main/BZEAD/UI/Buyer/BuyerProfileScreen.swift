import SwiftUI

private let purple = Color(hex: 0x6D28D9)
private let pageBg = Color(hex: 0xF8FAFC)

struct BuyerProfileScreen: View {
    let session: BuyerSession
    let onLogout: () -> Void
    let onOpenSettings: () -> Void
    let onOpenAddresses: () -> Void

    @State private var loading = true
    @State private var fullName = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var countryId: String?
    @State private var countries: [CountryOption] = []
    @State private var addresses: [UserAddressRow] = []
    @State private var editingField: String?
    @State private var editValue = ""
    @State private var saving = false
    @State private var showLogoutConfirm = false
    @State private var showDeleteAccount = false
    @State private var deletingAccount = false
    @State private var deleteAccountError: String?
    @State private var successMessage: String?
    @State private var toastMessage: String?

    private let profileRepo = ProfileRepository()
    private let addressRepo = AddressRepository()
    private let authRepo = AuthRepository()

    var body: some View {
        ZStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(BuyerStrings.profileTitle)
                        .font(.system(size: 22, weight: .bold))
                    Text(BuyerStrings.profileSubtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(Color(hex: 0x6B7280))

                    if let successMessage {
                        Text(successMessage)
                            .font(.system(size: 13))
                            .foregroundStyle(Color(hex: 0x16A34A))
                    }

                    if loading {
                        BuyerFormSkeleton(fields: 5)
                    } else {
                        loginSecurityCard
                        addressesCard
                        profileLinkRow(BuyerStrings.settingsTitle, action: onOpenSettings)
                        profileLinkRow(BuyerStrings.addressesTitle, action: onOpenAddresses)

                        Text(BuyerStrings.profileLegal.uppercased())
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Color(hex: 0x9CA3AF))
                            .padding(.top, 8)
                        ForEach(profileLegalLinks(), id: \.path) { link in
                            profileLinkRow(link.title) {
                                ExternalBrowser.open(url: "\(SupabaseConfig.publicAppUrl)\(link.path)")
                            }
                        }

                        Text(BuyerStrings.profileSupport.uppercased())
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Color(hex: 0x9CA3AF))
                            .padding(.top, 8)
                        ForEach(profileSupportLinks(), id: \.path) { link in
                            profileLinkRow(link.title) {
                                ExternalBrowser.open(url: "\(SupabaseConfig.publicAppUrl)\(link.path)")
                            }
                        }
                    }
                }
                .padding(16)
                .padding(.bottom, 88)
            }
            .background(pageBg)

            if showDeleteAccount {
                Color.black.opacity(0.4)
                    .ignoresSafeArea()
                    .onTapGesture {
                        if !deletingAccount {
                            showDeleteAccount = false
                            deleteAccountError = nil
                        }
                    }
                DeleteAccountDialog(
                    deleting: deletingAccount,
                    errorMessage: deleteAccountError,
                    onDismiss: {
                        if !deletingAccount {
                            showDeleteAccount = false
                            deleteAccountError = nil
                        }
                    },
                    onConfirm: { reasonId, password in
                        Task { await deleteAccount(reasonId: reasonId, password: password) }
                    }
                )
            }

            if let toastMessage {
                VStack {
                    Spacer()
                    Text(toastMessage)
                        .font(.system(size: 14))
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Color.black.opacity(0.85))
                        .clipShape(Capsule())
                        .padding(.bottom, 88)
                }
            }
        }
        .task(id: session.userId) { await reload() }
        .alert(BuyerStrings.profileLogoutConfirmTitle, isPresented: $showLogoutConfirm) {
            Button(BuyerStrings.cancel, role: .cancel) {}
            Button(BuyerStrings.menuLogout, role: .destructive) { onLogout() }
        } message: {
            Text(BuyerStrings.profileLogoutConfirmBody)
        }
    }

    private var loginSecurityCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(BuyerStrings.profileLoginSecurity)
                .font(.system(size: 17, weight: .bold))
                .padding(.bottom, 12)

            profileEditableField(
                label: BuyerStrings.fullName,
                value: fullName,
                fieldKey: "name",
                onSave: { newName in
                    Task {
                        saving = true
                        let result = await profileRepo.updateProfile(session: session, fullName: newName, phone: nil)
                        saving = false
                        if case .success = result {
                            fullName = newName
                            editingField = nil
                            successMessage = BuyerStrings.saved
                        } else {
                            toastMessage = BuyerStrings.actionFailed
                        }
                    }
                }
            )

            profileReadOnlyField(label: BuyerStrings.email, value: email, hint: BuyerStrings.profileEmailHint)

            profileEditableField(
                label: BuyerStrings.phone,
                value: phone.isEmpty ? "—" : phone,
                fieldKey: "phone",
                onSave: { newPhone in
                    Task {
                        saving = true
                        let result = await profileRepo.updateProfile(session: session, fullName: nil, phone: newPhone)
                        saving = false
                        if case .success = result {
                            phone = newPhone
                            editingField = nil
                            successMessage = BuyerStrings.saved
                        } else {
                            toastMessage = BuyerStrings.actionFailed
                        }
                    }
                }
            )

            let countryName = countries.first(where: { $0.id == countryId })?.name ?? BuyerStrings.profileNotSet
            profileReadOnlyField(label: BuyerStrings.country, value: countryName)

            profileActionRow(BuyerStrings.profileChangePassword, action: onOpenSettings)
            profileActionRow(BuyerStrings.profileDownloadData) {
                ExternalBrowser.open(url: "\(SupabaseConfig.publicAppUrl)/contact")
            }
            profileActionRow(BuyerStrings.profileDeleteAccount) {
                deleteAccountError = nil
                showDeleteAccount = true
            }

            Text(BuyerStrings.profileLogoutDevice)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color(hex: 0xDC2626))
                .padding(.top, 12)
                .onTapGesture { showLogoutConfirm = true }
        }
        .padding(20)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(BuyerColors.cartBorder))
    }

    private var addressesCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(BuyerStrings.profileMyAddresses)
                    .font(.system(size: 17, weight: .bold))
                Spacer()
                Text(BuyerStrings.profileAddAddress)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(purple)
                    .onTapGesture(perform: onOpenAddresses)
            }

            if addresses.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "mappin.and.ellipse")
                        .foregroundStyle(Color(hex: 0x9CA3AF))
                    Text(BuyerStrings.profileNoAddresses)
                        .font(.system(size: 15, weight: .semibold))
                    Text(BuyerStrings.profileNoAddressesHint)
                        .font(.system(size: 13))
                        .foregroundStyle(Color(hex: 0x6B7280))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
            } else {
                ForEach(addresses.prefix(3), id: \.id) { address in
                    addressPreviewCard(address)
                }
                Text(BuyerStrings.profileManageAddresses)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(purple)
                    .onTapGesture(perform: onOpenAddresses)
            }
        }
        .padding(20)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(BuyerColors.cartBorder))
    }

    @ViewBuilder
    private func profileEditableField(
        label: String,
        value: String,
        fieldKey: String,
        onSave: @escaping (String) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(.system(size: 12))
                    .foregroundStyle(Color(hex: 0x6B7280))
                Spacer()
                if editingField != fieldKey {
                    Image(systemName: "pencil")
                        .font(.system(size: 14))
                        .foregroundStyle(purple)
                        .onTapGesture {
                            editingField = fieldKey
                            editValue = value == "—" ? "" : value
                        }
                }
            }
            if editingField == fieldKey {
                BuyerTextField(label: label, text: $editValue)
                HStack {
                    Button(BuyerStrings.cancel) { editingField = nil }
                    Button(BuyerStrings.save) { onSave(editValue.trimmingCharacters(in: .whitespacesAndNewlines)) }
                        .disabled(saving)
                }
            } else {
                Text(value)
                    .font(.system(size: 16, weight: .medium))
            }
        }
        .padding(.vertical, 10)
    }

    private func profileReadOnlyField(label: String, value: String, hint: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(Color(hex: 0x6B7280))
            Text(value)
                .font(.system(size: 16, weight: .medium))
            if let hint {
                Text(hint)
                    .font(.system(size: 11))
                    .foregroundStyle(Color(hex: 0x9CA3AF))
            }
        }
        .padding(.vertical, 10)
    }

    private func profileActionRow(_ label: String, action: @escaping () -> Void) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(purple)
            Spacer()
            Image(systemName: "chevron.right")
                .foregroundStyle(purple)
        }
        .padding(12)
        .background(Color(hex: 0xF5F3FF))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .padding(.vertical, 4)
        .onTapGesture(perform: action)
    }

    private func profileLinkRow(_ title: String, action: @escaping () -> Void) -> some View {
        HStack {
            Text(title)
                .font(.system(size: 15, weight: .medium))
            Spacer()
            Image(systemName: "chevron.right")
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(BuyerColors.cartBorder))
        .onTapGesture(perform: action)
    }

    private func addressPreviewCard(_ address: UserAddressRow) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(address.fullName)
                    .font(.system(size: 14, weight: .semibold))
                Spacer()
                if address.isDefault {
                    Text(BuyerStrings.defaultAddress)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(purple)
                }
            }
            Text("\(address.streetAddress1), \(address.city)")
                .font(.system(size: 13))
                .foregroundStyle(Color(hex: 0x6B7280))
        }
        .padding(12)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(hex: 0xE5E7EB)))
        .onTapGesture(perform: onOpenAddresses)
    }

    private func reload() async {
        loading = true
        let profile = await profileRepo.fetchProfile(session: session)
        countries = await authRepo.fetchCountries()
        addresses = await addressRepo.fetchAddresses(session: session)
        fullName = profile?.fullName?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            ? profile!.fullName!
            : (session.email.split(separator: "@").first.map(String.init) ?? "User")
        phone = profile?.phone ?? ""
        email = profile?.email ?? session.email
        countryId = profile?.countryId
        loading = false
    }

    private func deleteAccount(reasonId: String, password: String) async {
        deletingAccount = true
        deleteAccountError = nil
        let result = await authRepo.deleteAccount(session: session, password: password, reason: reasonId)
        deletingAccount = false
        switch result {
        case .success:
            showDeleteAccount = false
            toastMessage = BuyerStrings.deleteAccountSuccess
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { onLogout() }
        case .error(let message):
            deleteAccountError = message
        }
    }

    private struct ProfileLink {
        let title: String
        let path: String
    }

    private func profileLegalLinks() -> [ProfileLink] {
        [
            ProfileLink(title: BuyerStrings.profilePrivacyPolicy, path: "/privacy-policy"),
            ProfileLink(title: BuyerStrings.profileTermsOfService, path: "/terms-of-service"),
            ProfileLink(title: BuyerStrings.profileShippingPolicy, path: "/shipping-policy"),
            ProfileLink(title: BuyerStrings.profileRefundPolicy, path: "/refund-policy"),
            ProfileLink(title: BuyerStrings.profileTermsAndConditions, path: "/terms-and-conditions"),
        ]
    }

    private func profileSupportLinks() -> [ProfileLink] {
        [
            ProfileLink(title: BuyerStrings.profileAboutUs, path: "/about"),
            ProfileLink(title: BuyerStrings.profileContactUs, path: "/contact"),
        ]
    }
}
