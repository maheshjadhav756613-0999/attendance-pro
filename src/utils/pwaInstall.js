// ============================================
// PWA Install Prompt Handler
// ============================================

let deferredPrompt = null;

// ✅ Chrome ने auto prompt द्यायचं तयार केलं तर event fire होतो
export const initInstallPrompt = () => {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Browser चा default prompt रोखा
    e.preventDefault();
    // Event save कर — नंतर manually trigger करू
    deferredPrompt = e;
    console.log('✅ PWA Install available');

    // Custom event fire कर — component ला कळव
    window.dispatchEvent(new Event('pwa-install-available'));
  });

  // Install झाल्यावर
  window.addEventListener('appinstalled', () => {
    console.log('✅ PWA Installed successfully!');
    deferredPrompt = null;
    window.dispatchEvent(new Event('pwa-installed'));
  });
};

// ✅ Install prompt trigger कर
export const showInstallPrompt = async () => {
  if (!deferredPrompt) {
    console.log('❌ Install prompt not available');
    return { success: false, message: 'Install prompt available नाही' };
  }

  // Prompt दाखव
  deferredPrompt.prompt();

  // User ने काय निवडलं ते बघ
  const { outcome } = await deferredPrompt.userChoice;
  console.log('Install outcome:', outcome);

  // Prompt वापरला — reset कर
  deferredPrompt = null;

  return { success: outcome === 'accepted', outcome };
};

// ✅ Install available आहे का?
export const isInstallAvailable = () => {
  return !!deferredPrompt;
};

// ✅ Already installed आहे का?
export const isPWAInstalled = () => {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  );
};