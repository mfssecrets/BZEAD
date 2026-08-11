import SwiftUI

private let skeletonBase = Color(hex: 0xE5E7EB)

struct BuyerSkeletonBox: View {
    var cornerRadius: CGFloat = 6
    var color: Color = skeletonBase
    @State private var pulse = false

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(color.opacity(pulse ? 1 : 0.55))
            .onAppear {
                withAnimation(.linear(duration: 0.9).repeatForever(autoreverses: true)) {
                    pulse = true
                }
            }
    }
}

struct BuyerInlineSkeleton: View {
    let width: CGFloat
    let height: CGFloat
    var cornerRadius: CGFloat = 4
    var color: Color = skeletonBase

    var body: some View {
        BuyerSkeletonBox(cornerRadius: cornerRadius, color: color)
            .frame(width: width, height: height)
    }
}

struct BuyerProductCardSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            BuyerSkeletonBox(cornerRadius: 12)
                .aspectRatio(3 / 4, contentMode: .fit)
            VStack(alignment: .leading, spacing: 6) {
                BuyerSkeletonBox().frame(height: 10)
                BuyerSkeletonBox().frame(width: 80, height: 10)
                BuyerSkeletonBox().frame(width: 60, height: 14)
            }
            .padding(8)
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: 0xF3F4F6), lineWidth: 1))
    }
}

struct BuyerProductGridSkeleton: View {
    let count: Int
    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 12) {
            ForEach(0..<count, id: \.self) { _ in
                BuyerProductCardSkeleton()
            }
        }
    }
}

struct BuyerListRowSkeleton: View {
    var withThumb: Bool = false

    var body: some View {
        HStack(spacing: 12) {
            if withThumb {
                BuyerSkeletonBox(cornerRadius: 8).frame(width: 64, height: 64)
            }
            VStack(alignment: .leading, spacing: 6) {
                BuyerSkeletonBox().frame(height: 12)
                BuyerSkeletonBox().frame(height: 10)
                BuyerSkeletonBox().frame(width: 80, height: 10)
            }
            Spacer()
            BuyerSkeletonBox().frame(width: 48, height: 20)
        }
        .padding(12)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: 0xF3F4F6), lineWidth: 1))
    }
}

struct BuyerListSkeleton: View {
    let rows: Int
    var withThumb: Bool = false

    var body: some View {
        VStack(spacing: 10) {
            ForEach(0..<rows, id: \.self) { _ in
                BuyerListRowSkeleton(withThumb: withThumb)
            }
        }
    }
}

struct BuyerDetailSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            BuyerSkeletonBox(cornerRadius: 16).aspectRatio(1, contentMode: .fit)
            BuyerSkeletonBox().frame(width: 200, height: 20)
            BuyerSkeletonBox().frame(width: 100, height: 14)
            BuyerSkeletonBox().frame(width: 140, height: 28)
            VStack(spacing: 8) {
                BuyerSkeletonBox().frame(height: 12)
                BuyerSkeletonBox().frame(height: 12)
                BuyerSkeletonBox().frame(width: 180, height: 12)
            }
            HStack(spacing: 12) {
                BuyerSkeletonBox(cornerRadius: 8).frame(height: 44)
                BuyerSkeletonBox(cornerRadius: 8).frame(height: 44)
            }
        }
        .padding(16)
    }
}

struct BuyerCheckoutPanelSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            BuyerSkeletonBox().frame(width: 120, height: 14)
            ForEach(0..<4, id: \.self) { _ in
                HStack {
                    BuyerSkeletonBox().frame(width: 100, height: 12)
                    Spacer()
                    BuyerSkeletonBox().frame(width: 64, height: 12)
                }
            }
            BuyerSkeletonBox(cornerRadius: 8).frame(height: 44)
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(BuyerColors.cartBorder, lineWidth: 1))
    }
}

struct BuyerFormSkeleton: View {
    let fields: Int

    var body: some View {
        VStack(spacing: 14) {
            ForEach(0..<fields, id: \.self) { _ in
                VStack(alignment: .leading, spacing: 6) {
                    BuyerSkeletonBox().frame(width: 80, height: 10)
                    BuyerSkeletonBox(cornerRadius: 8).frame(height: 44)
                }
            }
        }
    }
}

struct BuyerPriceBlockSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            BuyerSkeletonBox().frame(width: 120, height: 12)
            BuyerSkeletonBox().frame(width: 160, height: 34)
            BuyerSkeletonBox().frame(width: 140, height: 10)
        }
    }
}

struct BuyerCatalogPageSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                BuyerSkeletonBox().frame(width: 48, height: 10)
                BuyerSkeletonBox().frame(width: 64, height: 10)
            }
            BuyerSkeletonBox().frame(width: 200, height: 24)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(0..<4, id: \.self) { _ in
                        BuyerSkeletonBox(cornerRadius: 16).frame(width: 88, height: 32)
                    }
                }
            }
            BuyerProductGridSkeleton(count: 6)
        }
        .padding(16)
    }
}
