import SwiftUI

struct FlyToCartRequest: Equatable {
    let imageUrl: String?
    let startCenter: CGPoint
    let startSize: CGSize
}

@Observable
final class FlyToCartController {
    var cartCenter: CGPoint = .zero
    var activeRequest: FlyToCartRequest?
    var onComplete: (() -> Void)?

    func fly(request: FlyToCartRequest, onDone: @escaping () -> Void = {}) {
        activeRequest = request
        onComplete = onDone
    }

    func clear() {
        activeRequest = nil
        onComplete = nil
    }
}

struct FlyToCartOverlay: View {
    @Bindable var controller: FlyToCartController
    let onBounceCart: () -> Void

    @State private var progress: CGFloat = 0

    var body: some View {
        if let request = controller.activeRequest {
            GeometryReader { geo in
                let endSize: CGFloat = 20
                let t = progress
                let startW = request.startSize.width
                let startH = request.startSize.height
                let currentW = startW + (endSize - startW) * t
                let currentH = startH + (endSize - startH) * t
                let currentX = request.startCenter.x + (controller.cartCenter.x - request.startCenter.x) * t
                let currentY = request.startCenter.y + (controller.cartCenter.y - request.startCenter.y) * t

                AsyncImage(url: URL(string: request.imageUrl ?? "")) { phase in
                    if let image = phase.image {
                        image
                            .resizable()
                            .scaledToFill()
                    } else {
                        Color.gray.opacity(0.3)
                    }
                }
                .frame(width: currentW, height: currentH)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .opacity(Double(1 - t))
                .position(x: currentX, y: currentY)
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .onAppear {
                progress = 0
                withAnimation(.easeInOut(duration: 0.8)) {
                    progress = 1
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                    onBounceCart()
                    controller.onComplete?()
                    controller.clear()
                }
            }
        }
    }
}
