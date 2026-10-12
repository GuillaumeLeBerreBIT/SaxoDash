from bisect import bisect_right
from dataclasses import dataclass
from datetime import date


@dataclass
class Series:
    days: list
    closes: list

    @classmethod
    def from_rows(cls, rows):
        return cls([date.fromisoformat(day) for day, _ in rows], [close for _, close in rows])

    def __bool__(self):
        return bool(self.days)

    def _index(self, day):
        return bisect_right(self.days, day) - 1

    def at(self, day):
        index = self._index(day)
        return self.closes[index] if index >= 0 else None

    def day_at(self, day):
        index = self._index(day)
        return self.days[index] if index >= 0 else None

    def after(self, day):
        index = bisect_right(self.days, day)
        return self.days[index] if index < len(self.days) else None

    def between(self, first, last):
        return self.days[bisect_right(self.days, first):bisect_right(self.days, last)]
