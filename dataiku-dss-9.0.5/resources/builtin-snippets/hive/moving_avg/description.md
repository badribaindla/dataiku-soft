`moving_avg(period, value, window, divisor, position)`

Compute the moving average on a column for a particular position.

Example:

    p   v
    4   40
    5   60
    6   0
    7   10
    8   20
    9   50
    10  100
    11  10

    moving_avg(p, v, 4, 2, 11) return:
        mean(10 * 1/(2^1) + 100 * 1/(2^2) +  50 * 1/(2^3) +  20 * 1/(2^4))

    moving_avg(p, v, 2, 3, 11) return:
        mean(10 * 1/(3^1) + 100 * 1/(3^2))

    If a p is missing the value is put at 0.
    moving_avg(p, v, 2, 3, 12) return:
        mean(0 * 1/(3^1) + 10 * 1/(3^2))
