import SwiftUI

private let amber = Color(hex: 0xF59E0B)

struct BuyerAddressesScreen: View {
    let session: BuyerSession
    let onBack: () -> Void

    @State private var loading = true
    @State private var addresses: [UserAddressRow] = []
    @State private var showForm = false
    @State private var editing: UserAddressRow?
    @State private var successMessage: String?
    @State private var deleteTarget: UserAddressRow?
    @State private var toastMessage: String?

    private let repo = AddressRepository()

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                BuyerSubTopBar(title: BuyerStrings.addressesTitle, onBack: onBack)

                VStack(alignment: .leading, spacing: 4) {
                    Text(BuyerStrings.addressesSubtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(Color(hex: 0x6B7280))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)

                if let successMessage {
                    Text(successMessage)
                        .font(.system(size: 13))
                        .foregroundStyle(Color(hex: 0x16A34A))
                        .padding(.horizontal, 16)
                }

                if showForm || editing != nil {
                    AddressFormView(
                        initial: editing,
                        session: session,
                        isFirstAddress: addresses.isEmpty,
                        onCancel: { showForm = false; editing = nil },
                        onSaved: {
                            showForm = false
                            editing = nil
                            successMessage = BuyerStrings.saved
                            Task { await refresh() }
                        },
                        onError: { toastMessage = BuyerStrings.actionFailed }
                    )
                } else if loading {
                    BuyerListSkeleton(rows: 4)
                        .padding(16)
                    Spacer()
                } else if addresses.isEmpty {
                    addressEmptyState
                } else {
                    ScrollView {
                        VStack(spacing: 12) {
                            ForEach(addresses, id: \.id) { address in
                                AddressCardView(
                                    address: address,
                                    canDelete: !address.isDefault && addresses.count > 1,
                                    onEdit: { editing = address },
                                    onDelete: { deleteTarget = address },
                                    onSetDefault: {
                                        Task {
                                            _ = await repo.setDefault(session: session, addressId: address.id)
                                            await refresh()
                                        }
                                    }
                                )
                            }
                        }
                        .padding(16)
                    }
                    Button {
                        showForm = true
                    } label: {
                        Text(BuyerStrings.addAddress)
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(Color.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(amber)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .padding(16)
                }
            }
            .background(Color.white)

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
                        .padding(.bottom, 24)
                }
            }
        }
        .task(id: session.userId) { await refresh() }
        .alert(BuyerStrings.addressesDeleteTitle, isPresented: Binding(
            get: { deleteTarget != nil },
            set: { if !$0 { deleteTarget = nil } }
        )) {
            Button(BuyerStrings.cancel, role: .cancel) { deleteTarget = nil }
            Button(BuyerStrings.addressesDeleteConfirm, role: .destructive) {
                if let address = deleteTarget {
                    Task {
                        _ = await repo.deleteAddress(session: session, addressId: address.id)
                        deleteTarget = nil
                        await refresh()
                    }
                }
            }
        } message: {
            Text(BuyerStrings.addressesDeleteMessage)
        }
    }

    private var addressEmptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "mappin.and.ellipse")
                .font(.system(size: 48))
                .foregroundStyle(Color(hex: 0x9CA3AF))
            Text(BuyerStrings.addressesEmptyTitle)
                .font(.system(size: 18, weight: .bold))
            Text(BuyerStrings.addressesEmptyHint)
                .foregroundStyle(Color(hex: 0x6B7280))
            Button(BuyerStrings.addressesAddFirst) { showForm = true }
                .buttonStyle(.borderedProminent)
                .tint(amber)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(32)
    }

    private func refresh() async {
        loading = true
        addresses = await repo.fetchAddresses(session: session)
        loading = false
    }
}

private struct AddressCardView: View {
    let address: UserAddressRow
    let canDelete: Bool
    let onEdit: () -> Void
    let onDelete: () -> Void
    let onSetDefault: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: addressTypeIcon(address.addressType))
                    .foregroundStyle(Color(hex: 0xF59E0B))
                Text(address.addressType.capitalized)
                    .font(.system(size: 14, weight: .semibold))
                Spacer()
                if address.isDefault {
                    Text(BuyerStrings.defaultAddress)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Color(hex: 0xF59E0B))
                }
            }
            Text(address.fullName)
                .font(.system(size: 15, weight: .bold))
            if let phone = address.phoneNumber, !phone.isEmpty {
                Text(phone).font(.system(size: 13)).foregroundStyle(Color(hex: 0x6B7280))
            }
            if let email = address.email, !email.isEmpty {
                Text(email).font(.system(size: 13)).foregroundStyle(Color(hex: 0x6B7280))
            }
            Text("\(address.streetAddress1)\(address.streetAddress2.map { ", \($0)" } ?? "")")
                .font(.system(size: 13))
            Text("\(address.city), \(address.state) \(address.postalCode)")
                .font(.system(size: 13))
                .foregroundStyle(Color(hex: 0x6B7280))
            Text(address.country)
                .font(.system(size: 13))
                .foregroundStyle(Color(hex: 0x6B7280))
            if let notes = address.deliveryNotes, !notes.isEmpty {
                Text(notes).font(.system(size: 12)).foregroundStyle(Color(hex: 0x9CA3AF))
            }
            HStack {
                Button(BuyerStrings.edit, action: onEdit)
                    .font(.system(size: 14))
                    .foregroundStyle(Color(hex: 0x2563EB))
                if !address.isDefault {
                    Button(BuyerStrings.setDefault, action: onSetDefault)
                        .font(.system(size: 14))
                        .foregroundStyle(Color(hex: 0xF59E0B))
                }
                if canDelete {
                    Button(action: onDelete) {
                        Image(systemName: "trash")
                            .foregroundStyle(Color(hex: 0xDC2626))
                    }
                }
            }
        }
        .padding(16)
        .background(Color(hex: 0xF9FAFB))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: 0xE5E7EB)))
    }

    private func addressTypeIcon(_ type: String) -> String {
        switch type.lowercased() {
        case "work", "office": return "briefcase.fill"
        case "home": return "house.fill"
        default: return "mappin.circle.fill"
        }
    }
}

