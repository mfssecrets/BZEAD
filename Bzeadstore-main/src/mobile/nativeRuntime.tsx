import { App as CapacitorApp } from '@capacitor/app';
import { Dialog } from '@capacitor/dialog';
import { useEffect, useRef, useState } from 'react';
import { isNativeAndroid, isNativeIOS } from './nativePlatform';

const ROOT_PATHS = new Set(['/', '/seller/dashboard', '/admin']);

function isRootPath(pathname: string): boolean {
  return ROOT_PATHS.has(pathname);
}

export function useNativeBackButton(pathname: string) {
  const latestPathRef = useRef(pathname);

  useEffect(() => {
    latestPathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!isNativeAndroid) return;

    let active = true;
    let removeListener: (() => void) | null = null;

    const register = async () => {
      try {
        const listener = await CapacitorApp.addListener('backButton', async () => {
          const currentPath = latestPathRef.current;
          const shouldGoBack = window.history.length > 1 && !isRootPath(currentPath);

          if (shouldGoBack) {
            window.history.back();
            return;
          }

          const decision = await Dialog.confirm({
            title: 'Exit BZEAD',
            message: 'Do you want to close the app?',
            okButtonTitle: 'Exit',
            cancelButtonTitle: 'Stay',
          });

          if (decision.value) {
            await CapacitorApp.exitApp();
          }
        });

        if (!active) {
          await listener.remove();
          return;
        }

        removeListener = () => {
          void listener.remove();
        };
      } catch {
        // Keep web-history fallback only when the native App plugin is unavailable.
      }
    };

    void register();

    return () => {
      active = false;
      if (removeListener) removeListener();
    };
  }, []);

  useEffect(() => {
    if (!isNativeAndroid) return;

    const onPopState = () => {
      const currentPath = latestPathRef.current;
      if (!isRootPath(currentPath)) return;

      ensureRootBackGuardEntry();
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!isNativeAndroid) return;
    if (!isRootPath(pathname)) return;

    ensureRootBackGuardEntry();
  }, [pathname]);

  function ensureRootBackGuardEntry() {
    const currentState = (window.history.state ?? {}) as Record<string, unknown>;
    if (currentState.bzeadBackGuard === true) return;

    window.history.pushState(
      {
        ...currentState,
        bzeadBackGuard: true,
      },
      '',
      window.location.href,
    );
  }
}

interface NativePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
}

interface NativePullToRefreshState {
  enabled: boolean;
  pullDistance: number;
  isRefreshing: boolean;
}

export function useNativePullToRefresh({ onRefresh }: NativePullToRefreshOptions): NativePullToRefreshState {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startYRef = useRef(0);
  const draggingRef = useRef(false);
  const maxPullRef = useRef(0);
  const refreshingRef = useRef(false);
  const refreshHandlerRef = useRef(onRefresh);

  useEffect(() => {
    refreshHandlerRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    refreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  useEffect(() => {
    if (!isNativeIOS) return;

    const threshold = 90;
    const maxDistance = 130;

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current) return;
      if (event.touches.length !== 1) return;
      if (window.scrollY > 0) return;

      draggingRef.current = true;
      startYRef.current = event.touches[0].clientY;
      maxPullRef.current = 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!draggingRef.current) return;

      const delta = event.touches[0].clientY - startYRef.current;
      if (delta <= 0) {
        setPullDistance(0);
        return;
      }

      const damped = Math.min(maxDistance, delta * 0.45);
      maxPullRef.current = damped;
      setPullDistance(damped);

      if (damped > 2) {
        event.preventDefault();
      }
    };

    const finishPull = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setPullDistance(0);

      if (maxPullRef.current < threshold || refreshingRef.current) return;

      setIsRefreshing(true);
      refreshingRef.current = true;

      Promise.resolve(refreshHandlerRef.current())
        .catch(() => {
          // Fail silently: pull-to-refresh should never hard-fail the UI.
        })
        .finally(() => {
          refreshingRef.current = false;
          setIsRefreshing(false);
        });
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', finishPull);
    window.addEventListener('touchcancel', finishPull);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', finishPull);
      window.removeEventListener('touchcancel', finishPull);
    };
  }, []);

  return {
    enabled: isNativeIOS,
    pullDistance,
    isRefreshing,
  };
}

interface NativePullToRefreshIndicatorProps {
  enabled: boolean;
  pullDistance: number;
  isRefreshing: boolean;
}

export const NativePullToRefreshIndicator: React.FC<NativePullToRefreshIndicatorProps> = ({
  enabled,
  pullDistance,
  isRefreshing,
}) => {
  if (!enabled && !isRefreshing) return null;
  if (!isRefreshing && pullDistance < 4) return null;

  const progress = Math.min(1, pullDistance / 90);
  const opacity = isRefreshing ? 1 : Math.max(0.2, progress);

  return (
    <div
      className="native-pull-indicator"
      style={{
        opacity,
        transform: `translate(-50%, ${Math.min(56, pullDistance * 0.65)}px)`,
      }}
      aria-hidden
    >
      <div className={`native-pull-spinner ${isRefreshing ? 'native-pull-spinner--active' : ''}`} />
      <span className="native-pull-label">{isRefreshing ? 'Refreshing' : 'Pull to refresh'}</span>
    </div>
  );
};
