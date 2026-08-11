import SwiftUI

struct InlineSkeleton: View {
    var width: CGFloat
    var height: CGFloat
    var cornerRadius: CGFloat = 4
    var color: Color = BzeadColors.skeletonBase

    @State private var pulse = false

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(color.opacity(pulse ? 1.0 : 0.55))
            .frame(width: width, height: height)
            .onAppear {
                withAnimation(.linear(duration: 0.9).repeatForever(autoreverses: true)) {
                    pulse = true
                }
            }
    }
}

struct AuthFormSkeleton: View {
    var fields: Int = 3

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(0..<fields, id: \.self) { _ in
                VStack(alignment: .leading, spacing: 6) {
                    InlineSkeleton(width: 96, height: 10, color: Color.white.opacity(0.35))
                    InlineSkeleton(
                        width: UIScreen.main.bounds.width - 56,
                        height: 56,
                        cornerRadius: 14,
                        color: Color.white.opacity(0.18)
                    )
                }
            }
        }
    }
}

struct HomePageSkeleton: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(spacing: 8) {
                    InlineSkeleton(width: UIScreen.main.bounds.width - 32, height: 40, cornerRadius: 8)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(Color(hex: 0xF9FAFB))

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(0..<6, id: \.self) { _ in
                            InlineSkeleton(width: 72, height: 40, cornerRadius: 8)
                        }
                    }
                }

                InlineSkeleton(width: UIScreen.main.bounds.width - 32, height: 160, cornerRadius: 16)
                InlineSkeleton(width: (UIScreen.main.bounds.width - 32) * 0.55, height: 18)
                ProductGridSkeleton(count: 4)
                InlineSkeleton(width: (UIScreen.main.bounds.width - 32) * 0.45, height: 18)
                ProductGridSkeleton(count: 4)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }
}

private struct ProductGridSkeleton: View {
    let count: Int
    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 12) {
            ForEach(0..<count, id: \.self) { _ in
                ProductCardSkeleton()
            }
        }
    }
}

private struct ProductCardSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            InlineSkeleton(
                width: UIScreen.main.bounds.width / 2 - 22,
                height: (UIScreen.main.bounds.width / 2 - 22) * 4 / 3,
                cornerRadius: 12
            )
            VStack(alignment: .leading, spacing: 6) {
                InlineSkeleton(width: (UIScreen.main.bounds.width / 2 - 22) * 0.9, height: 10)
                InlineSkeleton(width: (UIScreen.main.bounds.width / 2 - 22) * 0.6, height: 10)
                InlineSkeleton(width: (UIScreen.main.bounds.width / 2 - 22) * 0.45, height: 14)
            }
            .padding(8)
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color(hex: 0xF3F4F6), lineWidth: 1)
        )
    }
}
