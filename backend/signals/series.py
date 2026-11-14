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
    dates, opens, highs, lows, closes, volumes = (list(column) for column in columns)
    return Series(dates, opens, highs, lows, closes, [volume or 0 for volume in volumes])
