/**
 * Fly-to-cart animation: creates a thumbnail clone of the product image
 * and animates it toward the cart icon, then triggers a bounce.
 * Returns a Promise that resolves when the flight completes.
 */
export function flyToCart(
  productEl: HTMLElement,
  cartEl: HTMLElement,
): Promise<void> {
  return new Promise((resolve) => {
    const productRect = productEl.getBoundingClientRect();
    const cartRect = cartEl.getBoundingClientRect();

    // Build a fresh <img> instead of cloneNode to avoid inherited
    // Tailwind classes (w-full, h-full, relative) that fight inline styles.
    const clone = document.createElement('img');
    const src = (productEl as HTMLImageElement).currentSrc
      || (productEl as HTMLImageElement).src
      || '';
    clone.src = src;
    clone.style.cssText = [
      `position: fixed`,
      `left: ${productRect.left}px`,
      `top: ${productRect.top}px`,
      `width: ${productRect.width}px`,
      `height: ${productRect.height}px`,
      `z-index: 999999`,
      `pointer-events: none`,
      `border-radius: 12px`,
      `object-fit: contain`,
      `opacity: 1`,
      `background: transparent`,
    ].join('; ');

    document.body.appendChild(clone);

    // Force a reflow so the browser registers the initial position
    // BEFORE we apply the transition + target values.
    clone.getBoundingClientRect();

    // Now enable the transition and set the target
    clone.style.transition = 'all 0.8s cubic-bezier(0.65, -0.2, 0.25, 1.2)';
    clone.style.left = `${cartRect.left + cartRect.width / 2 - 10}px`;
    clone.style.top = `${cartRect.top + cartRect.height / 2 - 10}px`;
    clone.style.width = '20px';
    clone.style.height = '20px';
    clone.style.opacity = '0';

    setTimeout(() => {
      clone.remove();
      cartEl.classList.add('cart-bounce');
      setTimeout(() => cartEl.classList.remove('cart-bounce'), 350);
      resolve();
    }, 850);
  });
}
