import threading
import time
from typing import Callable, Dict, List, Tuple


class LoginThrottle:
    """Blocks a (client, account) pair after too many recent failed logins.

    State is per process, which is enough to slow password guessing without
    adding infrastructure.
    """

    def __init__(
        self,
        max_failures: int = 5,
        window_seconds: int = 900,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self._clock = clock
        self._failures: Dict[Tuple[str, str], List[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: Tuple[str, str]) -> List[float]:
        cutoff = self._clock() - self.window_seconds
        recent = [stamp for stamp in self._failures.get(key, []) if stamp > cutoff]
        if recent:
            self._failures[key] = recent
        else:
            self._failures.pop(key, None)
        return recent

    def retry_after(self, ip: str, username: str) -> int:
        """Seconds until another attempt is allowed; 0 when not blocked."""
        key = (ip, username)
        with self._lock:
            recent = self._recent(key)
            if len(recent) < self.max_failures:
                return 0
            return max(1, int(recent[0] + self.window_seconds - self._clock()))

    def record_failure(self, ip: str, username: str) -> None:
        key = (ip, username)
        with self._lock:
            self._recent(key)
            self._failures.setdefault(key, []).append(self._clock())

    def reset(self, ip: str, username: str) -> None:
        with self._lock:
            self._failures.pop((ip, username), None)


login_throttle = LoginThrottle()
