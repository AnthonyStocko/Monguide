export function onAppActive(listener) {
  const onChange = () => {
    if (document.visibilityState === 'visible') listener();
  };
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

export function onAppUrlOpen() {
  return () => {};
}