private struct AddressFormView: View {
    let initial: UserAddressRow?
    let session: BuyerSession
    let isFirstAddress: Bool
    let onCancel: () -> Void
    let onSaved: () -> Void
    let onError: () -> Void

    @State private var fullName = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var street1 = ""
    @State private var street2 = ""
    @State private var city = ""
    @State private var state = ""
    @State private var postal = ""
    @State private var country = ""
    @State private var addressType = "home"
    @State private var deliveryNotes = ""
    @State private var isDefault = false
    @State private var saving = false

    private let repo = AddressRepository()

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                BuyerTextField(label: BuyerStrings.fullName, text: $fullName)
                BuyerTextField(label: BuyerStrings.phone, text: $phone, keyboardType: .phonePad)
                BuyerTextField(label: BuyerStrings.email, text: $email, keyboardType: .emailAddress)
                BuyerTextField(label: BuyerStrings.street, text: $street1)
                BuyerTextField(label: BuyerStrings.street2, text: $street2)
                BuyerTextField(label: BuyerStrings.city, text: $city)
                BuyerTextField(label: BuyerStrings.state, text: $state)
                BuyerTextField(label: BuyerStrings.postalCode, text: $postal)
                BuyerTextField(label: BuyerStrings.country, text: $country)
                BuyerTextField(label: BuyerStrings.addressesDeliveryNotes, text: $deliveryNotes)
                Toggle(BuyerStrings.defaultAddress, isOn: $isDefault)
                    .tint(Color(hex: 0xF59E0B))
                HStack(spacing: 12) {
                    Button(BuyerStrings.cancel, action: onCancel)
                        .frame(maxWidth: .infinity)
                    Button(BuyerStrings.save) {
                        Task { await save() }
                    }
                    .frame(maxWidth: .infinity)
                    .buttonStyle(.borderedProminent)
                    .tint(Color(hex: 0xF59E0B))
                    .disabled(saving || !canSave)
                }
            }
            .padding(16)
        }
        .onAppear {
            if let initial {
                fullName = initial.fullName
                phone = initial.phoneNumber ?? ""
                email = initial.email ?? ""
                street1 = initial.streetAddress1
                street2 = initial.streetAddress2 ?? ""
                city = initial.city
                state = initial.state
                postal = initial.postalCode
                country = initial.country
                addressType = initial.addressType
                deliveryNotes = initial.deliveryNotes ?? ""
                isDefault = initial.isDefault
            } else {
                isDefault = isFirstAddress
                email = session.email
            }
        }
    }

    private var canSave: Bool {
        !fullName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !street1.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !city.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !country.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func save() async {
        saving = true
        let row = UserAddressRow(
            id: initial?.id ?? "",
            userId: session.userId,
            fullName: fullName.trimmingCharacters(in: .whitespacesAndNewlines),
            phoneNumber: phone.trimmingCharacters(in: .whitespacesAndNewlines),
            email: email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? session.email : email.trimmingCharacters(in: .whitespacesAndNewlines),
            country: country.trimmingCharacters(in: .whitespacesAndNewlines),
            streetAddress1: street1.trimmingCharacters(in: .whitespacesAndNewlines),
            streetAddress2: street2.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : street2.trimmingCharacters(in: .whitespacesAndNewlines),
            city: city.trimmingCharacters(in: .whitespacesAndNewlines),
            state: state.trimmingCharacters(in: .whitespacesAndNewlines),
            postalCode: postal.trimmingCharacters(in: .whitespacesAndNewlines),
            addressType: addressType,
            deliveryNotes: deliveryNotes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : deliveryNotes.trimmingCharacters(in: .whitespacesAndNewlines),
            isDefault: isDefault
        )
        let result: Result<Void, Error>
        if let initial {
            result = await repo.updateAddress(session: session, addressId: initial.id, address: row)
        } else {
            switch await repo.createAddress(session: session, address: row) {
            case .success: result = .success(())
            case .failure(let error): result = .failure(error)
            }
        }
        saving = false
        if case .success = result {
            onSaved()
        } else {
            onError()
        }
    }
}
