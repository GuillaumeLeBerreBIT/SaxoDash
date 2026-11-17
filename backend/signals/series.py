import sys
from array import array
from dataclasses import dataclass


@dataclass(frozen=True)
class Series:
    dates: list
    opens: list
    highs: list
    lows: list
    closes: list
    volumes: list

    def __len__(self):
        return len(self.dates)


def from_bars(bars):
    columns = list(zip(*bars)) if bars else [(), (), (), (), (), ()]
    dates, opens, highs, lows, closes, volumes = columns
    return Series(
        [sys.intern(day) for day in dates],
        *(array('d', column) for column in (opens, highs, lows, closes)),
        array('d', [volume or 0 for volume in volumes]),
    )
