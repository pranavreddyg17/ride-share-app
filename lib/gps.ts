// A stationary device may not trigger watchPosition again. Request a fresh fix
// periodically, preserving the device timestamp rather than refreshing old data.
export function watchDevicePosition(
  geo: Geolocation,
  receive: PositionCallback,
  onError: PositionErrorCallback,
) {
  let stopped = false;
  let lastTimestamp = 0;
  const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };
  const deliver: PositionCallback = (position) => {
    if (stopped || position.timestamp <= lastTimestamp) return;
    lastTimestamp = position.timestamp;
    receive(position);
  };
  const fail: PositionErrorCallback = (error) => {
    if (!stopped) onError(error);
  };
  const watch = geo.watchPosition(deliver, fail, options);
  const timer = setInterval(
    () => geo.getCurrentPosition(deliver, fail, options),
    15000,
  );
  return () => {
    stopped = true;
    geo.clearWatch(watch);
    clearInterval(timer);
  };
}
