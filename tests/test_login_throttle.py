from app.utils.login_throttle import LoginThrottle


def test_blocks_after_max_failures_and_recovers_after_window():
    now = [1000.0]
    throttle = LoginThrottle(max_failures=3, window_seconds=60, clock=lambda: now[0])

    for _ in range(2):
        throttle.record_failure("1.1.1.1", "a@x.gov")
    assert throttle.retry_after("1.1.1.1", "a@x.gov") == 0

    throttle.record_failure("1.1.1.1", "a@x.gov")
    assert throttle.retry_after("1.1.1.1", "a@x.gov") > 0
    assert throttle.retry_after("2.2.2.2", "a@x.gov") == 0

    now[0] += 61
    assert throttle.retry_after("1.1.1.1", "a@x.gov") == 0


def test_reset_clears_failures():
    throttle = LoginThrottle(max_failures=1)
    throttle.record_failure("ip", "user")
    assert throttle.retry_after("ip", "user") > 0
    throttle.reset("ip", "user")
    assert throttle.retry_after("ip", "user") == 0
