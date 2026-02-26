import aiofiles
import io
import pandas as pd


async def read_csv_async(path: str) -> pd.DataFrame:
    """
    Asynchronously reads a CSV file without blocking the event loop.
    """
    async with aiofiles.open(path, "rb") as f:
        content = await f.read()

    return pd.read_csv(io.BytesIO(content))
