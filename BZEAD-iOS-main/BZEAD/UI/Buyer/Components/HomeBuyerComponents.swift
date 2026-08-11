import SwiftUI

struct HomeSearchBar: View {
    @Binding var query: String
    let onSearch: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14))
                        .foregroundStyle(Color(hex: 0x6B7280))
                    ZStack(alignment: .leading) {
                        if query.isEmpty {
                            Text(BuyerStrings.homeSearchHint)
                                .font(.system(size: 14))
                                .foregroundStyle(Color(hex: 0x9CA3AF))
                        }
                        TextField("", text: $query)
                            .font(.system(size: 14))
                            .foregroundStyle(Color(hex: 0x111827))
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                }
                .padding(.horizontal, 12)
                .frame(height: 40)
                .background(Color.white)
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(Color(hex: 0xE5E7EB), lineWidth: 2)
                )
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                Button(action: onSearch) {
                    Text(BuyerStrings.homeSearchGo)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, 24)
                        .frame(height: 40)
                        .background(BuyerColors.searchGoBlack)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .frame(maxWidth: .infinity)
        .background(Color(hex: 0xF9FAFB))
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color(hex: 0xE5E7EB)).frame(height: 1)
        }
    }
}

struct HomeCategoryBar: View {
    let categories: [CategoryRow]
    let onCategoryClick: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "line.3.horizontal")
                        .font(.system(size: 12))
                        .foregroundStyle(Color.white)
                    Text(BuyerStrings.homeCategoryAll)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color.white)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(Color.white.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))

                Rectangle()
                    .fill(Color.white.opacity(0.2))
                    .frame(width: 1, height: 20)

                ForEach(categories, id: \.id) { category in
                    let slug = category.slug ?? ""
                    Button {
                        if !slug.isEmpty { onCategoryClick(slug) }
                    } label: {
                        Text(category.name ?? "")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Color(hex: 0xE5E7EB))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
        }
        .frame(height: 40)
        .frame(maxWidth: .infinity)
        .background(BuyerColors.headerBg)
    }
}

struct HomeHeroCarousel: View {
    let banners: [HomeBanner]

    @State private var current = 0
    @State private var slideWidth: CGFloat = 0

    var body: some View {
        if banners.isEmpty { EmptyView() }
        else {
            ZStack(alignment: .bottom) {
                GeometryReader { geo in
                    let width = geo.size.width
                    HStack(spacing: 0) {
                        ForEach(Array(banners.enumerated()), id: \.offset) { _, banner in
                            AsyncImage(url: URL(string: banner.imageUrl)) { phase in
                                if let image = phase.image {
                                    image.resizable().scaledToFill()
                                } else {
                                    Color(hex: 0xE5E7EB)
                                }
                            }
                            .frame(width: width, height: 160)
                            .clipped()
                            .contentShape(Rectangle())
                            .onTapGesture {
                                if let link = banner.link?.trimmingCharacters(in: .whitespacesAndNewlines), !link.isEmpty {
                                    ExternalBrowser.open(url: link)
                                }
                            }
                        }
                    }
                    .offset(x: -CGFloat(current) * width)
                    .animation(.easeInOut(duration: 0.5), value: current)
                    .onAppear { slideWidth = width }
                    .onChange(of: width) { _, newWidth in slideWidth = newWidth }
                }
                .frame(height: 160)

                if banners.count > 1 {
                    HStack(spacing: 6) {
                        ForEach(banners.indices, id: \.self) { index in
                            Button {
                                current = index
                            } label: {
                                Capsule()
                                    .fill(index == current ? Color(hex: 0xF59E0B) : Color(hex: 0xD1D5DB))
                                    .frame(width: index == current ? 24 : 6, height: 6)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.bottom, 8)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 160)
            .clipped()
            .task(id: banners.count) {
                guard banners.count > 1 else { return }
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 5_000_000_000)
                    current = (current + 1) % banners.count
                }
            }
        }
    }
}

struct HomeAdBannerCarousel: View {
    let banners: [HomeBanner]

    @State private var current = 0

    var body: some View {
        if banners.isEmpty { EmptyView() }
        else {
            VStack(spacing: 0) {
                ZStack(alignment: .bottom) {
                    GeometryReader { geo in
                        let width = geo.size.width
                        HStack(spacing: 0) {
                            ForEach(Array(banners.enumerated()), id: \.offset) { _, banner in
                                AsyncImage(url: URL(string: banner.imageUrl)) { phase in
                                    if let image = phase.image {
                                        image.resizable().scaledToFill()
                                    } else {
                                        Color(hex: 0xE5E7EB)
                                    }
                                }
                                .frame(width: width, height: 150)
                                .clipped()
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    if let link = banner.link?.trimmingCharacters(in: .whitespacesAndNewlines), !link.isEmpty {
                                        ExternalBrowser.open(url: link)
                                    }
                                }
                            }
                        }
                        .offset(x: -CGFloat(current) * width)
                        .animation(.easeInOut(duration: 0.7), value: current)
                    }
                    .frame(height: 150)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                    if banners.count > 1 {
                        HStack(spacing: 6) {
                            ForEach(banners.indices, id: \.self) { index in
                                Button {
                                    current = index
                                } label: {
                                    Circle()
                                        .fill(index == current ? Color(hex: 0xF59E0B) : Color(hex: 0xD1D5DB))
                                        .frame(width: 6, height: 6)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.bottom, 8)
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.vertical, 16)
            .task(id: banners.count) {
                guard banners.count > 1 else { return }
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 7_000_000_000)
                    current = (current + 1) % banners.count
                }
            }
        }
    }
}
