package com.bzead.apk.ui.buyer

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import com.bzead.apk.R
import com.bzead.apk.data.BuyerBadgeRepository
import com.bzead.apk.data.BuyerBadges
import com.bzead.apk.data.CurrencyPreferencesRepository
import com.bzead.apk.data.DestinationCountryRepository
import com.bzead.apk.data.LocationRepository
import com.bzead.apk.data.ProfileRepository
import com.bzead.apk.data.SupabaseConfig
import com.bzead.apk.push.PushNotificationManager
import com.bzead.apk.data.model.BuyerSession
import com.bzead.apk.data.model.UserAddressRow
import com.bzead.apk.data.model.toSlug
import com.bzead.apk.data.pricing.ShippingTier
import com.bzead.apk.ui.buyer.components.FlyToCartController
import com.bzead.apk.ui.buyer.components.FlyToCartOverlay
import com.bzead.apk.ui.buyer.CategoryProductsScreen
import com.bzead.apk.ui.buyer.checkout.CheckoutPaymentScreen
import com.bzead.apk.ui.buyer.checkout.CheckoutReviewScreen
import com.bzead.apk.ui.buyer.checkout.CheckoutShippingScreen
import com.bzead.apk.ui.buyer.navigation.BuyerNavRoute
import com.bzead.apk.util.ExternalBrowser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun BuyerMainScreen(
    session: BuyerSession,
    onLogout: () -> Unit,
    pendingOrderId: String? = null,
    openNotificationsTab: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val badgeRepository = remember { BuyerBadgeRepository() }
    val locationRepository = remember { LocationRepository(context.applicationContext) }
    val countryRepository = remember { DestinationCountryRepository() }
    val profileRepository = remember { ProfileRepository() }

    var selectedTab by remember { mutableStateOf(BuyerTab.Home) }
    var navStack by remember { mutableStateOf<List<BuyerNavRoute>>(emptyList()) }
    var checkoutAddress by remember { mutableStateOf<UserAddressRow?>(null) }
    var checkoutShippingTier by remember { mutableStateOf(ShippingTier.Standard) }
    var badges by remember { mutableStateOf(BuyerBadges()) }
    var locationLabel by remember { mutableStateOf(context.getString(R.string.location_detect_hint)) }
    var locationLoading by remember { mutableStateOf(false) }
    var destinationCountry by remember {
        mutableStateOf(DestinationCountryRepository.GUEST_FALLBACK)
    }
    var userDisplayName by remember {
        mutableStateOf(session.email.substringBefore("@").ifBlank { "User" })
    }
    var currencyCode by remember { mutableStateOf("INR") }
    var currencyLoading by remember { mutableStateOf(false) }
    var lastBackPress by remember { mutableLongStateOf(0L) }
    var cartBounceTrigger by remember { mutableStateOf(0) }
    val flyToCartController = remember { FlyToCartController() }
    // Saved profile country id (signed-in users always have one) — used to decide
    // whether a manually-detected location should overwrite the profile country.
    var profileCountryId by remember { mutableStateOf<String?>(null) }

    fun push(route: BuyerNavRoute) {
        navStack = navStack + route
    }

    fun pop() {
        if (navStack.isNotEmpty()) {
            navStack = navStack.dropLast(1)
            if (navStack.none {
                    it is BuyerNavRoute.CheckoutShipping ||
                        it is BuyerNavRoute.CheckoutReview ||
                        it is BuyerNavRoute.CheckoutPayment
                }
            ) {
                checkoutAddress = null
                checkoutShippingTier = ShippingTier.Standard
            }
        }
    }

    fun refreshBadges() {
        scope.launch {
            badges = withContext(Dispatchers.IO) { badgeRepository.fetchBadges(session) }
        }
    }

    fun refreshPricingCountry() {
        scope.launch {
            val profileCountry = withContext(Dispatchers.IO) {
                countryRepository.fetchProfileCountry(session)
            }
            profileCountryId = profileCountry?.id
            destinationCountry = withContext(Dispatchers.IO) {
                countryRepository.resolveCountry(session, locationRepository)
            }
            // Header shows the saved profile country name for signed-in users.
            profileCountry?.name?.takeIf { it.isNotBlank() }?.let { locationLabel = it }
        }
    }

    // Manual location detection: align the profile country (and currency) with the
    // detected country when they differ. Same country or failed fetch → no change.
    suspend fun syncProfileCountryToDetected(country: String, iso2: String) {
        val detected = withContext(Dispatchers.IO) {
            countryRepository.lookupCountryByLocation(country, iso2)
        } ?: return
        if (detected.id == profileCountryId) return

        val result = withContext(Dispatchers.IO) {
            profileRepository.updateProfile(
                session = session,
                fullName = null,
                phone = null,
                countryId = detected.id,
                currency = detected.currencyCode.ifBlank { null },
            )
        }
        if (result.isFailure) return

        profileCountryId = detected.id
        if (detected.currencyCode.isNotBlank()) {
            withContext(Dispatchers.IO) { CurrencyPreferencesRepository.save(detected.currencyCode) }
            currencyCode = detected.currencyCode
        }
        refreshPricingCountry()
    }

    suspend fun runManualDetect() {
        locationLoading = true
        val result = withContext(Dispatchers.IO) { locationRepository.detectLocation() }
        locationLoading = false
        result.onSuccess { loc ->
            if (loc.label().isNotBlank()) locationLabel = loc.label()
            syncProfileCountryToDetected(loc.country, loc.countryCode)
        }
    }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) {
        scope.launch {
            PushNotificationManager.requestPermission(fallbackToSettings = true)
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        val granted = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) {
            scope.launch { runManualDetect() }
        } else {
            Toast.makeText(context, context.getString(R.string.location_permission_denied), Toast.LENGTH_SHORT).show()
        }
    }

    fun requestLocation() {
        if (locationRepository.hasPermission()) {
            scope.launch { runManualDetect() }
        } else {
            permissionLauncher.launch(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
            )
        }
    }

    LaunchedEffect(session.userId, pendingOrderId, openNotificationsTab) {
        when {
            !pendingOrderId.isNullOrBlank() -> {
                selectedTab = BuyerTab.Orders
                navStack = listOf(BuyerNavRoute.OrderDetail(pendingOrderId))
            }
            openNotificationsTab -> {
                selectedTab = BuyerTab.Notifications
                navStack = emptyList()
            }
        }
        if (!PushNotificationManager.isConfigured()) return@LaunchedEffect
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                PushNotificationManager.requestPermission(fallbackToSettings = true)
            }
        } else {
            PushNotificationManager.requestPermission(fallbackToSettings = true)
        }
    }

    LaunchedEffect(session.userId) {
        refreshBadges()
        currencyCode = withContext(Dispatchers.IO) { CurrencyPreferencesRepository.read() }
        val profile = withContext(Dispatchers.IO) { ProfileRepository().fetchProfile(session) }
        userDisplayName = profile?.fullName?.trim()?.takeIf { it.isNotBlank() }
            ?: session.email.substringBefore("@").ifBlank { "User" }
        // Signed-in users always have a profile country: show it and never auto-detect.
        // Location is only fetched when the user taps the location icon (requestLocation()).
        refreshPricingCountry()
    }

    LaunchedEffect(navStack.size, selectedTab) {
        delay(1_500)
        refreshBadges()
    }

    val currentRoute = navStack.lastOrNull()
    val showBottomBar = currentRoute == null ||
        currentRoute is BuyerNavRoute.Cart ||
        currentRoute is BuyerNavRoute.CheckoutShipping ||
        currentRoute is BuyerNavRoute.CheckoutReview ||
        currentRoute is BuyerNavRoute.CheckoutPayment ||
        currentRoute is BuyerNavRoute.Wishlist ||
        currentRoute is BuyerNavRoute.ProductDetail ||
        currentRoute is BuyerNavRoute.CategoryProducts ||
        currentRoute is BuyerNavRoute.SectionProducts ||
        currentRoute is BuyerNavRoute.OrderConfirmation ||
        currentRoute is BuyerNavRoute.OrderDetail ||
        currentRoute is BuyerNavRoute.Addresses ||
        currentRoute is BuyerNavRoute.WriteReview ||
        currentRoute is BuyerNavRoute.Settings

    BackHandler {
        when {
            navStack.isNotEmpty() -> pop()
            selectedTab != BuyerTab.Home -> selectedTab = BuyerTab.Home
            else -> {
                val now = System.currentTimeMillis()
                if (now - lastBackPress < 2_000) {
                    (context as? android.app.Activity)?.finish()
                } else {
                    lastBackPress = now
                    Toast.makeText(context, context.getString(R.string.press_back_again), Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    Box(Modifier.fillMaxSize()) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = Color.White,
        topBar = {
            if (currentRoute !is BuyerNavRoute.Wishlist) {
                BuyerTopBar(
                    badges = badges,
                    locationLabel = locationLabel,
                    locationLoading = locationLoading,
                    userDisplayName = userDisplayName,
                    currencyCode = currencyCode,
                    currencyLoading = currencyLoading,
                    onCurrencyChange = { code ->
                        scope.launch {
                            currencyLoading = true
                            withContext(Dispatchers.IO) { CurrencyPreferencesRepository.save(code) }
                            currencyCode = code
                            currencyLoading = false
                        }
                    },
                    cartBounceTrigger = cartBounceTrigger,
                    onCartPositioned = { flyToCartController.cartCenter = it },
                    onLogoClick = {
                        navStack = emptyList()
                        selectedTab = BuyerTab.Home
                    },
                    onLocationClick = ::requestLocation,
                    onCartClick = { push(BuyerNavRoute.Cart) },
                    onWishlistClick = { push(BuyerNavRoute.Wishlist) },
                    onProfileClick = {
                        navStack = emptyList()
                        selectedTab = BuyerTab.Profile
                    },
                    onOrdersClick = {
                        navStack = emptyList()
                        selectedTab = BuyerTab.Orders
                    },
                    onNotificationsClick = {
                        navStack = emptyList()
                        selectedTab = BuyerTab.Notifications
                    },
                    onBecomeSellerClick = { ExternalBrowser.open(context, SupabaseConfig.sellerPortalUrl) },
                    onHelpClick = { ExternalBrowser.open(context, "${SupabaseConfig.publicAppUrl}/contact") },
                    onLogoutClick = onLogout,
                )
            }
        },
        bottomBar = {
            if (showBottomBar) {
                BuyerBottomNav(
                    selectedTab = selectedTab,
                    badges = badges,
                    onTabSelected = { tab ->
                        navStack = emptyList()
                        selectedTab = tab
                    },
                )
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            when (val route = currentRoute) {
                is BuyerNavRoute.CategoryProducts -> CategoryProductsScreen(
                    session = session,
                    categoryRef = route.categoryRef,
                    destinationCountry = destinationCountry,
                    flyToCartController = flyToCartController,
                    onHome = {
                        navStack = emptyList()
                        selectedTab = BuyerTab.Home
                    },
                    onCategoryClick = { push(BuyerNavRoute.CategoryProducts(it)) },
                    onProductClick = { push(BuyerNavRoute.ProductDetail(it)) },
                    onRefreshBadges = ::refreshBadges,
                )
                is BuyerNavRoute.SectionProducts -> SectionProductsScreen(
                    session = session,
                    sectionSlug = route.section,
                    destinationCountry = destinationCountry,
                    flyToCartController = flyToCartController,
                    onHome = {
                        navStack = emptyList()
                        selectedTab = BuyerTab.Home
                    },
                    onProductClick = { push(BuyerNavRoute.ProductDetail(it)) },
                    onRefreshBadges = ::refreshBadges,
                )
                is BuyerNavRoute.ProductDetail -> ProductDetailScreen(
                    session = session,
                    productId = route.productId,
                    destinationCountry = destinationCountry,
                    flyToCartController = flyToCartController,
                    onRefreshBadges = ::refreshBadges,
                    onHome = {
                        navStack = emptyList()
                        selectedTab = BuyerTab.Home
                    },
                    onProductClick = { push(BuyerNavRoute.ProductDetail(it)) },
                    onBuyNow = {
                        push(BuyerNavRoute.Cart)
                    },
                    onWriteReview = { id, name ->
                        push(BuyerNavRoute.WriteReview(id, name))
                    },
                    onManageAddresses = { push(BuyerNavRoute.Addresses) },
                )
                BuyerNavRoute.Cart -> BuyerCartScreen(
                    session = session,
                    destinationCountry = destinationCountry,
                    displayCurrencyCode = currencyCode,
                    onCheckout = { push(BuyerNavRoute.CheckoutShipping) },
                    onProductClick = { push(BuyerNavRoute.ProductDetail(it)) },
                    onContinueShopping = {
                        pop()
                        selectedTab = BuyerTab.Home
                    },
                )
                BuyerNavRoute.Wishlist -> BuyerWishlistScreen(
                    session = session,
                    destinationCountry = destinationCountry,
                    onBack = ::pop,
                    onProductClick = { push(BuyerNavRoute.ProductDetail(it)) },
                    onContinueShopping = {
                        navStack = emptyList()
                        selectedTab = BuyerTab.Home
                    },
                )
                BuyerNavRoute.CheckoutShipping -> CheckoutShippingScreen(
                    session = session,
                    onBack = ::pop,
                    onManageAddresses = { push(BuyerNavRoute.Addresses) },
                    onContinue = { address ->
                        checkoutAddress = address
                        checkoutShippingTier = ShippingTier.Standard
                        push(BuyerNavRoute.CheckoutReview)
                    },
                )
                BuyerNavRoute.CheckoutReview -> checkoutAddress?.let { address ->
                    CheckoutReviewScreen(
                        session = session,
                        shippingAddress = address,
                        initialTier = checkoutShippingTier,
                        onChangeAddress = {
                            pop()
                        },
                        onBackToCart = {
                            navStack = navStack.filterNot {
                                it is BuyerNavRoute.CheckoutShipping ||
                                    it is BuyerNavRoute.CheckoutReview ||
                                    it is BuyerNavRoute.CheckoutPayment
                            }
                            checkoutAddress = null
                            checkoutShippingTier = ShippingTier.Standard
                            push(BuyerNavRoute.Cart)
                        },
                        onProceedToPayment = { tier ->
                            checkoutShippingTier = tier
                            push(BuyerNavRoute.CheckoutPayment)
                        },
                    )
                }
                BuyerNavRoute.CheckoutPayment -> checkoutAddress?.let { address ->
                    CheckoutPaymentScreen(
                        session = session,
                        shippingAddress = address,
                        shippingTier = checkoutShippingTier,
                        onBack = ::pop,
                        onViewReview = {
                            navStack = navStack.filter { it !is BuyerNavRoute.CheckoutPayment }
                        },
                        onOrderPlaced = { orderId ->
                            navStack = listOf(BuyerNavRoute.OrderConfirmation(orderId))
                            checkoutAddress = null
                            checkoutShippingTier = ShippingTier.Standard
                            refreshBadges()
                        },
                    )
                }
                is BuyerNavRoute.OrderConfirmation -> OrderConfirmationScreen(
                    session = session,
                    orderId = route.orderId,
                    onContinueShopping = {
                        navStack = emptyList()
                        selectedTab = BuyerTab.Home
                    },
                    onViewOrders = {
                        navStack = emptyList()
                        selectedTab = BuyerTab.Orders
                    },
                    onContactSupport = {
                        ExternalBrowser.open(context, "${SupabaseConfig.publicAppUrl}/contact")
                    },
                )
                is BuyerNavRoute.OrderDetail -> OrderDetailScreen(
                    session = session,
                    orderId = route.orderId,
                    onBack = ::pop,
                    onWriteReview = { id, name -> push(BuyerNavRoute.WriteReview(id, name)) },
                )
                BuyerNavRoute.Settings -> BuyerSettingsScreen(session = session, onBack = ::pop)
                BuyerNavRoute.Addresses -> BuyerAddressesScreen(session = session, onBack = ::pop)
                is BuyerNavRoute.WriteReview -> WriteReviewScreen(
                    session = session,
                    productId = route.productId,
                    productName = route.productName,
                    destinationCountry = destinationCountry,
                    onBack = ::pop,
                    onSubmitted = ::pop,
                )
                null -> when (selectedTab) {
                    BuyerTab.Home -> BuyerHomeScreen(
                        session = session,
                        destinationCountry = destinationCountry,
                        displayCurrencyCode = currencyCode,
                        flyToCartController = flyToCartController,
                        onRefreshBadges = ::refreshBadges,
                        onProductClick = { push(BuyerNavRoute.ProductDetail(it)) },
                        onCategoryClick = { push(BuyerNavRoute.CategoryProducts(it)) },
                        onSectionClick = { section ->
                            push(BuyerNavRoute.SectionProducts(section.toSlug()))
                        },
                    )
                    BuyerTab.Orders -> BuyerOrdersScreen(
                        session = session,
                        onOrderClick = { push(BuyerNavRoute.OrderDetail(it)) },
                        onNavigateCart = { push(BuyerNavRoute.Cart) },
                        onWriteReview = { id, name -> push(BuyerNavRoute.WriteReview(id, name)) },
                        onRefreshBadges = ::refreshBadges,
                    )
                    BuyerTab.Notifications -> BuyerNotificationsScreen(
                        session = session,
                        onOrderClick = { push(BuyerNavRoute.OrderDetail(it)) },
                    )
                    BuyerTab.Profile -> BuyerProfileScreen(
                        session = session,
                        onLogout = onLogout,
                        onOpenSettings = { push(BuyerNavRoute.Settings) },
                        onOpenAddresses = { push(BuyerNavRoute.Addresses) },
                    )
                }
                BuyerNavRoute.Home -> Unit
            }
        }
    }
        FlyToCartOverlay(
            controller = flyToCartController,
            onBounceCart = { cartBounceTrigger++ },
        )
    }
}

