const currentType = () => (navigator.onLine ? 'unknown' : 'none');

export async function getConnectionType() {
  return currentType();
}

export function onConnectionChange(listener) {
  const onChange = () => listener(currentType());
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}
