import SwiftUI

struct LoadingScreen: View {
    var body: some View {
        ZStack {
            Color.white
                .ignoresSafeArea()

            HomePageSkeleton()
        }
    }
}

#Preview {
    LoadingScreen()
}
