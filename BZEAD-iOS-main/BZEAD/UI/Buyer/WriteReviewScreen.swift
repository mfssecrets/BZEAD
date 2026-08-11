import SwiftUI

private let pageBg = Color(hex: 0xF3F4F6)
private let starColor = Color(hex: 0xF69931)
private let focusPurple = Color(hex: 0x6D28D9)
private let navy = Color(hex: 0x0B2A66)

struct WriteReviewScreen: View {
    let session: BuyerSession
    let productId: String
    let productName: String
    let destinationCountry: String
    let onBack: () -> Void
    let onSubmitted: () -> Void

    @State private var loading = true
    @State private var loadError = false
    @State private var product: ProductDetail?
    @State private var unitPrice: Double?
    @State private var rating = 0
    @State private var heading = ""
    @State private var comment = ""
    @State private var agreeToTerms = false
    @State private var selectedBenefits: Set<String> = []
    @State private var submitting = false
    @State private var submitError: String?
    @State private var toastMessage: String?

    private let productRepo = ProductRepository()
    private let pricingRepo = ProductPricingRepository()
    private let reviewRepo = ReviewRepository()

    private var canSubmit: Bool {
        !submitting && rating > 0 && !heading.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !comment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && agreeToTerms
    }

    var body: some View {
        ZStack {
            Group {
                if loading {
                    BuyerFormSkeleton(fields: 6)
                        .padding(16)
                } else if loadError {
                    VStack {
                        Text(BuyerStrings.writeReviewLoadError)
                            .font(.system(size: 18, weight: .bold))
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let p = product {
                    ScrollView {
                        VStack(spacing: 12) {
                            card {
                                Text(BuyerStrings.writeReviewTitle)
                                    .font(.system(size: 20, weight: .bold))
                                Text(BuyerStrings.writeReviewSubtitle)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Color(hex: 0x6B7280))
                                    .padding(.top, 4)
                            }

                            HStack(spacing: 12) {
                                AsyncImage(url: URL(string: p.imageUrl ?? "")) { phase in
                                    if let image = phase.image {
                                        image.resizable().scaledToFill()
                                    } else {
                                        Color(hex: 0xF3F4F6)
                                    }
                                }
                                .frame(width: 72, height: 72)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                VStack(alignment: .leading) {
                                    Text(p.name)
                                        .font(.system(size: 15, weight: .semibold))
                                    if let unitPrice {
                                        Text(formatCurrency(amount: unitPrice, currency: p.currency))
                                            .font(.system(size: 15, weight: .bold))
                                            .padding(.top, 4)
                                    }
                                }
                                Spacer()
                            }
                            .padding(12)
                            .background(Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: 0xE5E7EB)))

                            card {
                                if let submitError {
                                    Text(submitError)
                                        .font(.system(size: 13))
                                        .foregroundStyle(Color(hex: 0xDC2626))
                                        .padding(.bottom, 8)
                                }
                                Text(BuyerStrings.writeReviewRating)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Color(hex: 0x555555))
                                HStack(spacing: 4) {
                                    ForEach(1...5, id: \.self) { star in
                                        Image(systemName: star <= rating ? "star.fill" : "star")
                                            .font(.system(size: 32))
                                            .foregroundStyle(star <= rating ? starColor : Color(hex: 0xD1D5DB))
                                            .onTapGesture { rating = star }
                                    }
                                }
                                .padding(.vertical, 8)
                                Text(ratingLabel(rating))
                                    .font(.system(size: 12))
                                    .foregroundStyle(Color(hex: 0x6B7280))

                                BuyerTextField(label: BuyerStrings.writeReviewHeading, text: $heading)
                                    .padding(.top, 12)
                                    .onChange(of: heading) { _, new in
                                        if new.count > 100 { heading = String(new.prefix(100)) }
                                    }

                                VStack(alignment: .leading, spacing: 6) {
                                    Text(BuyerStrings.writeReviewComment)
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(BuyerFieldStyle.labelMuted)
                                    TextEditor(text: $comment)
                                        .frame(height: 120)
                                        .font(.system(size: 16))
                                        .foregroundStyle(Color.black)
                                        .scrollContentBackground(.hidden)
                                        .padding(8)
                                        .background(Color.white)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 8)
                                                .stroke(BuyerFieldStyle.unfocusedBorder, lineWidth: 1)
                                        )
                                        .onChange(of: comment) { _, new in
                                            if new.count > 5000 { comment = String(new.prefix(5000)) }
                                        }
                                }
                                .padding(.top, 12)

                                Text(BuyerStrings.writeReviewBenefits)
                                    .font(.system(size: 13, weight: .semibold))
                                    .padding(.top, 12)
                                ForEach(reviewBenefits(), id: \.self) { benefit in
                                    Toggle(isOn: Binding(
                                        get: { selectedBenefits.contains(benefit) },
                                        set: { on in
                                            if on { selectedBenefits.insert(benefit) }
                                            else { selectedBenefits.remove(benefit) }
                                        }
                                    )) {
                                        Text(benefit).font(.system(size: 13))
                                    }
                                    .tint(focusPurple)
                                }

                                Toggle(isOn: $agreeToTerms) {
                                    Text(BuyerStrings.writeReviewTerms)
                                        .font(.system(size: 12))
                                        .foregroundStyle(Color(hex: 0x6B7280))
                                }
                                .tint(focusPurple)
                                .padding(.top, 8)
                            }

                            HStack(spacing: 10) {
                                Text(BuyerStrings.cancel)
                                    .font(.system(size: 15, weight: .semibold))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 14)
                                    .background(Color(hex: 0xE5E7EB))
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                    .onTapGesture { onBack() }

                                Button {
                                    Task { await submitReview(product: p) }
                                } label: {
                                    Group {
                                        if submitting {
                                            ProgressView().tint(.white)
                                        } else {
                                            Text(BuyerStrings.writeReviewSubmit)
                                                .font(.system(size: 15, weight: .bold))
                                        }
                                    }
                                    .foregroundStyle(Color.white)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 14)
                                    .background(canSubmit ? navy : Color(hex: 0x9CA3AF))
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                }
                                .disabled(!canSubmit)
                            }
                        }
                        .padding(16)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(pageBg)

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
        .task(id: "\(productId)|\(destinationCountry)") { await loadProduct() }
    }

    @ViewBuilder
    private func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: 0xE5E7EB)))
    }

    private func loadProduct() async {
        loading = true
        loadError = false
        guard let loaded = await productRepo.fetchById(productId) else {
            loadError = true
            loading = false
            return
        }
        product = loaded
        let prices = await pricingRepo.fetchPublicPricesWithFallback(
            productIds: [loaded.id],
            countryCandidates: [destinationCountry],
            productCurrencies: [loaded.id: loaded.currency ?? "INR"]
        )
        unitPrice = prices[loaded.id]?.displayUnitPrice ?? prices[loaded.id]?.publicUnitPrice ?? loaded.price
        loading = false
    }

    private func submitReview(product: ProductDetail) async {
        submitting = true
        submitError = nil
        if await reviewRepo.hasExistingReview(session: session, productId: product.id) {
            submitError = BuyerStrings.writeReviewDuplicate
            submitting = false
            return
        }
        let result = await reviewRepo.submitReview(
            session: session,
            productId: product.id,
            rating: rating,
            heading: heading,
            comment: comment
        )
        submitting = false
        if case .success = result {
            toastMessage = BuyerStrings.writeReviewSuccess
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { onSubmitted() }
        } else {
            submitError = BuyerStrings.actionFailed
        }
    }

    private func ratingLabel(_ rating: Int) -> String {
        switch rating {
        case 1: return BuyerStrings.writeReviewRatingPoor
        case 2: return BuyerStrings.writeReviewRatingFair
        case 3: return BuyerStrings.writeReviewRatingGood
        case 4: return BuyerStrings.writeReviewRatingVeryGood
        case 5: return BuyerStrings.writeReviewRatingExcellent
        default: return ""
        }
    }

    private func reviewBenefits() -> [String] {
        ["Value for Money", "Quality", "Durability", "Design", "Performance"]
    }
}
