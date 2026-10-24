from typing import Annotated

from pydantic import Field

Finite = Annotated[float, Field(allow_inf_nan=False)]
Euros = Annotated[float, Field(ge=0, allow_inf_nan=False)]
RowId = Annotated[int, Field(ge=1)]


def at_most(maximum):
    return Annotated[int, Field(ge=1, le=maximum)]
